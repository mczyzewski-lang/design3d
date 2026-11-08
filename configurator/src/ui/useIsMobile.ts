import { useEffect, useState } from 'react';

const Q = '(max-width: 767px)';

/** true na wąskich ekranach (telefony) — zgodnie z progiem `md` Tailwinda. */
export function useIsMobile(): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(Q).matches);
  useEffect(() => {
    const mq = window.matchMedia(Q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    h();
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}
