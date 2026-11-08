import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { firstTouchSource, trackVisit } from './analytics';
import { useStore } from './store/store';
import { shapePatch } from './engine/presets';

// źródło pierwszego wejścia ustalamy, zanim wyczyścimy parametry adresu
firstTouchSource();
// wejście z landingu: /konfigurator/?shape=L&from=landing — ustaw wybrany układ i wyczyść adres
const q = new URLSearchParams(location.search);
const shape = q.get('shape');
if (shape === 'I' || shape === 'L' || shape === 'U' || shape === 'S') {
  const st = useStore.getState();
  st.setStairs(shapePatch(st.config.stairs, shape));
  if (q.get('turn') === 'winders' && shape !== 'S' && shape !== 'I') st.setStairs({ turnType: 'winders', winders: shape === 'L' ? 3 : 6 });
  q.delete('shape'); q.delete('from'); q.delete('turn');
  history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
}
if (!/\/konfigurator\/p\//.test(location.pathname)) trackVisit('configurator');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
