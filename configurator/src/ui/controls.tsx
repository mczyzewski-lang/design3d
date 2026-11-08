// Podstawowe kontrolki panelu. Wartości wewnętrzne w metrach, w UI w centymetrach.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';

const fmt = (v: number, step: number) => {
  const d = step < 1 ? 1 : 0;
  const s = v.toFixed(d).replace('.', ',');
  return s === '-0' || s === '-0,0' ? '0' : s.replace(/,0$/, '');
};

/** Suwak + pole liczbowe. min/max/step w jednostkach UI (domyślnie cm); value/onChange w metrach (scale = 100). */
export function SliderField(props: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; scale?: number; hint?: string; disabled?: boolean; testId?: string }) {
  const { label, value, onChange, min, max, step = 1, unit = 'cm', scale = 100, hint, disabled, testId } = props;
  const ui = value * scale;
  const [text, setText] = useState(fmt(ui, step));
  useEffect(() => setText(fmt(ui, step)), [ui, step]);
  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n)) return setText(fmt(ui, step));
    const clamped = Math.min(max, Math.max(min, Math.round(n / step) * step));
    onChange(clamped / scale);
    setText(fmt(clamped, step));
  };
  return (
    <div className={`py-1.5 ${disabled ? 'opacity-45 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[12.5px] text-ink/80">{label}</label>
        <div className="flex items-center gap-1">
          <input
            data-testid={testId}
            className="w-[68px] rounded-md border border-line bg-white px-2 py-1 text-right text-[12.5px] tabular-nums outline-none focus:border-oak"
            value={text}
            inputMode="decimal"
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
          />
          <span className="w-6 text-[11px] text-muted">{unit}</span>
        </div>
      </div>
      <input type="range" className="mt-1 w-full" min={min} max={max} step={step} value={Math.min(max, Math.max(min, ui))} onChange={(e) => onChange(Number(e.target.value) / scale)} aria-label={label} />
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md' }: { value: T; options: Array<{ value: T; label: ReactNode; title?: string }>; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="flex w-full rounded-lg bg-black/[0.045] p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 ${size === 'sm' ? 'py-1 text-[11.5px]' : 'py-1.5 text-[12.5px]'} transition ${value === o.value ? 'bg-white font-medium text-ink shadow-sm' : 'text-ink/60 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5 text-[12.5px] text-ink/80">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-oak' : 'bg-black/15'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="mb-1 text-[12.5px] text-ink/80">{label}</div>
      {children}
    </div>
  );
}

export function Section({ index, title, open, onToggle, children, value, testId }: { index: number; title: string; open: boolean; onToggle: () => void; children: ReactNode; value?: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  // telefon: otwarta sekcja przewija się tuż pod przyklejoną scenę (scroll-margin = wysokość sceny)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!open || !window.matchMedia('(max-width: 767px)').matches) return;
    // po zwinięciu poprzedniej sekcji (animacja 220 ms) układ się przesuwa — przewijamy po niej i korygujemy
    const go = (smooth: boolean) => ref.current?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    const t1 = setTimeout(() => go(true), 260);
    const t2 = setTimeout(() => { const r = ref.current?.getBoundingClientRect(); const main = document.querySelector('main')?.getBoundingClientRect(); if (r && main && Math.abs(r.top - main.bottom) > 4) go(true); }, 760);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open]);
  return (
    <div ref={ref} className="scroll-mt-[max(46vh,300px)] border-t border-line md:scroll-mt-0" data-testid={testId}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[10.5px] text-muted">{index}</span>
        <span className="flex-1 text-[13px] font-medium tracking-tight">{title}</span>
        {value && !open && <span className="max-w-[45%] truncate text-[11.5px] text-muted">{value}</span>}
        <ChevronDown size={16} className={`text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="overflow-hidden">
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Thumb({ active, onClick, children, label, sub, testId }: { active: boolean; onClick: () => void; children: ReactNode; label: string; sub?: string; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition ${active ? 'border-oak bg-oak-soft/60 shadow-sm' : 'border-line bg-white hover:border-ink/25'}`}
    >
      <div className="h-12 w-full text-ink">{children}</div>
      <div className="text-[11px] font-medium leading-tight">{label}</div>
      {sub && <div className="text-[10px] leading-tight text-muted">{sub}</div>}
    </button>
  );
}

/**
 * Wybór graficzny: na telefonie jeden wiersz przewijany w poziomie (bez zawijania na kilka wierszy),
 * od md siatka. `item` — szerokość kafelka na telefonie.
 */
const ITEM_W = { sm: '[&>*]:w-[78px]', md: '[&>*]:w-[94px]', lg: '[&>*]:w-[112px]', xl: '[&>*]:w-[158px]' } as const;
const GRID = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5' } as const;

export function Choices({ children, cols = 4, item = 'md', testId }: { children: ReactNode; cols?: keyof typeof GRID; item?: keyof typeof ITEM_W; testId?: string }) {
  return (
    <div data-testid={testId} className={`choices -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1.5 md:scroll-px-0 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 ${GRID[cols]} ${ITEM_W[item]} [&>*]:shrink-0 [&>*]:snap-start md:[&>*]:w-auto`}>
      {children}
    </div>
  );
}

/** Podtytuł grupy sekcji w panelu. */
export function GroupLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="border-t border-line bg-paper/70 px-4 pb-1.5 pt-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</div>
      {hint && <div className="text-[11px] text-muted/90">{hint}</div>}
    </div>
  );
}
