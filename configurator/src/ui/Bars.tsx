import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, animate } from 'motion/react';
import { Ellipsis, X, MessageCirclePlus, BrickWall, Check, Cuboid, Eye, Focus, Layers, Lightbulb, Moon, Rotate3d, RotateCcw, Ruler, Scissors, SquareDashed, Sun, ArrowLeftRight, PanelTop, Footprints } from 'lucide-react';
import { WALL_LABEL } from '../engine/catalog';
import type { WallKey } from '../engine/types';
import { useConfig, useSolved, useStore, useView, type CameraMode, type WallMode } from '../store/store';
import { StatusPill } from './AnalysisCard';
import { useIsMobile } from './useIsMobile';
import { STATUS_LABEL } from '../engine/validate';
import { ProjectActions } from '../studio/StudioUI';
import { useStudio } from '../studio/studioStore';

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  const node = (
    <AnimatePresence>{msg && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12.5px] text-white shadow-lg">{msg}</motion.div>}</AnimatePresence>
  );
  return [setMsg, node] as const;
}


const MenuItem = ({ onClick, children, active }: { onClick: () => void; children: ReactNode; active?: boolean }) => (
  <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-paper">
    {children}{active && <Check size={14} className="ml-auto text-oak" />}
  </button>
);

export function TopBar() {
  const [toast, toastNode] = useToast();
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-panel/90 px-3 backdrop-blur sm:gap-2 sm:px-4">
      <div className="mr-1 flex items-baseline gap-2 sm:mr-3">
        <span className="whitespace-nowrap text-[12px] font-semibold tracking-[0.1em] sm:text-[15px] sm:tracking-[0.22em]">STAIR STUDIO</span>
        <span className="hidden text-[11px] text-muted sm:inline">design3d.pl</span>
      </div>
      {/* menu „Kolekcje” i „Plik” (pobieranie plików) tymczasowo ukryte — patrz README */}
      <div className="flex-1" />
      <ProjectActions toast={toast} />
      {toastNode}
    </header>
  );
}

