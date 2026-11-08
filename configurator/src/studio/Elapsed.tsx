// Czas od zgłoszenia (z sekundami, odświeżany co sekundę) — przypomina, że szybka wycena wygrywa.
import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p2 = (n: number) => String(n).padStart(2, '0');
  if (d) return `${d} d ${p2(h)} h ${p2(m)} min ${p2(sec)} s`;
  if (h) return `${h} h ${p2(m)} min ${p2(sec)} s`;
  return `${m} min ${p2(sec)} s`;
}

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

/** „⏱ 1 h 04 min 09 s od zgłoszenia” — zielony do 1 h, bursztynowy do 24 h, czerwony później. */
export function Elapsed({ since, className = '', label = 'od zgłoszenia' }: { since: string; className?: string; label?: string }) {
  const now = useNow();
  const ms = now - new Date(since).getTime();
  const tone = ms < 3600_000 ? 'text-ok' : ms < 86400_000 ? 'text-warn' : 'text-bad';
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${tone} ${className}`} data-testid="elapsed">
      <Timer size={13} className="shrink-0" />{fmtElapsed(ms)} {label}
    </span>
  );
}
