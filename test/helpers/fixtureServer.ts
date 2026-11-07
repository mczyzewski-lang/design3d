// Lokalny serwer fixture'ów: rozpoznaje „stronę firmy” po nagłówku Host (*.test -> test/fixtures/sites/<host>/).
// Dodatkowo udaje API Brave Search pod hostem search.test.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SITES_DIR = path.join(here, '..', 'fixtures', 'sites');

export interface FixtureServer {
  port: number;
  url: (host: string, p?: string) => string;
  requests: Array<{ host: string; path: string; ua: string }>;
  searchQueries: string[];
  aiRequests: Array<{ headers: http.IncomingHttpHeaders; body: any }>;
  close: () => Promise<void>;
}

export interface SearchMock {
  /** wyniki zwracane dla zapytań (po {{PORT}} podmieniany jest port) */
  results: (query: string, offset: number) => Array<{ url: string; title: string; description: string }>;
}

export async function startFixtureServer(search?: SearchMock): Promise<FixtureServer> {
  const requests: FixtureServer['requests'] = [];
  const searchQueries: string[] = [];
  const aiRequests: FixtureServer['aiRequests'] = [];
  let port = 0;
  const server = http.createServer(async (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const u = new URL(req.url ?? '/', `http://${host}`);
    requests.push({ host, path: u.pathname, ua: String(req.headers['user-agent'] ?? '') });

    // atrapa Claude Messages API (bez płatnych wywołań w testach)
    if (u.pathname === '/v1/messages' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      aiRequests.push({ headers: req.headers, body });
      const urls = [...String(body.messages?.[0]?.content ?? '').matchAll(/— (http\S+)/g)].map((m) => m[1]);
      const analysis = {
        category: 'manufacturer', stair_types: ['drewniane', 'samonośne'], custom_made: true, has_own_visualizations: true,
        has_online_configurator: false, configurator_quality: 'none', has_gallery: true, online_quote: true,
        configurator_3d_potential: 'high', confidence: 0.92, reasoning: 'Własna stolarnia i produkcja schodów na wymiar; brak konfiguratora.',
        source_urls: [...urls.slice(0, 2), 'https://zmyslony.example/'],
      };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'text', text: JSON.stringify(analysis) }],
        usage: { input_tokens: 3000, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }));
      return;
    }

    if (host === 'search.test') {
      if (req.headers['x-subscription-token'] !== 'test-key') {
        res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorized"}');
        return;
      }
      const q = u.searchParams.get('q') ?? '';
      searchQueries.push(q);
      const results = (search?.results(q, Number(u.searchParams.get('offset') ?? 0)) ?? []).map((r) => ({ ...r, url: r.url.replace('{{PORT}}', String(port)) }));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ web: { results } }));
      return;
    }

    const dir = path.join(SITES_DIR, host);
    if (!host.endsWith('.test') || !fs.existsSync(dir)) {
      res.writeHead(404).end('no such site');
      return;
    }
    let cfg: any = {};
    const cfgFile = path.join(dir, '_config.json');
    if (fs.existsSync(cfgFile)) cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8').replace(/\{\{PORT\}\}/g, String(port)));
    if (cfg.delayMs && u.pathname !== '/robots.txt') await new Promise((r) => setTimeout(r, cfg.delayMs));
    if (cfg.redirect) {
      res.writeHead(301, { location: cfg.redirect + u.pathname.replace(/^\//, '') }).end();
      return;
    }
    let rel = decodeURIComponent(u.pathname);
    if (rel.includes('..')) {
      res.writeHead(400).end();
      return;
    }
    const candidates = rel === '/' ? ['index.html'] : [rel.slice(1), rel.slice(1) + '.html', path.join(rel.slice(1), 'index.html'), rel.replace(/\/$/, '').slice(1) + '.html'];
    const file = candidates.map((c) => path.join(dir, c)).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file || path.basename(file) === '_config.json') {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>404</h1>');
      return;
    }
    const ext = path.extname(file);
    const type = ext === '.txt' ? 'text/plain' : ext === '.js' ? 'application/javascript' : 'text/html; charset=utf-8';
    const body = fs.readFileSync(file, 'utf8').replace(/\{\{PORT\}\}/g, String(port));
    res.writeHead(cfg.status && u.pathname !== '/robots.txt' ? cfg.status : 200, { 'content-type': type, ...(cfg.headers ?? {}) }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as any).port;
  return {
    port,
    url: (host, p = '/') => `http://${host}:${port}${p}`,
    requests,
    searchQueries,
    aiRequests,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