function AnimatedNumber({ value, digits = 1, suffix = '' }: { value: number; digits?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const fmt = (v: number) => {
    let s = v.toFixed(digits).replace('.', ',');
    if (/^-0(,0+)?$/.test(s)) s = s.slice(1);
    return s.replace(/,0+$/, '') + suffix;
  };
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ctl = animate(prev.current, value, { duration: 0.45, ease: 'easeOut', onUpdate: (v) => { node.textContent = fmt(v); } });
    prev.current = value;
    return () => ctl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span ref={ref} className="tabular-nums">{fmt(value)}</span>;
}

export function InfoBar() {
  const c = useConfig();
  const s = useSolved();
  const mobile = useIsMobile();
  const fp = s.layout.footprint;
  const items: Array<[string, ReactNode, boolean?]> = [
    ['Kondygnacja', <><AnimatedNumber value={c.room.height * 100} /> cm</>],
    ['Stopnie', <AnimatedNumber value={s.calc.risers} digits={0} />],
    ['Wysokość stopnia', <><AnimatedNumber value={s.calc.rise * 100} /> cm</>],
    ['Głębokość stopnicy', <><AnimatedNumber value={s.calc.treadDepth * 100} /> cm</>, true],
    ['Nachylenie', <><AnimatedNumber value={s.calc.angleDeg} />°</>],
    ['Zajmowana przestrzeń', <><AnimatedNumber value={(fp.maxX - fp.minX) * 100} digits={0} /> × <AnimatedNumber value={(fp.maxZ - fp.minZ) * 100} digits={0} /> cm</>, true],
  ];
  if (mobile) {
    // telefon: małe, przezroczyste — jak najmniej zasłania schody
    return (
      <div className="pointer-events-none flex items-start gap-3 rounded-xl bg-white/65 px-2.5 py-1.5 shadow-sm backdrop-blur-sm" data-testid="info-bar">
        {items.filter(([, , wide]) => !wide).map(([k, v]) => (
          <div key={k} className="leading-tight">
            <div className="whitespace-nowrap text-[8.5px] font-semibold uppercase tracking-[0.06em] text-ink/65">{k === 'Wysokość stopnia' ? 'Wys. stopnia' : k}</div>
            <div className="text-[12px] font-semibold text-ink">{v}</div>
          </div>
        ))}
        <span data-testid="status-pill" title={STATUS_LABEL[s.status]} className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/80 ${s.status === 'ok' ? 'bg-ok' : s.status === 'adjust' ? 'bg-warn' : 'bg-bad'}`} />
      </div>
    );
  }
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line/80 bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur sm:gap-x-5 sm:px-4 sm:py-2" data-testid="info-bar">
      {items.map(([k, v, wide]) => (
        <div key={k} className={`leading-tight ${wide ? 'hidden lg:block' : ''}`}>
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted">{k}</div>
          <div className="text-[13px] font-medium">{v}</div>
        </div>
      ))}
      <StatusPill status={s.status} />
    </div>
  );
}

const CAMERAS: Array<{ key: CameraMode; label: string; icon: ReactNode }> = [
  { key: 'persp', label: 'Perspektywa', icon: <Rotate3d size={15} /> },
  { key: 'top', label: 'Z góry', icon: <PanelTop size={15} /> },
  { key: 'side', label: 'Z boku', icon: <Cuboid size={15} /> },
  { key: 'section', label: 'Przekrój', icon: <Scissors size={15} /> },
  { key: 'eye', label: 'Poziom oczu', icon: <Eye size={15} /> },
];

const WALL_MODES: Array<{ key: WallMode; label: string }> = [
  { key: 'auto', label: 'Automatycznie' }, { key: 'all', label: 'Wszystkie' }, { key: 'transparent', label: 'Półprzezroczyste' },
  { key: 'selected', label: 'Wybrane' }, { key: 'section', label: 'Przekrój 3D (105 cm)' },
];

export function BottomBar() {
  const view = useView();
  const c = useConfig();
  const setView = useStore((s) => s.setView);
  const setLighting = useStore((s) => s.setLighting);
  const requestFit = useStore((s) => s.requestFit);
  const requestReset = useStore((s) => s.requestCameraReset);
  const [wallsOpen, setWallsOpen] = useState(false);
  const commentMode = useStudio((s) => s.commentMode);
  const mobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const round = (active: boolean) => `pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition ${active ? 'bg-ink/85 text-white' : 'bg-white/55 text-ink/80'} shadow-sm`;
  if (mobile && !expanded) {
    // telefon: tylko dzień/noc, LED i „więcej”
    return (
      <div className="flex items-center gap-2" data-testid="bottom-bar">
        <button type="button" aria-label="Więcej opcji widoku" data-testid="bar-more" onClick={() => setExpanded(true)} className={round(false)}><Ellipsis size={18} /></button>
        <button type="button" aria-label={c.lighting.night ? 'Dzień' : 'Noc'} data-testid="tool-night" onClick={() => setLighting({ night: !c.lighting.night })} className={round(c.lighting.night)}>{c.lighting.night ? <Moon size={17} /> : <Sun size={17} />}</button>
        <button type="button" aria-label="LED" data-testid="tool-led" onClick={() => setLighting({ led: !c.lighting.led })} className={round(c.lighting.led)}><Lightbulb size={17} /></button>
      </div>
    );
  }
  const tool = (active: boolean) => `flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl transition ${active ? 'bg-ink text-white' : 'text-ink/70 hover:bg-black/5'}`;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-2xl border border-line/80 bg-white/90 p-1.5 shadow-lg backdrop-blur" data-testid="bottom-bar">
      {mobile && <button type="button" aria-label="Zwiń" data-testid="bar-less" onClick={() => setExpanded(false)} className={tool(false)}><X size={16} /></button>}
      {CAMERAS.map((k) => (
        <button key={k.key} type="button" data-testid={`cam-${k.key}`} onClick={() => setView({ camera: k.key })} className={`flex h-8 sm:h-9 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-[12.5px] transition ${view.camera === k.key ? 'bg-ink text-white' : 'text-ink/75 hover:bg-black/5'}`}>
          {k.icon}<span className="hidden md:inline">{k.label}</span>
        </button>
      ))}
      {view.camera === 'side' && <button type="button" title="Odwróć stronę" onClick={() => setView({ sideFlip: !view.sideFlip })} className={tool(false)}><ArrowLeftRight size={15} /></button>}
      {view.camera === 'eye' && (
        <button type="button" onClick={() => setView({ eyeFrom: view.eyeFrom === 'entry' ? 'top' : 'entry' })} className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] text-ink/75 hover:bg-black/5"><Footprints size={14} />{view.eyeFrom === 'entry' ? 'Od wejścia' : 'Z piętra'}</button>
      )}
      <div className="mx-1 h-6 w-px bg-line" />
      <button type="button" title="Reset kamery" onClick={requestReset} className={tool(false)}><RotateCcw size={15} /></button>
      <button type="button" title="Dopasuj schody do widoku" onClick={requestFit} className={tool(false)}><Focus size={15} /></button>
      <button type="button" title="Wymiary" data-testid="tool-dims" onClick={() => setView({ showDims: !view.showDims })} className={tool(view.showDims)}><Ruler size={15} /></button>
      <button type="button" title="Obrys zajmowanej przestrzeni" onClick={() => setView({ showFootprint: !view.showFootprint })} className={tool(view.showFootprint)}><SquareDashed size={15} /></button>
      <div className="relative">
        <button type="button" title="Ściany" data-testid="tool-walls" onClick={() => setWallsOpen(!wallsOpen)} className={tool(wallsOpen)}><BrickWall size={15} /></button>
        <AnimatePresence>
          {wallsOpen && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-xl border border-line bg-white p-1.5 shadow-xl">
              {WALL_MODES.map((m) => <MenuItem key={m.key} active={view.wallMode === m.key} onClick={() => setView({ wallMode: m.key })}>{m.label}</MenuItem>)}
              {view.wallMode === 'selected' && (
                <div className="grid grid-cols-2 gap-1 p-1.5">
                  {(['back', 'left', 'right', 'front'] as WallKey[]).map((k) => (
                    <label key={k} className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={view.selectedWalls[k]} onChange={(e) => setView({ selectedWalls: { ...view.selectedWalls, [k]: e.target.checked } })} />{WALL_LABEL[k]}</label>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <button type="button" title="Dodaj komentarz w 3D" data-testid="tool-comment" onClick={() => useStudio.getState().setCommentMode(!useStudio.getState().commentMode)} className={tool(commentMode)}><MessageCirclePlus size={15} /></button>
      <button type="button" title="Strop" onClick={() => setView({ showSlab: !view.showSlab })} className={tool(view.showSlab)}><Layers size={15} /></button>
      <button type="button" title={c.lighting.night ? 'Dzień' : 'Noc'} data-testid="tool-night" onClick={() => setLighting({ night: !c.lighting.night })} className={tool(c.lighting.night)}>{c.lighting.night ? <Moon size={15} /> : <Sun size={15} />}</button>
      <button type="button" title="LED" onClick={() => setLighting({ led: !c.lighting.led })} className={tool(c.lighting.led)}><Lightbulb size={15} /></button>
    </div>
  );
}
