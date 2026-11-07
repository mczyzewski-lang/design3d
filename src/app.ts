// Aplikacja Express: panel administracyjny + API (bez uruchamiania nasłuchu — patrz server.ts).

import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.ts';
import { apiRouter } from './api/routes.ts';
import { studioRouter } from './studio/routes.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONFIGURATOR_DIST = path.join(here, '..', 'configurator', 'dist');

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** HTTP Basic Auth dla panelu. Bez ustawionego hasła panel jest dostępny tylko z localhost. */
function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!config.adminPassword) {
    const ip = req.socket.remoteAddress ?? '';
    if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return next();
    res.status(403).send('Ustaw ADMIN_PASSWORD, aby udostępnić panel poza localhost.');
    return;
  }
  const h = req.headers.authorization ?? '';
  if (h.startsWith('Basic ')) {
    const [u, ...rest] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
    if (safeEqual(u, config.adminUser) && safeEqual(rest.join(':'), config.adminPassword)) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="design3d admin", charset="UTF-8"');
  res.status(401).send('Wymagane logowanie');
}

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway / reverse proxy: poprawne req.secure i req.ip
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  // Strona główna: publiczny konfigurator 3D schodów (Stair Studio, osobna aplikacja Vite w configurator/)
  app.get('/', (_req, res) => res.redirect('/konfigurator/'));
  app.use('/konfigurator', express.static(CONFIGURATOR_DIST, { index: 'index.html', maxAge: '1h', setHeaders: (res, file) => {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.get(/^\/konfigurator(\/.*)?$/, (_req, res) => {
    const index = path.join(CONFIGURATOR_DIST, 'index.html');
    if (fs.existsSync(index)) res.sendFile(index);
    else res.status(503).send('Konfigurator nie jest zbudowany — uruchom „npm run build”.');
  });
  app.use('/api/studio', studioRouter());
  app.use('/admin', adminAuth, express.static(path.join(here, '..', 'public', 'admin'), { index: 'index.html' }));
  app.use('/api/admin/lead-discovery', adminAuth, apiRouter());
  return app;
}
