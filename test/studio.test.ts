// Stair Studio API: zapis z wersjami, udostępnianie, bramka dla firm wykonawczych, komentarze 3D.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { setupTestEnv } from './helpers/env.ts';
import { createApp } from '../src/app.ts';
import { get } from '../src/db/index.ts';

let server: Server;
let base = '';

/** Klient z własnym „ciasteczkowym słoikiem” — symuluje osobną przeglądarkę. */
function browser() {
  const jar = new Map<string, string>();
  return async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const res = await fetch(base + path, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, cookies: res.headers.getSetCookie() };
  };
}

before(async () => {
  setupTestEnv();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}/api/studio`;
});
after(() => server.close());

const CFG = { version: 1, room: { height: 3.5 }, stairs: { shape: 'U' } };
let projectId = '';
let shareToken = '';
const owner = browser();
const firm = browser();
const stranger = browser();

test('zapis tworzy projekt i ciasteczko właściciela (HttpOnly)', async () => {
  const r = await owner('/projects', { method: 'POST', body: { name: 'Dom Kowalskich', config: CFG } });
  assert.equal(r.status, 201);
  assert.equal(r.body.currentVersion, 1);
  assert.ok(r.cookies.some((c) => c.startsWith('ss_owner=') && /HttpOnly/.test(c) && /SameSite=Lax/.test(c)));
  projectId = r.body.id;
  const list = await owner('/projects');
  assert.equal(list.body.length, 1);
  assert.equal((await stranger(`/projects/${projectId}`)).status, 403);
});

test('„Zapisz” nadpisuje bieżącą wersję, „Zapisz jako nową wersję” dodaje kolejną', async () => {
  const s1 = await owner(`/projects/${projectId}`, { method: 'PUT', body: { config: { ...CFG, room: { height: 3.0 } } } });
  assert.equal(s1.body.versions.length, 1);
  assert.equal(s1.body.config.room.height, 3.0);
  const s2 = await owner(`/projects/${projectId}/versions`, { method: 'POST', body: { config: { ...CFG, stairs: { shape: 'S' } }, label: 'Kręcone' } });
  assert.equal(s2.status, 201);
  assert.equal(s2.body.currentVersion, 2);
  assert.deepEqual(s2.body.versions.map((v: any) => v.label), ['Kręcone', 'Wersja 1']);
  const v1 = await owner(`/projects/${projectId}/versions/1`);
  assert.equal(v1.body.config.room.height, 3.0);
  // zapis na starszej wersji nadpisuje ją i ustawia jako bieżącą
  const s3 = await owner(`/projects/${projectId}`, { method: 'PUT', body: { config: { ...CFG, room: { height: 3.2 } }, version: 1 } });
  assert.equal(s3.body.currentVersion, 1);
  assert.equal(s3.body.versions.length, 2);
  assert.equal((await stranger(`/projects/${projectId}`, { method: 'PUT', body: { config: CFG } })).status, 403);
});

test('udostępnienie: link stały, bez dostępu — tylko podgląd do rozmycia', async () => {
  const sh = await owner(`/projects/${projectId}/share`, { method: 'POST' });
  shareToken = sh.body.token;
  assert.equal(sh.body.path, `/konfigurator/p/${shareToken}`);
  assert.equal((await owner(`/projects/${projectId}/share`, { method: 'POST' })).body.token, shareToken);
  const asOwner = await owner(`/shares/${shareToken}`);
  assert.equal(asOwner.body.role, 'owner');
  const anon = await firm(`/shares/${shareToken}`);
  assert.equal(anon.body.role, 'none');
  assert.equal(anon.body.projectId, undefined);
  assert.ok(anon.body.config, 'konfiguracja do rozmytego tła');
  assert.equal((await firm(`/shares/${shareToken}/comments`)).status, 401);
  assert.equal((await firm('/shares/nieistnieje')).status, 404);
});

test('rejestracja firmy: walidacja, zgoda, sesja, widoczna dla właściciela', async () => {
  const bad = await firm(`/shares/${shareToken}/contractor`, { method: 'POST', body: { firstName: 'Jan', lastName: '', email: 'x', phone: '12', consent: false } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.errors.length, 4);
  const ok = await firm(`/shares/${shareToken}/contractor`, { method: 'POST', body: { firstName: 'Jan', lastName: 'Stolarz', email: 'Jan@Schody.pl', phone: '+48 600 100 200', consent: true } });
  assert.equal(ok.status, 200);
  assert.ok(ok.cookies.some((c) => c.startsWith('ss_session=') && /HttpOnly/.test(c)));
  const again = await firm(`/shares/${shareToken}`);
  assert.equal(again.body.role, 'contractor');
  assert.equal(again.body.viewer.name, 'Jan Stolarz');
  const c = get(`SELECT * FROM studio_contractors WHERE email = 'jan@schody.pl'`)!;
  assert.match(c.consent_text, /Wyrażam zgodę/);
  const view = await owner(`/projects/${projectId}`);
  assert.equal(view.body.contractors[0].phone, '+48600100200');
});

test('komentarze 3D: właściciel i firma, pozycja w metrach, walidacja', async () => {
  const a = await owner(`/projects/${projectId}/comments`, { method: 'POST', body: { text: 'Czy da się dać dąb wędzony?', pos: { x: 1.2, y: 1.75, z: 0.5 } } });
  assert.equal(a.status, 201);
  assert.deepEqual(a.body.pos, { x: 1.2, y: 1.75, z: 0.5 });
  const b = await firm(`/shares/${shareToken}/comments`, { method: 'POST', body: { text: 'Tak, +8% do ceny stopnic.', pos: { x: 1.3, y: 1.8, z: 0.6 } } });
  assert.equal(b.body.author_name, 'Jan Stolarz');
  assert.equal(b.body.author_role, 'contractor');
  assert.equal((await firm(`/shares/${shareToken}/comments`, { method: 'POST', body: { text: '   ' } })).status, 400);
  const bogus = await firm(`/shares/${shareToken}/comments`, { method: 'POST', body: { text: 'ogólny', pos: { x: 'a' } } });
  assert.equal(bogus.body.pos, null);
  const list = await owner(`/projects/${projectId}/comments`);
  assert.equal(list.body.length, 3);
  const res = await owner(`/projects/${projectId}/comments/${a.body.id}`, { method: 'PATCH', body: { resolved: true } });
  assert.equal(res.body[0].resolved, true);
  assert.equal((await stranger(`/shares/${shareToken}/comments`, { method: 'POST', body: { text: 'spam' } })).status, 401);
});

test('link właściciela przenosi prawa na inne urządzenie', async () => {
  const link = await owner(`/projects/${projectId}/owner-link`, { method: 'POST' });
  const tok = link.body.path.split('#claim=')[1];
  const laptop = browser();
  assert.equal((await laptop('/claim', { method: 'POST', body: { projectId, token: 'zly' } })).status, 403);
  assert.equal((await laptop('/claim', { method: 'POST', body: { projectId, token: tok } })).status, 200);
  assert.equal((await laptop(`/projects/${projectId}`)).status, 200);
  assert.equal((await laptop(`/shares/${shareToken}`)).body.role, 'owner');
});

test('podgląd projektu: zapis tylko przez właściciela, odczyt przez link udostępnienia', async () => {
  // najmniejszy poprawny PNG 1×1 powiększony o metadane, żeby przekroczyć próg 100 B
  const png = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'), Buffer.alloc(120)]);
  const image = `data:image/png;base64,${png.toString('base64')}`;
  assert.equal((await stranger(`/projects/${projectId}/thumbnail`, { method: 'PUT', body: { image } })).status, 403);
  assert.equal((await owner(`/projects/${projectId}/thumbnail`, { method: 'PUT', body: { image: 'data:text/html;base64,PGI+' } })).status, 400);
  assert.equal((await owner(`/projects/${projectId}/thumbnail`, { method: 'PUT', body: { image } })).status, 200);
  const sh = await stranger(`/shares/${shareToken}`);
  assert.ok(sh.body.thumbnail, 'bramka wie, że jest podgląd');
  assert.match(sh.body.leadsText, /zapytania o wyceny/);
  const res = await fetch(`${base}/shares/${shareToken}/thumbnail`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await res.arrayBuffer()).length, png.length);
  assert.equal((await fetch(`${base}/shares/nieistnieje/thumbnail`)).status, 404);
});

test('rejestracja firmy: zgoda na zapytania z okolicy wymaga kodu pocztowego i promienia', async () => {
  const lead = browser();
  const form = { firstName: 'Ewa', lastName: 'Nowak', email: 'ewa@schody-nowak.pl', phone: '601 200 300', consent: true, leads: true };
  const bad = await lead(`/shares/${shareToken}/contractor`, { method: 'POST', body: { ...form, postalCode: '123', radiusKm: 1000 } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.some((e: string) => /kod pocztowy/.test(e)));
  assert.ok(bad.body.errors.some((e: string) => /promień/.test(e)));
  const ok = await lead(`/shares/${shareToken}/contractor`, { method: 'POST', body: { ...form, postalCode: '30 061', radiusKm: '40' } });
  assert.equal(ok.status, 200);
  const row = get(`SELECT leads_opt_in, postal_code, radius_km, leads_consent_text, leads_consent_at FROM studio_contractors WHERE email = ?`, 'ewa@schody-nowak.pl')!;
  assert.equal(row.leads_opt_in, 1);
  assert.equal(row.postal_code, '30-061');
  assert.equal(row.radius_km, 40);
  assert.match(row.leads_consent_text, /bezpłatnie/);
  assert.ok(row.leads_consent_at);
  // bez zaznaczenia: kod i promień nie są wymagane, a wcześniejsza zgoda zostaje wycofana
  const again = await browser()(`/shares/${shareToken}/contractor`, { method: 'POST', body: { ...form, leads: false } });
  assert.equal(again.status, 200);
  assert.equal(get(`SELECT leads_opt_in, postal_code FROM studio_contractors WHERE email = ?`, 'ewa@schody-nowak.pl')!.leads_opt_in, 0);
});

test('źródło projektu, otwarcia linku wg kanału i rejestracja z linku e-mail trafiają do analityki', async () => {
  const p = await owner('/projects', { method: 'POST', body: { name: 'Z landingu', config: CFG, source: 'landing' } });
  assert.equal(get(`SELECT source FROM studio_projects WHERE id = ?`, p.body.id)!.source, 'landing');
  const sh = await owner(`/projects/${p.body.id}/share`, { method: 'POST' });
  const viewer = browser();
  await viewer(`/shares/${sh.body.token}?via=email`);
  await viewer(`/shares/${sh.body.token}?via=sms`);
  await owner(`/shares/${sh.body.token}`); // właściciel nie jest liczony
  assert.equal(get(`SELECT COUNT(*) n FROM studio_events WHERE type = 'share_view' AND project_id = ?`, p.body.id)!.n, 2);
  const reg = await viewer(`/shares/${sh.body.token}/contractor`, { method: 'POST', body: { firstName: 'Piotr', lastName: 'Kowal', email: 'piotr@kowal-schody.pl', phone: '602 300 400', consent: true, via: 'email' } });
  assert.equal(reg.status, 200);
  const c = get(`SELECT source, via, ref_project_id FROM studio_contractors WHERE email = ?`, 'piotr@kowal-schody.pl')!;
  assert.deepEqual({ ...c }, { source: 'share_link', via: 'email', ref_project_id: p.body.id });
});

test('landing: zdarzenia anonimowe i dołączenie wykonawcy wymagające zgody, kodu i promienia', async () => {
  const anon = browser();
  assert.equal((await anon('/events', { method: 'POST', body: { type: 'visit', page: 'landing', source: 'Google<script>' } })).status, 204);
  assert.equal((await anon('/events', { method: 'POST', body: { type: 'landing_shape', page: 'landing', detail: 'L-winders' } })).status, 204);
  assert.equal((await anon('/events', { method: 'POST', body: { type: 'hack', page: 'x' } })).status, 204);
  assert.equal(get(`SELECT source FROM studio_events WHERE type = 'visit' ORDER BY id DESC LIMIT 1`)!.source, 'googlescript');
  assert.equal(get(`SELECT COUNT(*) n FROM studio_events WHERE type = 'hack'`)!.n, 0);
  const form = { firstName: 'Adam', lastName: 'Dąb', email: 'adam@dab-schody.pl', phone: '603 400 500', postalCode: '31-100', radiusKm: 60 };
  const no = await anon('/contractors', { method: 'POST', body: { ...form, leads: false } });
  assert.equal(no.status, 400);
  const ok = await anon('/contractors', { method: 'POST', body: { ...form, leads: true, source: 'landing' } });
  assert.equal(ok.status, 201);
  const row = get(`SELECT source, leads_opt_in, postal_code, consent_text FROM studio_contractors WHERE email = ?`, 'adam@dab-schody.pl')!;
  assert.equal(row.source, 'landing');
  assert.equal(row.leads_opt_in, 1);
  assert.match(row.consent_text, /zapytania o wyceny/);
});

test('„Znajdź wykonawcę”: tylko właściciel, walidacja, liczba wykonawców z obszaru', async () => {
  const body = { name: 'Anna', email: 'anna@example.pl', phone: '', postalCode: '31-500', radiusKm: 30, consent: true };
  assert.equal((await stranger(`/projects/${projectId}/quote-request`, { method: 'POST', body })).status, 403);
  const bad = await owner(`/projects/${projectId}/quote-request`, { method: 'POST', body: { ...body, email: '', postalCode: 'x', consent: false } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.length >= 3);
  const ok = await owner(`/projects/${projectId}/quote-request`, { method: 'POST', body });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.nearby >= 1, 'wykonawca z 31-100 jest w obszarze 31');
});

test('panel admina: statystyki Stair Studio i zmiana statusu zgłoszenia', async () => {
  const adminBase = base.replace('/api/studio', '/api/admin/studio');
  const r = await fetch(`${adminBase}/stats?days=30`);
  assert.equal(r.status, 200);
  const s = await r.json();
  assert.ok(s.totals.projects >= 2);
  assert.ok(s.period.contractors >= 3);
  assert.ok(s.contractorSources.some((x: any) => /e-mail/.test(x.label)));
  assert.ok(s.contractorSources.some((x: any) => x.label === 'landing'));
  assert.ok(s.projectSources.some((x: any) => x.label === 'landing'));
  assert.ok(s.shareViewsVia.some((x: any) => x.label === 'SMS'));
  assert.equal(s.series.length, 30);
  assert.ok(s.quoteRequests[0].matches.some((m: any) => m.email === 'adam@dab-schody.pl'));
  const u = await fetch(`${adminBase}/quote-requests/${s.quoteRequests[0].id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'sent' }) });
  assert.equal(u.status, 200);
  assert.equal(get(`SELECT status FROM studio_quote_requests WHERE id = ?`, s.quoteRequests[0].id)!.status, 'sent');
});
