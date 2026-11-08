import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TopBar, InfoBar, BottomBar } from './ui/Bars';
import { Panel } from './ui/Panel';
import { useStore, useView } from './store/store';
import { configFromHash } from './engine/share';
import { CommentComposer, CtaBar, ShareGate } from './studio/StudioUI';
import { useStudio } from './studio/studioStore';
import { CrmShell } from './studio/CrmUI';

// three.js / R3F w osobnym chunku
const Scene = lazy(() => import('./three/Scene'));

function ProjectionFade() {
  const view = useView();
  const ortho = view.camera === 'top' || view.camera === 'side';
  const prev = useRef(ortho);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (prev.current === ortho) return;
    prev.current = ortho;
    setShow(true);
    const t = setTimeout(() => setShow(false), 260);
    return () => clearTimeout(t);
  }, [ortho]);
  return (
    <AnimatePresence>
      {show && <motion.div initial={{ opacity: 0.85 }} animate={{ opacity: 0.85 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="pointer-events-none absolute inset-0 bg-paper" />}
    </AnimatePresence>
  );
}

/** Domyślna wysokość sceny na telefonie (px): 46% ekranu, min. 300. */
const defaultSceneH = () => Math.max(300, Math.round(window.innerHeight * 0.46));

export default function App() {
  const gate = useStudio((s) => !!s.gate);
  const crm = useStudio((s) => s.crm);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [sceneH, setSceneH] = useState(defaultSceneH);
  const drag = useRef<{ y: number; h: number } | null>(null);
  // telefon: przewijanie w dół chowa nagłówek (scena przesuwa się w górę), w górę — przywraca
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      if (!window.matchMedia('(max-width: 767px)').matches) return;
      const y = el.scrollTop;
      // zmiana wysokości sceny uchwytem przesuwa treść — to nie jest przewijanie użytkownika
      if (drag.current) { last = y; return; }
      if (y > 80 && y - last > 6) setChromeHidden(true);
      else if (last - y > 12 || y < 24) setChromeHidden(false);
      last = y;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { useStudio.setState({ chromeHidden }); }, [chromeHidden]);
  useEffect(() => { document.documentElement.style.setProperty('--scene-h', `${sceneH}px`); }, [sceneH]);
  // uchwyt pod sceną: przeciągnij, aby zmniejszyć / powiększyć podgląd (telefon)
  const onHandleDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h: sceneH };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const h = drag.current.h + (e.clientY - drag.current.y);
    setSceneH(Math.round(Math.min(window.innerHeight * 0.72, Math.max(180, h))));
  };
  const onHandleUp = () => { setTimeout(() => { drag.current = null; }, 150); };
  useEffect(() => { void useStudio.getState().init(); }, []);
  // wklejony link z konfiguracją przy otwartej aplikacji
  useEffect(() => {
    const h = () => { const c = configFromHash(location.hash); if (c) useStore.getState().load(c); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  if (crm) return <CrmShell />;
  return (
    <>
    <div className={`flex h-full flex-col ${gate ? 'pointer-events-none select-none blur-[9px] saturate-[0.85] transition-[filter] duration-700' : ''}`} aria-hidden={gate}>
      <div className={`relative z-30 shrink-0 transition-[margin] duration-300 ease-out md:mt-0 ${chromeHidden ? '-mt-14' : 'mt-0'}`} data-testid="topbar-wrap"><TopBar /></div>
      {/* telefon: scena przyklejona u góry, opcje przewijają się pod nią */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:flex-row md:overflow-visible" data-testid="scroller">
        <main className="sticky top-0 z-20 h-[var(--scene-h,46vh)] shrink-0 bg-paper shadow-[0_10px_20px_-6px_rgba(0,0,0,0.28)] md:relative md:shadow-none md:z-auto md:h-auto md:min-h-0 md:min-w-0 md:flex-1 md:shrink">
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-[13px] text-muted">Ładowanie sceny 3D…</div>}>
            <Scene />
          </Suspense>
          <ProjectionFade />
          <div className="pointer-events-none absolute inset-x-3 top-2 flex justify-start md:top-3"><InfoBar /></div>
          <div className="pointer-events-none absolute inset-x-3 bottom-2 flex flex-col items-start gap-2 md:bottom-3 md:items-center"><CommentComposer /><BottomBar /></div>
          <div className="absolute inset-x-0 -bottom-1 z-10 flex justify-center md:hidden">
            <button type="button" aria-label="Przeciągnij, aby zmienić wysokość podglądu 3D" data-testid="scene-handle"
              onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} onDoubleClick={() => setSceneH(defaultSceneH())}
              className="grid h-6 w-20 cursor-ns-resize touch-none place-items-center">
              <span className="h-1.5 w-11 rounded-full bg-ink/30 shadow-[0_0_0_2px_rgba(255,255,255,0.7)]" />
            </button>
          </div>
        </main>
        <div className="w-full shrink-0 border-t border-line shadow-[0_-6px_16px_rgba(0,0,0,0.05)] md:h-full md:shadow-none md:w-[24%] md:min-w-[340px] md:max-w-[420px] md:border-l md:border-t-0">
          <Panel />
        </div>
      </div>
    </div>
    <ShareGate />
    {!gate && <CtaBar variant="mobile" />}
    </>
  );
}
