// Tryb demo panelu wykonawcy: przykładowe dane (e-mail, umowy, terminy, powiadomienia) — tylko front, nic nie trafia na serwer.
import { useState, type ReactNode } from 'react';
import { ArrowLeft, Banknote, Bell, CalendarDays, Check, Eye, FileSignature, Hammer, Inbox, MessageSquare, Paperclip, Ruler, Sparkles, Truck, X } from 'lucide-react';

const DAY = 86_400_000;
const at = (days: number, h = 10, m = 0) => { const d = new Date(Date.now() + days * DAY); d.setHours(h, m, 0, 0); return d; };
const fmtDay = (d: Date) => d.toLocaleDateString('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtTime = (d: Date) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const fmtWhen = (d: Date) => (Math.abs(Date.now() - d.getTime()) < DAY && d.getDate() === new Date().getDate() ? fmtTime(d) : `${fmtDay(d)} ${fmtTime(d)}`);
const zl = (n: number) => `${n.toLocaleString('pl-PL')} zł`;

/** Mały link „Zobacz demo” w pustych zakładkach. */
export function DemoLink({ onClick, label = 'Zobacz demo (dane przykładowe)' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid="crm-demo-link" className="mx-auto mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-oak underline-offset-2 hover:underline">
      <Eye size={14} />{label}
    </button>
  );
}

/** Pasek nad treścią w trybie demo. */
export function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="mx-auto mb-4 flex max-w-3xl items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-[#7a4f12]" data-testid="crm-demo-banner">
      <Sparkles size={15} className="shrink-0" />
      <span className="min-w-0 flex-1">Tryb demo — przykładowe dane pokazują, jak będą działać umowy, terminy, e-mail i powiadomienia.</span>
      <button type="button" onClick={onExit} data-testid="crm-demo-exit" className="flex shrink-0 items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 font-medium hover:bg-white"><X size={13} />Wyłącz</button>
    </div>
  );
}

