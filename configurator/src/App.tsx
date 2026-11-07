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
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="relative h-[62vh] min-h-[360px] flex-1 md:h-auto">
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-[13px] text-muted">Ładowanie sceny 3D…</div>}>
            <Scene />
          </Suspense>
          <ProjectionFade />
          <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-start"><InfoBar /></div>
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-center gap-2"><CommentComposer /><BottomBar /></div>
        </main>
        <div className="w-full shrink-0 border-t border-line md:h-full md:w-[24%] md:min-w-[340px] md:max-w-[420px] md:border-l md:border-t-0">
          <Panel />
        </div>
      </div>
    </div>
    <ShareGate />
    </>
  );
}
