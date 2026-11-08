// Panel wykonawcy (CRM): wyceny z projektów, kontakty inwestorów, umowy, kalendarz, skrzynka e-mail, profil firmy.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Box, CalendarDays, ChevronRight, FileSignature, Inbox, Lock, Mail, Phone, Plus, Settings, Sparkles, Users } from 'lucide-react';
import { api, type CrmOverview, type CrmQuote, type QuoteStatus } from './api';
import { useStudio } from './studioStore';
import { ConsentText } from './Consent';

type Tab = 'quotes' | 'contacts' | 'contracts' | 'calendar' | 'email' | 'profile';
const TABS: Array<{ key: Tab; label: string; icon: ReactNode }> = [
  { key: 'quotes', label: 'Wyceny', icon: <Box size={20} className="md:h-4 md:w-4" /> },
  { key: 'contacts', label: 'Kontakty', icon: <Users size={20} className="md:h-4 md:w-4" /> },
  { key: 'contracts', label: 'Umowy', icon: <FileSignature size={20} className="md:h-4 md:w-4" /> },
  { key: 'calendar', label: 'Kalendarz', icon: <CalendarDays size={20} className="md:h-4 md:w-4" /> },
  { key: 'email', label: 'E-mail', icon: <Inbox size={20} className="md:h-4 md:w-4" /> },
  { key: 'profile', label: 'Profil firmy', icon: <Settings size={20} className="md:h-4 md:w-4" /> },
];
const STATUS: Record<QuoteStatus, { label: string; cls: string }> = {
  new: { label: 'Nowa', cls: 'bg-[#e8f0fd] text-[#2f6fd6]' },
  in_progress: { label: 'W przygotowaniu', cls: 'bg-warn-soft text-warn' },
  sent: { label: 'Wysłana', cls: 'bg-oak-soft text-oak' },
  won: { label: 'Wygrana', cls: 'bg-ok-soft text-ok' },
  lost: { label: 'Przegrana', cls: 'bg-black/5 text-muted' },
};
const fmtDate = (s: string) => new Date(s).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtPLN = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł`);
const fmtTel = (p: string) => p.replace(/^\+48(\d{3})(\d{3})(\d{3})$/, '+48 $1 $2 $3');

function Pro() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white"><Sparkles size={11} />Pro</span>;
}

export function CrmShell() {
  const [data, setData] = useState<CrmOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('quotes');
  const highlight = useStudio((s) => s.projectId);
  const load = useCallback(async () => {
    try { setData(await api.crmOverview()); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const me = data?.me;
  const initials = me ? `${me.firstName[0] ?? ''}${me.lastName[0] ?? ''}`.toUpperCase() : '';
  const fresh = data?.quotes.filter((q) => q.isNew).length ?? 0;

  return (
    <div className="flex h-full flex-col bg-paper" data-testid="crm">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 sm:px-5">
        <a href="/" aria-label="design3d schody — strona główna"><img src={`${import.meta.env.BASE_URL}brand/design3d-schody-logo.svg`} alt="design3d schody" className="h-[22px] w-auto sm:h-7" /></a>
        <span className="hidden rounded-full bg-oak-soft px-2.5 py-1 text-[11px] font-medium text-oak sm:inline">Panel wykonawcy</span>
        <div className="flex-1" />
        {me && (
          <div className="flex items-center gap-2">
            <div className="hidden text-right leading-tight sm:block"><div className="text-[12.5px] font-medium">{me.companyName || `${me.firstName} ${me.lastName}`}</div><div className="text-[11px] text-muted">{me.email}</div></div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white">{initials}</span>
          </div>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* telefon: dolne menu jak w aplikacji mobilnej; desktop: menu boczne */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:z-auto md:flex md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-t-0 md:bg-panel md:px-3 md:py-4 md:pb-4 md:backdrop-blur-none" aria-label="Sekcje panelu" data-testid="crm-nav">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} type="button" data-testid={`crm-tab-${t.key}`} onClick={() => setTab(t.key)} aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 px-0.5 pb-1.5 pt-3.5 text-[10px] leading-tight md:flex-row md:justify-start md:gap-2 md:rounded-lg md:px-3 md:py-2 md:text-[13px] ${active ? 'text-ink md:bg-ink md:text-white' : 'text-muted md:text-ink/80 md:hover:bg-black/5'}`}>
                {active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-ink md:hidden" aria-hidden="true" />}
                <span className="relative">
                  {t.icon}
                  {t.key === 'quotes' && fresh > 0 && <span className="absolute -right-2.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#2f6fd6] px-1 text-[9.5px] font-semibold text-white md:hidden">{fresh}</span>}
                </span>
                <span className={`truncate ${active ? 'font-semibold md:font-normal' : ''}`}>{t.key === 'profile' ? <><span className="md:hidden">Profil</span><span className="hidden md:inline">{t.label}</span></> : t.label}</span>
                {t.key === 'quotes' && fresh > 0 && <span className={`ml-auto hidden rounded-full px-1.5 text-[10.5px] font-semibold md:inline ${active ? 'bg-white text-ink' : 'bg-[#2f6fd6] text-white'}`}>{fresh}</span>}
              </button>
            );
          })}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-6">
          {error && <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-6 text-center" data-testid="crm-error"><Lock className="mx-auto text-muted" /><p className="mt-2 text-[14px]">{error}</p><a href="/#dla-wykonawcow" className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-[13px] text-white">Dołącz jako wykonawca</a></div>}
          {!data && !error && <p className="text-[13px] text-muted">Wczytywanie…</p>}
          {data && tab === 'quotes' && <Quotes data={data} highlight={highlight} reload={load} />}
          {data && tab === 'contacts' && <Contacts data={data} />}
          {data && tab === 'contracts' && <Contracts data={data} />}
          {data && tab === 'calendar' && <Placeholder icon={<CalendarDays />} title="Kalendarz pomiarów i montaży" text="Planuj pomiary u inwestorów i terminy montażu przy każdej wycenie. Przypomnienia SMS dla Ciebie i klienta." badge={<Pro />} />}
          {data && tab === 'email' && <EmailTab />}
          {data && tab === 'profile' && <Profile data={data} reload={load} />}
        </main>
      </div>
    </div>
  );
}

