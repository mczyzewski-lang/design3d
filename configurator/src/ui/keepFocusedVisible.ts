// Telefon: po fokusie pola (i otwarciu klawiatury) przewiń je w widoczny obszar.
// W panelu pod przyklejoną sceną — tuż pod scenę (scroll-margin w CSS), w oknach dialogowych — na środek.
export function keepFocusedVisible(): void {
  const touch = () => window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const scroll = (el: HTMLElement) => {
    const inPanel = !!el.closest('[data-testid="panel"]');
    el.scrollIntoView({ block: inPanel ? 'start' : 'center', behavior: 'smooth' });
  };
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement;
    if (!touch() || !el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea')) return;
    // klawiatura iOS wysuwa się ~300 ms; powtórka po zmianie visualViewport
    setTimeout(() => { if (document.activeElement === el) scroll(el); }, 320);
    const vv = window.visualViewport;
    if (vv) {
      const onResize = () => { if (document.activeElement === el) scroll(el); vv.removeEventListener('resize', onResize); };
      vv.addEventListener('resize', onResize);
      setTimeout(() => vv.removeEventListener('resize', onResize), 1500);
    }
  });
}