function Title({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3"><h1 className="text-[20px] font-semibold tracking-tight">{children}</h1><div className="flex-1" />{right}</div>;
}

// ---------------- E-mail ----------------
type Mail = { id: number; from: string; email: string; subject: string; body: string; when: Date; unread: boolean; project?: string; attach?: string };
const MAILS: Mail[] = [
  { id: 1, from: 'Katarzyna Kowalska', email: 'k.kowalska@example.pl', subject: 'Re: Wycena schodów — dom Kowalskich', when: at(0, 9, 12), unread: true, project: 'Schody U — 31-500', body: 'Dzień dobry,\n\ndziękuję za wycenę. Czy przy balustradzie ze szkła cena zmieni się dużo? Pomiar pasowałby nam w czwartek po 16:00.\n\nPozdrawiam,\nKatarzyna Kowalska' },
  { id: 2, from: 'Tomasz Nowak', email: 'tnowak@example.pl', subject: 'Umowa podpisana — schody L', when: at(-1, 18, 40), unread: true, project: 'Schody L — 30-061', attach: 'umowa-podpisana.pdf', body: 'Dzień dobry,\n\nw załączniku podpisana umowa. Zaliczkę przelałem dziś rano. Proszę o potwierdzenie terminu montażu.\n\nTomasz Nowak' },
  { id: 3, from: 'Hurtownia Drewna Dąb-Pol', email: 'zamowienia@dabpol.example', subject: 'Potwierdzenie zamówienia: dąb lity 40 mm', when: at(-2, 11, 5), unread: false, attach: 'faktura-proforma.pdf', body: 'Potwierdzamy zamówienie nr 2026/1184. Termin dostawy: 5 dni roboczych.' },
  { id: 4, from: 'Anna Wiśniewska', email: 'anna.w@example.pl', subject: 'Pytanie o schody kręcone', when: at(-3, 8, 30), unread: false, project: 'Schody kręcone — 32-020', body: 'Czy da się zmieścić schody kręcone w otworze 150 × 150 cm? Przesyłam link do projektu z konfiguratora.' },
];

export function DemoEmail() {
  const [open, setOpen] = useState<Mail | null>(null);
  if (open) {
    return (
      <div className="mx-auto max-w-3xl" data-testid="crm-demo-email-open">
        <button type="button" onClick={() => setOpen(null)} className="mb-3 flex items-center gap-1.5 text-[13px] text-ink/70 hover:text-ink"><ArrowLeft size={16} />Skrzynka</button>
        <article className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <h1 className="text-[18px] font-semibold leading-snug">{open.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <span className="font-medium text-ink">{open.from}</span><span>&lt;{open.email}&gt;</span><span>· {fmtWhen(open.when)}</span>
            {open.project && <span className="rounded-full bg-oak-soft px-2 py-0.5 text-[11px] text-oak">{open.project}</span>}
          </div>
          <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed">{open.body}</p>
          {open.attach && <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]"><Paperclip size={14} />{open.attach}</div>}
          <div className="mt-5 rounded-xl border border-line bg-paper/60 p-3">
            <textarea rows={3} placeholder="Odpowiedz…" className="w-full resize-none bg-transparent text-[13.5px] outline-none" />
            <div className="flex justify-end"><button type="button" disabled className="rounded-lg bg-ink px-4 py-1.5 text-[12.5px] text-white opacity-60">Wyślij (demo)</button></div>
          </div>
        </article>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Title right={<span className="text-[12px] text-muted">biuro@twojafirma.pl</span>}>E-mail</Title>
      <ul className="overflow-hidden rounded-2xl border border-line bg-white" data-testid="crm-demo-email">
        {MAILS.map((m) => (
          <li key={m.id} className="border-t border-line first:border-t-0">
            <button type="button" onClick={() => setOpen(m)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-paper/60">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.unread ? 'bg-[#2f6fd6]' : 'bg-transparent'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2"><span className={`truncate text-[14px] ${m.unread ? 'font-semibold' : 'font-medium'}`}>{m.from}</span><span className="ml-auto shrink-0 text-[11.5px] text-muted">{fmtWhen(m.when)}</span></div>
                <div className={`truncate text-[13px] ${m.unread ? 'text-ink' : 'text-ink/75'}`}>{m.subject}</div>
                <div className="truncate text-[12px] text-muted">{m.body.replace(/\n+/g, ' ')}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {m.project && <span className="rounded-full bg-oak-soft px-2 py-0.5 text-[10.5px] text-oak">{m.project}</span>}
                  {m.attach && <span className="flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[10.5px] text-muted"><Paperclip size={10} />{m.attach}</span>}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- Umowy ----------------
type ContractStage = 'sent' | 'accepted' | 'deposit' | 'done';
const CSTEPS: Array<[ContractStage, string]> = [['sent', 'Wysłana'], ['accepted', 'Zaakceptowana'], ['deposit', 'Zaliczka'], ['done', 'Montaż']];
const CONTRACTS: Array<{ id: string; title: string; client: string; amount: number; deposit: number; stage: ContractStage; date: Date; montage?: Date }> = [
  { id: 'U/2026/014', title: 'Schody L — 30-061', client: 'Tomasz Nowak', amount: 31_200, deposit: 9_360, stage: 'deposit', date: at(-1, 18), montage: at(12, 8) },
  { id: 'U/2026/013', title: 'Schody U — 31-500', client: 'Katarzyna Kowalska', amount: 28_500, deposit: 8_550, stage: 'accepted', date: at(-2, 14) },
  { id: 'U/2026/012', title: 'Schody proste — 32-050', client: 'Piotr Zieliński', amount: 14_900, deposit: 4_470, stage: 'sent', date: at(-4, 9) },
  { id: 'U/2026/009', title: 'Schody kręcone — 30-218', client: 'Ewa Mazur', amount: 22_300, deposit: 6_690, stage: 'done', date: at(-30, 10) },
];

export function DemoContracts() {
  return (
    <div className="mx-auto max-w-3xl">
      <Title>Umowy</Title>
      <ul className="space-y-2.5" data-testid="crm-demo-contracts">
        {CONTRACTS.map((c) => {
          const idx = CSTEPS.findIndex(([k]) => k === c.stage);
          return (
            <li key={c.id} className="rounded-2xl border border-line bg-white px-4 py-3.5">
              <div className="flex items-start gap-3">
                <FileSignature size={18} className="mt-0.5 shrink-0 text-oak" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{c.title}</div>
                  <div className="text-[12px] text-muted">{c.client} · {c.id} · {fmtDay(c.date)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13.5px] font-semibold tabular-nums">{zl(c.amount)}</div>
                  <div className="text-[11px] text-muted">zaliczka {zl(c.deposit)}</div>
                </div>
              </div>
              <ol className="mt-3 grid grid-cols-4 gap-1">
                {CSTEPS.map(([k, label], i) => (
                  <li key={k} className="min-w-0">
                    <div className={`h-1.5 rounded-full ${i <= idx ? (c.stage === 'done' ? 'bg-ok' : 'bg-oak') : 'bg-line'}`} />
                    <div className={`mt-1 flex items-center gap-1 truncate text-[10.5px] ${i <= idx ? 'text-ink' : 'text-muted'}`}>{i < idx || c.stage === 'done' ? <Check size={11} className="shrink-0" /> : null}{label}</div>
                  </li>
                ))}
              </ol>
              {c.montage && <div className="mt-2 flex items-center gap-1.5 text-[12px] text-ink/80"><Hammer size={13} />Montaż: {fmtDay(c.montage)} {fmtTime(c.montage)}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------- Kalendarz ----------------
const EVENTS: Array<{ when: Date; kind: 'pomiar' | 'montaz' | 'dostawa'; title: string; who: string; place: string }> = [
  { when: at(0, 16, 30), kind: 'pomiar', title: 'Pomiar — schody U', who: 'Katarzyna Kowalska', place: 'Kraków 31-500' },
  { when: at(2, 9), kind: 'dostawa', title: 'Dostawa drewna (dąb 40 mm)', who: 'Dąb-Pol', place: 'Warsztat' },
  { when: at(3, 10), kind: 'pomiar', title: 'Pomiar — schody proste', who: 'Piotr Zieliński', place: 'Wieliczka 32-020' },
  { when: at(12, 8), kind: 'montaz', title: 'Montaż — schody L', who: 'Tomasz Nowak', place: 'Kraków 30-061' },
];
const KIND = { pomiar: { icon: <Ruler size={14} />, cls: 'bg-[#e8f0fd] text-[#2f6fd6]', label: 'Pomiar' }, montaz: { icon: <Hammer size={14} />, cls: 'bg-ok-soft text-ok', label: 'Montaż' }, dostawa: { icon: <Truck size={14} />, cls: 'bg-warn-soft text-warn', label: 'Dostawa' } };

export function DemoCalendar() {
  const week = Array.from({ length: 14 }, (_, i) => at(i, 0));
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  return (
    <div className="mx-auto max-w-3xl">
      <Title>Kalendarz</Title>
      <div className="choices -mx-3 mb-4 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:px-0" data-testid="crm-demo-calendar-strip">
        {week.map((d, i) => {
          const n = EVENTS.filter((e) => same(e.when, d)).length;
          return (
            <div key={i} className={`flex w-12 shrink-0 flex-col items-center rounded-xl border py-1.5 ${i === 0 ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}>
              <span className={`text-[10px] uppercase ${i === 0 ? 'text-white/70' : 'text-muted'}`}>{d.toLocaleDateString('pl-PL', { weekday: 'short' })}</span>
              <span className="text-[15px] font-semibold tabular-nums">{d.getDate()}</span>
              <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${n ? (i === 0 ? 'bg-white' : 'bg-oak') : 'bg-transparent'}`} />
            </div>
          );
        })}
      </div>
      <ul className="space-y-2" data-testid="crm-demo-calendar">
        {EVENTS.map((e, i) => (
          <li key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
            <div className="w-14 shrink-0 text-center leading-tight"><div className="text-[11px] text-muted">{fmtDay(e.when)}</div><div className="text-[14px] font-semibold tabular-nums">{fmtTime(e.when)}</div></div>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${KIND[e.kind].cls}`}>{KIND[e.kind].icon}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium">{e.title}</div><div className="truncate text-[12px] text-muted">{e.who} · {e.place}</div></div>
            <span className="hidden text-[11px] text-muted sm:inline">SMS-przypomnienie</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- Aktywność ----------------
const NOTES: Array<{ when: Date; icon: ReactNode; cls: string; title: string; text: string; unread: boolean }> = [
  { when: at(0, 9, 40), icon: <FileSignature size={15} />, cls: 'bg-ok text-white', title: 'Inwestor zaakceptował umowę', text: 'Katarzyna Kowalska · Schody U — 31-500 · 28 500 zł', unread: true },
  { when: at(0, 9, 12), icon: <MessageSquare size={15} />, cls: 'bg-[#2f6fd6] text-white', title: 'Nowa wiadomość od inwestora', text: '„Czy przy balustradzie ze szkła cena zmieni się dużo?”', unread: true },
  { when: at(0, 8, 5), icon: <Banknote size={15} />, cls: 'bg-ok text-white', title: 'Wpłacono zaliczkę', text: 'Tomasz Nowak · 9 360 zł (30%) · Schody L — 30-061', unread: true },
  { when: at(-1, 20, 15), icon: <Eye size={15} />, cls: 'bg-paper text-muted', title: 'Inwestor otworzył projekt', text: 'Piotr Zieliński · Schody proste — 32-050', unread: false },
  { when: at(-1, 17, 0), icon: <CalendarDays size={15} />, cls: 'bg-paper text-muted', title: 'Przypomnienie: pomiar jutro 16:30', text: 'Katarzyna Kowalska · Kraków 31-500', unread: false },
  { when: at(-2, 12, 30), icon: <Inbox size={15} />, cls: 'bg-paper text-muted', title: 'Nowy projekt do wyceny', text: 'Anna Wiśniewska · Schody kręcone — 32-020', unread: false },
];

export function DemoActivity() {
  return (
    <div className="mx-auto max-w-3xl">
      <Title right={<span className="flex items-center gap-1 text-[12px] text-muted"><Bell size={13} />{NOTES.filter((n) => n.unread).length} nowe</span>}>Aktywność</Title>
      <ul className="overflow-hidden rounded-2xl border border-line bg-white" data-testid="crm-demo-activity">
        {NOTES.map((n, i) => (
          <li key={i} className={`flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 ${n.unread ? 'bg-[#fff6f5]' : ''}`}>
            <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.cls}`}>{n.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium leading-snug">{n.title}</div>
              <div className="line-clamp-2 text-[12.5px] text-ink/75">{n.text}</div>
              <div className="text-[11.5px] text-muted">{fmtWhen(n.when)}</div>
            </div>
            {n.unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d92d20]" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
