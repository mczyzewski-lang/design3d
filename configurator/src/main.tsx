import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { firstTouchSource, trackVisit } from './analytics';
import { useStore } from './store/store';

// źródło pierwszego wejścia ustalamy, zanim wyczyścimy parametry adresu
firstTouchSource();
// wejście z landingu: /konfigurator/?shape=L&from=landing — ustaw wybrany układ i wyczyść adres
const q = new URLSearchParams(location.search);
const shape = q.get('shape');
if (shape === 'I' || shape === 'L' || shape === 'U' || shape === 'S') {
  // od razu dopasowane parametry — bez błędów w stanie startowym
  useStore.getState().chooseShape(shape, q.get('turn') === 'winders' && shape !== 'S' && shape !== 'I' ? 'winders' : 'landing');
  q.delete('shape'); q.delete('from'); q.delete('turn');
  history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
}
if (!/\/konfigurator\/p\//.test(location.pathname)) trackVisit('configurator');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
