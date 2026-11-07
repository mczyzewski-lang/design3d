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
