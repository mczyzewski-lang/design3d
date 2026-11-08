// Landing Stair Studio: licznik wejść, wybór układu, dołączenie wykonawcy (bez frameworka — szybkie ładowanie).
import './landing.css';
import { firstTouchSource, trackLandingShape, trackVisit } from '../analytics';

firstTouchSource();
trackVisit('landing');

document.querySelectorAll<HTMLAnchorElement>('[data-shape]').forEach((a) => {
  a.addEventListener('click', () => trackLandingShape(a.dataset.shape ?? '?'));
});

// treść zgody z serwera (ta sama, która zostanie zapisana przy rejestracji)
fetch('/api/studio/me', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : null))
  .then((m) => { const el = document.getElementById('leads-text'); if (m?.texts?.leads && el) el.textContent = m.texts.leads; })
  .catch(() => {});

const form = document.getElementById('contractor-form') as HTMLFormElement | null;
if (form) {
  const postal = form.elements.namedItem('postalCode') as HTMLInputElement;
  postal.addEventListener('input', () => {
    const d = postal.value.replace(/\D/g, '').slice(0, 5);
    postal.value = d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
  });
  const errBox = document.getElementById('contractor-errors')!;
  const done = document.getElementById('contractor-done')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const body = {
      fullName: String(f.get('fullName') ?? ''),
      email: String(f.get('email') ?? ''), phone: String(f.get('phone') ?? ''), companyName: String(f.get('companyName') ?? ''),
      postalCode: String(f.get('postalCode') ?? ''), radiusKm: String(f.get('radiusKm') ?? ''),
      leads: f.get('leads') === 'on', source: firstTouchSource() === 'direct' ? 'landing' : `landing:${firstTouchSource()}`.slice(0, 60),
    };
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    errBox.classList.add('hidden');
    try {
      const r = await fetch('/api/studio/contractors', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        errBox.textContent = (data.errors ?? [data.error ?? 'Nie udało się wysłać formularza']).join('. ');
        errBox.classList.remove('hidden');
        btn.disabled = false;
        return;
      }
      form.querySelectorAll('input, button[type="submit"]').forEach((el) => { (el as HTMLInputElement).disabled = true; });
      done.classList.remove('hidden');
    } catch {
      errBox.textContent = 'Brak połączenia — spróbuj ponownie.';
      errBox.classList.remove('hidden');
      btn.disabled = false;
    }
  });
}
