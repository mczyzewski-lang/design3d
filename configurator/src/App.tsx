import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TopBar, InfoBar, BottomBar } from './ui/Bars';
import { Panel } from './ui/Panel';
import { useStore, useView } from './store/store';
import { configFromHash } from './engine/share';
import { CommentComposer, ShareGate } from './studio/StudioUI';
import { useStudio } from './studio/studioStore';

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

export default function App() {
  const gate = useStudio((s) => !!s.gate);
  useEffect(() => { void useStudio.getState().init(); }, []);
  // wklejony link z konfiguracją przy otwartej aplikacji
  useEffect(() => {
    const h = () => { const c = configFromHash(location.hash); if (c) useStore.getState().load(c); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return (
    <>
    <div className={`flex h-full flex-col ${gate ? 'pointer-events-none select-none blur-[9px] saturate-[0.85] transition-[filter] duration-700' : ''}`} aria-hidden={gate}>
      <TopBar />
      {/* telefon: scena przyklejona u góry, opcje przewijają się pod nią */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:flex-row md:overflow-visible">
        <main className="sticky top-0 z-20 h-[46vh] min-h-[300px] shrink-0 bg-paper shadow-[0_10px_20px_-6px_rgba(0,0,0,0.28)] md:relative md:shadow-none md:z-auto md:h-auto md:min-h-0 md:min-w-0 md:flex-1 md:shrink">
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-[13px] text-muted">Ładowanie sceny 3D…</div>}>
            <Scene />
          </Suspense>
          <ProjectionFade />
          <div className="pointer-events-none absolute inset-x-3 top-2 flex justify-start md:top-3"><InfoBar /></div>
          <div className="pointer-events-none absolute inset-x-3 bottom-2 flex flex-col items-start gap-2 md:bottom-3 md:items-center"><CommentComposer /><BottomBar /></div>
        </main>
        <div className="w-full shrink-0 border-t border-line shadow-[0_-6px_16px_rgba(0,0,0,0.05)] md:h-full md:shadow-none md:w-[24%] md:min-w-[340px] md:max-w-[420px] md:border-l md:border-t-0">
          <Panel />
        </div>
      </div>
    </div>
    <ShareGate />
    </>
  );
}
