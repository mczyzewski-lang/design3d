import { getDomain, getHostname } from 'tldts';
import net from 'node:net';

/** Normalizuje wejście użytkownika (np. "www.firma.pl", "firma.pl/kontakt") do pełnego URL. */
export function normalizeUrl(input: string): string | null {
  let s = (input ?? '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** Domena rejestrowalna (eTLD+1), np. "sklep.schody-kowalski.com.pl" -> "schody-kowalski.com.pl". */
export function registrableDomain(urlOrHost: string): string | null {
  const host = (urlOrHost.includes('://') ? getHostname(urlOrHost) : urlOrHost.split('/')[0].split(':')[0])?.toLowerCase();
  if (!host) return null;
  if (net.isIP(host) || host === 'localhost') return host;
  const d = getDomain(host, { allowPrivateDomains: false });
  return (d ?? host.replace(/^www\./, '')).toLowerCase();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function sameSite(a: string, b: string): boolean {
  const da = registrableDomain(a);
  return !!da && da === registrableDomain(b);
}

/** Usuwa fragment, sortuje nic — tylko kanonizacja na potrzeby cache/dedup URL. */
export function canonicalPageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    // odrzuć typowe parametry śledzące
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|_ga)/i.test(p)) u.searchParams.delete(p);
    }
    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '/');
    return u.toString();
  } catch {
    return url;
  }
}
