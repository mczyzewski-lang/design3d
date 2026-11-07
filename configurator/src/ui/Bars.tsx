import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, animate } from 'motion/react';
import { BrickWall, Camera, Check, ChevronDown, Cuboid, Eye, Focus, ImageDown, Layers, Lightbulb, Moon, Rotate3d, RotateCcw, Ruler, Scissors, SquareDashed, Sun, ArrowLeftRight, PanelTop, Save, FolderOpen, FileDown, FileUp, Footprints } from 'lucide-react';
import { COLLECTIONS } from '../engine/presets';
import { WALL_LABEL } from '../engine/catalog';
import type { WallKey } from '../engine/types';
import { useConfig, useSolved, useStore, useView, type CameraMode, type WallMode } from '../store/store';
import { capture, downloadDataUrl } from '../three/capture';
import { StatusPill } from './AnalysisCard';
import { downloadJson, exportPayload, pickJsonFile } from './fileOps';

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  const node = (
    <AnimatePresence>{msg && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12.5px] text-white shadow-lg">{msg}</motion.div>}</AnimatePresence>
  );
  return [setMsg, node] as const;
}

function Menu({ label, children, testId }: { label: ReactNode; children: (close: () => void) => ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" data-testid={testId} onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] text-ink/80 hover:bg-black/5">
        {label}<ChevronDown size={14} className="text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="absolute left-0 top-full z-40 mt-1 min-w-[240px] rounded-xl border border-line bg-white p-1.5 shadow-xl">
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const MenuItem = ({ onClick, children, active }: { onClick: () => void; children: ReactNode; active?: boolean }) => (
  <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-paper">
    {children}{active && <Check size={14} className="ml-auto text-oak" />}
  </button>
);

export function TopBar() {
  const c = useConfig();
  const collection = useStore((s) => s.collection);
  const saveLocal = useStore((s) => s.saveLocal);
  const restoreLocal = useStore((s) => s.restoreLocal);
  const reset = useStore((s) => s.reset);
  const load = useStore((s) => s.load);
  const [toast, toastNode] = useToast();
  const png = () => {
    const url = capture.fn?.();
    if (url) downloadDataUrl(url, 'stair-studio.png');
    toast(url ? 'Zapisano widok (PNG)' : 'Scena jeszcze się ładuje');
  };
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel/90 px-4 backdrop-blur">
      <div className="mr-3 flex items-baseline gap-2">
        <span className="whitespace-nowrap text-[13px] font-semibold tracking-[0.14em] sm:text-[15px] sm:tracking-[0.22em]">STAIR STUDIO</span>
        <span className="hidden text-[11px] text-muted sm:inline">design3d.pl</span>
      </div>
      <Menu label="Kolekcje" testId="menu-collections">
        {(close) => COLLECTIONS.map((col) => (
          <MenuItem key={col.key} active={c.collection === col.key} onClick={() => { collection(col.key); close(); }}>
            <div><div className="font-medium">{col.label}</div><div className="text-[11px] text-muted">{col.description}</div></div>
          </MenuItem>
        ))}
      </Menu>
      <Menu label="Plik" testId="menu-file">
        {(close) => (
          <>
            <MenuItem onClick={() => { toast(saveLocal() ? 'Zapisano w przeglądarce' : 'Nie udało się zapisać'); close(); }}><Save size={14} /> Zapisz w przeglądarce</MenuItem>
            <MenuItem onClick={() => { toast(restoreLocal() ? 'Przywrócono zapisaną konfigurację' : 'Brak zapisanej konfiguracji'); close(); }}><FolderOpen size={14} /> Przywróć zapisaną</MenuItem>
            <MenuItem onClick={() => { downloadJson(exportPayload(c), 'stair-studio.json'); close(); }}><FileDown size={14} /> Eksport JSON</MenuItem>
            <MenuItem onClick={() => { pickJsonFile().then((d) => { load(d); toast('Zaimportowano konfigurację'); }).catch((e) => toast(e.message)); close(); }}><FileUp size={14} /> Import JSON</MenuItem>
            <MenuItem onClick={() => { png(); close(); }}><ImageDown size={14} /> Zrzut PNG</MenuItem>
            <div className="my-1 border-t border-line" />
            <MenuItem onClick={() => { reset(); close(); toast('Przywrócono konfigurację domyślną'); }}><RotateCcw size={14} /> Reset</MenuItem>
          </>
        )}
      </Menu>
      <div className="flex-1" />
      <button type="button" onClick={png} data-testid="save-view" className="flex items-center gap-2 rounded-full bg-ink px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-ink/85">
        <Camera size={14} /> <span className="hidden sm:inline">Zapisz widok</span>
      </button>
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
  const fp = s.layout.footprint;
  const items: Array<[string, ReactNode, boolean?]> = [
    ['Kondygnacja', <><AnimatedNumber value={c.room.height * 100} /> cm</>],
    ['Stopnie', <AnimatedNumber value={s.calc.risers} digits={0} />],
    ['Wysokość stopnia', <><AnimatedNumber value={s.calc.rise * 100} /> cm</>],
    ['Głębokość stopnicy', <><AnimatedNumber value={s.calc.treadDepth * 100} /> cm</>, true],
    ['Nachylenie', <><AnimatedNumber value={s.calc.angleDeg} />°</>],
    ['Zajmowana przestrzeń', <><AnimatedNumber value={(fp.maxX - fp.minX) * 100} digits={0} /> × <AnimatedNumber value={(fp.maxZ - fp.minZ) * 100} digits={0} /> cm</>, true],
  ];
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
  const tool = (active: boolean) => `flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl transition ${active ? 'bg-ink text-white' : 'text-ink/70 hover:bg-black/5'}`;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-2xl border border-line/80 bg-white/90 p-1.5 shadow-lg backdrop-blur" data-testid="bottom-bar">
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
      <button type="button" title="Strop" onClick={() => setView({ showSlab: !view.showSlab })} className={tool(view.showSlab)}><Layers size={15} /></button>
      <button type="button" title={c.lighting.night ? 'Dzień' : 'Noc'} data-testid="tool-night" onClick={() => setLighting({ night: !c.lighting.night })} className={tool(c.lighting.night)}>{c.lighting.night ? <Moon size={15} /> : <Sun size={15} />}</button>
      <button type="button" title="LED" onClick={() => setLighting({ led: !c.lighting.led })} className={tool(c.lighting.led)}><Lightbulb size={15} /></button>
    </div>
  );
}