function H({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3"><h1 className="text-[20px] font-semibold tracking-tight">{title}</h1><div className="flex-1" />{children}</div>;
}

function Quotes({ data, highlight, reload }: { data: CrmOverview; highlight: string | null; reload: () => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(highlight);
  const sorted = useMemo(() => [...data.quotes].sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.receivedAt.localeCompare(a.receivedAt)), [data.quotes]);
  return (
    <div className="mx-auto max-w-3xl">
      <H title="Wyceny">
        <a href="/konfigurator/?from=crm" data-testid="crm-new-quote" className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-ink/85"><Plus size={15} />Utwórz nową wycenę</a>
      </H>
      {sorted.length === 0 && <Placeholder icon={<Box />} title="Brak wycen" text="Gdy inwestor udostępni Ci projekt albo wybierze Cię w wyszukiwarce wykonawców, pojawi się tutaj." />}
      <ul className="space-y-2.5">
        {sorted.map((q) => <QuoteCard key={q.projectId} q={q} open={open === q.projectId} onToggle={() => setOpen(open === q.projectId ? null : q.projectId)} reload={reload} />)}
      </ul>
    </div>
  );
}

function QuoteCard({ q, open, onToggle, reload }: { q: CrmQuote; open: boolean; onToggle: () => void; reload: () => Promise<void> }) {
  const [status, setStatus] = useState<QuoteStatus>(q.status === 'new' ? 'in_progress' : q.status);
  const [amount, setAmount] = useState(q.amount === null ? '' : String(q.amount).replace('.', ','));
  const [note, setNote] = useState(q.note ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const openProject = () => {
    if (!q.token) return;
    void api.crmViewed(q.projectId).catch(() => {});
    location.href = `/konfigurator/p/${q.token}?view=3d`;
  };
  const save = async () => {
    try { await api.crmUpdateQuote(q.projectId, { status, amount: amount.trim() === '' ? null : amount.replace(/\s/g, ''), note }); setMsg('Zapisano'); void reload(); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <li className={`overflow-hidden rounded-2xl border bg-white ${open ? 'border-oak/50 shadow-sm' : 'border-line'}`} data-testid="crm-quote">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paper"><img src={`${import.meta.env.BASE_URL}brand/schody-mark.svg`} alt="" className="h-7 w-7" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14.5px] font-semibold" data-testid="crm-quote-title">{q.title}</span>
            {q.isNew && (
              <span className="relative inline-flex items-center rounded-full bg-[#2f6fd6] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white" data-testid="crm-new-tag">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#2f6fd6] opacity-40" aria-hidden="true" />
                <span className="relative">Nowe</span>
              </span>
            )}
          </div>
          <div className="truncate text-[12.5px] text-muted">{q.owner.name} · otrzymano {fmtDate(q.receivedAt)}</div>
        </div>
        <div className="hidden text-right sm:block">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[q.status].cls}`}>{STATUS[q.status].label}</span>
          <div className="mt-0.5 text-[12.5px] tabular-nums text-ink/80">{fmtPLN(q.amount)}</div>
        </div>
        <ChevronRight size={18} className={`shrink-0 text-muted transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-line bg-paper/50 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
            <div className="space-y-2 text-[13px]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Inwestor</div>
              <div className="font-medium">{q.owner.name}</div>
              {q.owner.phone && <a href={`tel:${q.owner.phone}`} className="flex items-center gap-2 text-ink/80 hover:text-ink"><Phone size={14} />{fmtTel(q.owner.phone)}</a>}
              {q.owner.email && <a href={`mailto:${q.owner.email}`} className="flex items-center gap-2 text-ink/80 hover:text-ink"><Mail size={14} />{q.owner.email}</a>}
              {q.postalCode && <div className="text-muted">Miejsce montażu: {q.postalCode}</div>}
              <div className="text-muted">Projekt: „{q.projectName}”{q.comments ? ` · wiadomości: ${q.comments}` : ''}</div>
              <button type="button" onClick={openProject} disabled={!q.token} data-testid="crm-open-project" className="mt-1 flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-white hover:bg-ink/85 disabled:opacity-40"><Box size={15} />Otwórz projekt 3D i wymiary</button>
            </div>
            <div className="grid gap-2">
              <label className="text-[12px] text-muted">Status
                <select data-testid="crm-status" value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)} className="mt-0.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px]">
                  {(['in_progress', 'sent', 'won', 'lost'] as QuoteStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                </select>
              </label>
              <label className="text-[12px] text-muted">Kwota wyceny (zł brutto)
                <input data-testid="crm-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="np. 28 500" className="mt-0.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px]" />
              </label>
              <label className="text-[12px] text-muted">Notatka (widoczna tylko dla Ciebie)
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-0.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px]" />
              </label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={save} data-testid="crm-save" className="rounded-lg bg-ink px-4 py-2 text-[12.5px] font-medium text-white">Zapisz wycenę</button>
                {msg && <span className="text-[12px] text-muted" data-testid="crm-save-msg">{msg}</span>}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </li>
  );
}

