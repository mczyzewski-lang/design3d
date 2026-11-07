// Link do konfiguracji: tylko różnice względem ustawień domyślnych, base64url w fragmencie URL (#c=...).
import { DEFAULT_CONFIG, mergeWithDefaults } from './defaults';
import type { Config } from './types';

function diff(a: any, b: any): any {
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(a)) {
      const d = diff(a[k], b?.[k]);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return a === b ? undefined : a;
}

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
};

export function encodeConfig(c: Config): string {
  return toB64Url(JSON.stringify(diff(c, DEFAULT_CONFIG) ?? {}));
}

export function decodeConfig(code: string): Config | null {
  try {
    return mergeWithDefaults(JSON.parse(fromB64Url(code)));
  } catch {
    return null;
  }
}

export function shareUrl(c: Config, base: string): string {
  return `${base.split('#')[0]}#c=${encodeConfig(c)}`;
}

export function configFromHash(hash: string): Config | null {
  const m = /[#&]c=([A-Za-z0-9_-]+)/.exec(hash);
  return m ? decodeConfig(m[1]) : null;
}
