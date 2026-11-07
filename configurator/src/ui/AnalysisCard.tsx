import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, CircleX, Info, TriangleExclamationPoint, WandSparkles } from 'lucide-react';
import { SHAPE_LABEL } from '../engine/catalog';
import { STATUS_LABEL } from '../engine/validate';
import type { Shape, Status } from '../engine/types';
import { useStore, useSolved } from '../store/store';

export const STATUS_STYLE: Record<Status, string> = {
  ok: 'bg-ok-soft text-ok',
  adjust: 'bg-warn-soft text-warn',
  nofit: 'bg-bad-soft text-bad',
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span data-testid="status-pill" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${STATUS_STYLE[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function AnalysisCard() {
  const solved = useSolved();
  const patch = useStore((s) => s.patch);
  const runAutofit = useStore((s) => s.runAutofit);
  const af = useStore((s) => s.autofit);
  const [showInfo, setShowInfo] = useState(false);
  const issues = solved.messages.filter((m) => m.level !== 'info');
  const infos = solved.messages.filter((m) => m.level === 'info');
  const icon = (l: string) => (l === 'error' ? <CircleX size={15} className="mt-0.5 shrink-0 text-bad" /> : l === 'warning' ? <TriangleExclamationPoint size={15} className="mt-0.5 shrink-0 text-warn" /> : <Info size={15} className="mt-0.5 shrink-0 text-muted" />);
  return (
    <div className="m-3 rounded-2xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]" data-testid="analysis-card">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Analiza</div>
        <StatusPill status={solved.status} />
      </div>
      {issues.length === 0 ? (
        <div className="mt-3 flex items-start gap-2 text-[12.5px] text-ink/80"><CircleCheck size={15} className="mt-0.5 text-ok" />Schody mieszczą się, parametry w zalecanych zakresach.</div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {issues.map((m) => (
            <li key={m.id} className="flex gap-2" data-testid={`msg-${m.id}`}>
              {icon(m.level)}
              <div className="text-[12.5px] leading-snug">
                <div className="font-medium">{m.title}</div>
                <div className="text-muted">{m.cause}</div>
                {m.suggestion && <div className="text-ink/70">→ {m.suggestion}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {solved.suggestions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Sugestie</div>
          <div className="flex flex-wrap gap-1.5">
            {solved.suggestions.map((s) => (
              <button key={s.id} type="button" onClick={() => patch(s.patch)} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] hover:border-oak hover:text-oak">
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" data-testid="autofit" onClick={() => runAutofit()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2.5 text-[13px] font-medium text-white transition hover:bg-ink/85">
        <WandSparkles size={15} /> Dopasuj automatycznie
      </button>
      <AnimatePresence>
        {af && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 rounded-xl bg-paper p-2.5 text-[12px]" data-testid="autofit-result">
            {af.ok ? (
              <span className="text-ok">Dopasowano: {af.summary}.</span>
            ) : (
              <div>
                <div className="font-medium text-bad">{af.message}.</div>
                {af.feasibleShapes.length ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-muted">Zmieszczą się:</span>
                    {af.feasibleShapes.map((sh: Shape) => (
                      <button key={sh} type="button" onClick={() => runAutofit(sh)} className="rounded-full border border-oak px-2.5 py-0.5 text-oak hover:bg-oak-soft">{SHAPE_LABEL[sh]}</button>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted">Żaden kształt nie mieści się w tej przestrzeni — zwiększ wymiary pomieszczenia.</div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" onClick={() => setShowInfo(!showInfo)} className="mt-2 text-[11.5px] text-muted underline-offset-2 hover:underline">
        {showInfo ? 'Ukryj informacje' : `Informacje o konstrukcji (${infos.length})`}
      </button>
      {showInfo && (
        <ul className="mt-1.5 space-y-1.5">
          {infos.map((m) => (
            <li key={m.id} className="flex gap-2 text-[11.5px] text-muted">{icon('info')}<span><b className="font-medium text-ink/70">{m.title}</b> {m.cause}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}
