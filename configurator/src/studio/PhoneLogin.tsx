// Logowanie numerem telefonu i kodem SMS: wykonawca → panel (CRM), klient → jego projekty.
import { useState } from 'react';
import { api } from './api';
import { PhoneField, phoneValid } from './PhoneField';

export function PhoneLogin({ role, onDone, compact = false }: { role: 'contractor' | 'owner'; onDone: () => void; compact?: boolean }) {
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<null | { phone: string; testCode?: string }>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api.loginStart(role, phone); setSent({ phone: r.phone, testCode: r.testCode }); setCode(''); } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); if (!sent) return; setBusy(true); setErr(null);
    try { await api.loginVerify(role, sent.phone, code); onDone(); } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };
  return (
    <div className={compact ? '' : 'mx-auto w-full max-w-sm'} data-testid={`login-${role}`}>
      {!sent ? (
        <form onSubmit={start} className="grid gap-2">
          <span className="text-[12px] text-muted">{role === 'contractor' ? 'Numer telefonu podany przy rejestracji firmy' : 'Numer, do którego przypisano projekty'}</span>
          <PhoneField value={phone} onChange={setPhone} testId="login-phone" autoFocus />
          <button type="submit" data-testid="login-send" disabled={busy || !phoneValid(phone)} className="rounded-lg bg-ink py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50">{busy ? 'Wysyłanie…' : 'Wyślij kod SMS'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="grid gap-2">
          <span className="text-[12px] text-muted">Kod wysłany na <b className="text-ink">{sent.phone}</b> · <button type="button" className="underline" onClick={() => setSent(null)}>zmień numer</button></span>
          {sent.testCode && <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn" data-testid="login-test-code">Tryb testowy (bramka SMS nie jest skonfigurowana) — kod: <b className="tracking-[0.2em]">{sent.testCode}</b></p>}
          <input data-testid="login-code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full rounded-lg border border-line px-3 py-2 text-center text-[16px] tracking-[0.4em] outline-none focus:border-oak" />
          <button type="submit" data-testid="login-verify" disabled={busy || code.length !== 6} className="rounded-lg bg-ink py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50">{busy ? '…' : 'Zaloguj'}</button>
        </form>
      )}
      {err && <div className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-[12px] text-bad" data-testid="login-error">{err}</div>}
    </div>
  );
}
