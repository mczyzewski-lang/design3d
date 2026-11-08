// Numer telefonu z wyborem prefiksu kraju (domyślnie +48). Wartość wyjściowa: „+48600100200”.
import { useEffect, useState } from 'react';

export const PREFIXES: Array<{ code: string; flag: string; name: string }> = [
  { code: '+48', flag: '🇵🇱', name: 'Polska' },
  { code: '+49', flag: '🇩🇪', name: 'Niemcy' },
  { code: '+44', flag: '🇬🇧', name: 'Wielka Brytania' },
  { code: '+353', flag: '🇮🇪', name: 'Irlandia' },
  { code: '+31', flag: '🇳🇱', name: 'Holandia' },
  { code: '+32', flag: '🇧🇪', name: 'Belgia' },
  { code: '+33', flag: '🇫🇷', name: 'Francja' },
  { code: '+43', flag: '🇦🇹', name: 'Austria' },
  { code: '+420', flag: '🇨🇿', name: 'Czechy' },
  { code: '+421', flag: '🇸🇰', name: 'Słowacja' },
  { code: '+370', flag: '🇱🇹', name: 'Litwa' },
  { code: '+380', flag: '🇺🇦', name: 'Ukraina' },
  { code: '+47', flag: '🇳🇴', name: 'Norwegia' },
  { code: '+46', flag: '🇸🇪', name: 'Szwecja' },
  { code: '+45', flag: '🇩🇰', name: 'Dania' },
  { code: '+39', flag: '🇮🇹', name: 'Włochy' },
  { code: '+34', flag: '🇪🇸', name: 'Hiszpania' },
  { code: '+1', flag: '🇺🇸', name: 'USA / Kanada' },
];

/** Rozbija zapisany numer na prefiks i część krajową (najdłuższe dopasowanie prefiksu). */
export function splitPhone(v: string): { prefix: string; national: string } {
  const d = v.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) {
    const p = [...PREFIXES].sort((a, b) => b.code.length - a.code.length).find((x) => d.startsWith(x.code));
    if (p) return { prefix: p.code, national: d.slice(p.code.length) };
  }
  return { prefix: '+48', national: v.replace(/^\s*\+?48(?=\s*\d{3})/, '').trim() };
}
/** Czy numer wygląda poprawnie: Polska — 9 cyfr, inne kraje — 6–14 cyfr. */
export function phoneValid(full: string): boolean {
  const { prefix, national } = splitPhone(full);
  const n = national.replace(/\D/g, '');
  return prefix === '+48' ? n.length === 9 : n.length >= 6 && n.length <= 14;
}

export function PhoneField({ value, onChange, testId, autoFocus, className = '' }: { value: string; onChange: (full: string) => void; testId?: string; autoFocus?: boolean; className?: string }) {
  const init = splitPhone(value);
  const [prefix, setPrefix] = useState(init.prefix);
  const [national, setNational] = useState(init.national);
  // wartość ustawiona z zewnątrz (np. numer z konta) → odśwież pola
  useEffect(() => {
    const cur = `${prefix}${national.replace(/\D/g, '')}`;
    if (value.replace(/[^\d+]/g, '') !== cur && value) { const s = splitPhone(value); setPrefix(s.prefix); setNational(s.national); }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const emit = (p: string, n: string) => onChange(n.replace(/\D/g, '') ? `${p}${n.replace(/\D/g, '')}` : '');
  return (
    <div className={`flex min-w-0 items-center rounded-lg border border-line bg-white focus-within:border-oak ${className}`}>
      <select aria-label="Prefiks kraju" data-testid={testId ? `${testId}-prefix` : undefined} value={prefix}
        onChange={(e) => { setPrefix(e.target.value); emit(e.target.value, national); }}
        className="h-full shrink-0 cursor-pointer appearance-none rounded-l-lg bg-transparent py-2 pl-2.5 pr-1 text-[14px] text-ink/80 outline-none">
        {PREFIXES.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.code}</option>)}
      </select>
      <span className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <input data-testid={testId} type="tel" inputMode="tel" autoComplete="tel-national" autoFocus={autoFocus}
        placeholder={prefix === '+48' ? '600 100 200' : 'numer'} value={national}
        onChange={(e) => { setNational(e.target.value); emit(prefix, e.target.value); }}
        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[14px] outline-none" />
    </div>
  );
}
