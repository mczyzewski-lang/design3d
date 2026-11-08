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
    // po zwinięciu poprzedniej sekcji (animacja 220 ms) układ się przesuwa — przewijamy po niej i korygujemy.
    // Cel liczony od faktycznej dolnej krawędzi sceny; w trakcie górny pasek się nie przełącza (data-autoscroll).
    const go = (smooth: boolean) => {
      const el = ref.current;
      const scroller = el?.closest('[data-testid="scroller"]') as HTMLElement | null;
      const main = document.querySelector('main')?.getBoundingClientRect();
      if (!el || !scroller || !main) return;
      const delta = el.getBoundingClientRect().top - main.bottom - 8; // 8 px odstępu karty od sceny
      if (Math.abs(delta) <= 2) return;
      document.documentElement.dataset.autoscroll = '1';
      scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' });
    };
    const t1 = setTimeout(() => go(true), 260);
    // korekta dopiero po zakończeniu płynnego przewinięcia — natychmiastowa, żeby się nie nakładała
    const t2 = setTimeout(() => go(false), 1000);
    const t3 = setTimeout(() => { delete document.documentElement.dataset.autoscroll; }, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); delete document.documentElement.dataset.autoscroll; };
  }, [open]);
  return (
    // zamknięte segmenty lekko wypukłe (białe, z cieniem), otwarty — wklęsły (ciemniejsze tło, cień wewnętrzny)
    <div ref={ref} data-open={open || undefined}
      className={`mx-2.5 mt-2 scroll-mt-[calc(var(--scene-h,46vh)+var(--chrome-h,56px)+8px)] rounded-xl border transition-[background-color,box-shadow,border-color] duration-200 md:mx-3 md:scroll-mt-0 ${open
        ? 'border-ink/10 bg-[#efebe4] shadow-[inset_0_2px_5px_rgba(20,19,17,0.10),inset_0_1px_1px_rgba(20,19,17,0.08)]'
        : 'border-line bg-white shadow-[0_1px_2px_rgba(20,19,17,0.06),0_3px_8px_-2px_rgba(20,19,17,0.07),inset_0_1px_0_rgba(255,255,255,0.9)] hover:border-ink/20'}`}
      data-testid={testId}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10.5px] ${open ? 'border-oak bg-oak text-white' : 'border-line text-muted'}`}>{index}</span>
        <span className={`flex-1 text-[15px] tracking-tight md:text-[13px] ${open ? 'font-semibold' : 'font-medium'}`} data-testid="section-title">{title}</span>
        {value && !open && <span className="max-w-[45%] truncate text-[12.5px] text-muted md:text-[11.5px]">{value}</span>}
        <ChevronDown size={16} className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="overflow-hidden">
            <div className="px-3.5 pb-4">{children}</div>
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
    <div data-testid={testId} className={`choices -mx-3.5 flex snap-x snap-mandatory scroll-px-3.5 gap-2 overflow-x-auto px-3.5 pb-1.5 md:scroll-px-0 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 ${GRID[cols]} ${ITEM_W[item]} [&>*]:shrink-0 [&>*]:snap-start md:[&>*]:w-auto`}>
      {children}
    </div>
  );
}

/** Podtytuł grupy sekcji w panelu. */
export function GroupLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="px-4 pb-0.5 pt-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</div>
      {hint && <div className="text-[11px] text-muted/90">{hint}</div>}
    </div>
  );
}
