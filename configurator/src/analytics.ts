// Anonimowa atrybucja i licznik wejść (bez ciasteczek śledzących i bez danych osobowych).
// Pierwsze źródło wejścia zapamiętywane lokalnie: utm_source / ref / landing / wyszukiwarka / social / direct.

const KEY = 'ss_src';

function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** Nazwa źródła z adresu odsyłającego (tylko domena, bez ścieżki). */
function fromReferrer(ref: string): string | null {
  if (!ref) return null;
  let host = '';
  try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch { return null; }
  if (!host || host === location.hostname) return null;
  const known: Array<[RegExp, string]> = [
    [/google\./, 'google'], [/bing\./, 'bing'], [/duckduckgo\./, 'duckduckgo'], [/facebook\.|fb\./, 'facebook'],
    [/instagram\./, 'instagram'], [/linkedin\./, 'linkedin'], [/youtube\./, 'youtube'], [/pinterest\./, 'pinterest'], [/tiktok\./, 'tiktok'],
  ];
  for (const [re, name] of known) if (re.test(host)) return name;
  return `ref:${host}`.slice(0, 60);
}

/** Źródło pierwszego wejścia (first touch) — zapisywane raz, potem stałe dla tej przeglądarki. */
export function firstTouchSource(): string {
  const ls = store();
  const saved = ls?.getItem(KEY);
  if (saved) return saved;
  const q = new URLSearchParams(location.search);
  const src = q.get('utm_source') ? `utm:${q.get('utm_source')}` : q.get('ref') ? `ref:${q.get('ref')}` : q.get('from') === 'landing' ? 'landing' : fromReferrer(document.referrer) ?? 'direct';
  const clean = src.toLowerCase().replace(/[^a-z0-9._:-]/g, '').slice(0, 60) || 'direct';
  try { ls?.setItem(KEY, clean); } catch { /* tryb prywatny */ }
  return clean;
}

function post(body: Record<string, string | undefined>): void {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.('/api/studio/events', new Blob([data], { type: 'application/json' }))) return;
  } catch { /* fallback niżej */ }
  void fetch('/api/studio/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: data, keepalive: true }).catch(() => {});
}

/** Jedno wejście na sesję karty dla danej strony. */
export function trackVisit(page: 'landing' | 'configurator'): void {
  const k = `ss_visit_${page}`;
  try {
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
  } catch { /* bez sessionStorage liczymy każde wejście */ }
  post({ type: 'visit', page, source: firstTouchSource() });
}

export function trackLandingShape(shape: string): void {
  post({ type: 'landing_shape', page: 'landing', source: firstTouchSource(), detail: shape });
}

/** Kanał, którym przyszedł udostępniony link (?via=email|sms|link). */
export function shareVia(): string {
  const v = new URLSearchParams(location.search).get('via');
  return v === 'email' || v === 'sms' ? v : 'link';
}