function Contacts({ data }: { data: CrmOverview }) {
  return (
    <div className="mx-auto max-w-3xl">
      <H title="Kontakty" />
      {data.contacts.length === 0 ? <Placeholder icon={<Users />} title="Brak kontaktów" text="Inwestorzy z Twoich wycen pojawią się tutaj automatycznie." /> : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-[13px]" data-testid="crm-contacts">
            <thead className="bg-paper text-[11px] uppercase tracking-[0.06em] text-muted"><tr><th className="px-4 py-2.5 font-semibold">Inwestor</th><th className="px-3 py-2.5 font-semibold">Kontakt</th><th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Wyceny</th><th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Ostatnio</th></tr></thead>
            <tbody>
              {data.contacts.map((c, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-3 py-2.5 text-ink/80">{c.phone && <a href={`tel:${c.phone}`} className="block hover:underline">{fmtTel(c.phone)}</a>}{c.email && <a href={`mailto:${c.email}`} className="block text-[12px] hover:underline">{c.email}</a>}{!c.phone && !c.email && <span className="text-muted">—</span>}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{c.quotes}</td>
                  <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{fmtDate(c.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Contracts({ data }: { data: CrmOverview }) {
  const won = data.quotes.filter((q) => q.status === 'won');
  return (
    <div className="mx-auto max-w-3xl">
      <H title="Umowy"><span className="flex items-center gap-2 text-[12px] text-muted">Wzory umów i podpis online <Pro /></span></H>
      {won.length === 0 ? (
        <Placeholder icon={<FileSignature />} title="Brak umów do przygotowania" text="Gdy oznaczysz wycenę jako „Wygrana”, pojawi się tutaj z danymi inwestora i kwotą — gotowa do przygotowania umowy." />
      ) : (
        <ul className="space-y-2" data-testid="crm-contracts">
          {won.map((q) => (
            <li key={q.projectId} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
              <FileSignature size={18} className="text-ok" />
              <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium">{q.title}</div><div className="text-[12px] text-muted">{q.owner.name} · {fmtPLN(q.amount)}</div></div>
              <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] text-ok">do przygotowania</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmailTab() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-8 text-center" data-testid="crm-email">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-paper"><Lock className="text-muted" /></span>
      <h2 className="mt-3 text-[17px] font-semibold">Zaloguj się, aby zobaczyć swoją skrzynkę</h2>
      <p className="mt-1 text-[13px] text-muted">Połącz pocztę firmową — wiadomości od inwestorów zobaczysz obok wycen, a odpowiedzi wyślesz bez wychodzenia z panelu.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" disabled className="rounded-xl border border-line px-3 py-2.5 text-[13px] text-muted">Połącz Gmail</button>
        <button type="button" disabled className="rounded-xl border border-line px-3 py-2.5 text-[13px] text-muted">Połącz Outlook / Microsoft 365</button>
      </div>
      <p className="mt-3 text-[11.5px] text-muted">Wkrótce dostępne.</p>
    </div>
  );
}

function Profile({ data, reload }: { data: CrmOverview; reload: () => Promise<void> }) {
  const me = data.me;
  const [f, setF] = useState({ companyName: me.companyName ?? '', phone: me.phone, postalCode: me.postalCode ?? '', radiusKm: String(me.radiusKm ?? 30), leads: me.leads });
  const [msg, setMsg] = useState<string | null>(null);
  const input = 'mt-0.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px] outline-none focus:border-oak';
  return (
    <div className="mx-auto grid max-w-3xl gap-4 lg:grid-cols-[1.4fr_1fr]">
      <form className="grid gap-3 rounded-2xl border border-line bg-white p-5" onSubmit={async (e) => {
        e.preventDefault();
        try { await api.crmUpdateMe(f); setMsg('Zapisano profil'); void reload(); } catch (err) { setMsg((err as Error).message); }
      }} data-testid="crm-profile">
        <h1 className="text-[18px] font-semibold">Profil firmy</h1>
        <label className="text-[12px] text-muted">Nazwa firmy (pokazywana inwestorom)<input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} className={input} /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[12px] text-muted">Imię i nazwisko<input value={`${me.firstName} ${me.lastName}`} disabled className={`${input} bg-paper text-muted`} /></label>
          <label className="text-[12px] text-muted">E-mail<input value={me.email} disabled className={`${input} bg-paper text-muted`} /></label>
        </div>
        <label className="text-[12px] text-muted">Telefon<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} /></label>
        <label className="flex items-start gap-2 text-[12px] leading-snug text-ink/80"><input type="checkbox" checked={f.leads} onChange={(e) => setF({ ...f, leads: e.target.checked })} className="mt-0.5" /><ConsentText text={data.leadsText} /></label>
        {f.leads && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] text-muted">Kod pocztowy firmy<input value={f.postalCode} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 5); setF({ ...f, postalCode: d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d }); }} className={input} /></label>
            <label className="text-[12px] text-muted">Promień działania (km)<input type="number" min={5} max={300} value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: e.target.value })} className={input} /></label>
          </div>
        )}
        <div className="flex items-center gap-3"><button type="submit" className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white">Zapisz</button>{msg && <span className="text-[12px] text-muted">{msg}</span>}</div>
      </form>
      <div className="rounded-2xl border border-line bg-white p-5" data-testid="crm-logo">
        <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Logo firmy</h2><Pro /></div>
        <div className="mt-3 grid h-32 place-items-center rounded-xl border-2 border-dashed border-line bg-paper text-center text-[12px] text-muted">
          <div><Lock size={18} className="mx-auto mb-1" />Przeciągnij plik PNG lub SVG</div>
        </div>
        <p className="mt-3 text-[12px] leading-snug text-muted">Logo na wycenach PDF, w panelu inwestora i w wynikach wyszukiwania wykonawców — dostępne w opcji <b className="text-ink">Pro</b>.</p>
        <button type="button" disabled className="mt-3 w-full rounded-lg border border-line py-2 text-[12.5px] text-muted">Przejdź na Pro — wkrótce</button>
      </div>
    </div>
  );
}

function Placeholder({ icon, title, text, badge }: { icon: ReactNode; title: string; text: string; badge?: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-paper text-muted">{icon}</span>
      <div className="mt-3 flex items-center justify-center gap-2 text-[16px] font-semibold">{title}{badge}</div>
      <p className="mt-1 text-[13px] text-muted">{text}</p>
    </div>
  );
}
