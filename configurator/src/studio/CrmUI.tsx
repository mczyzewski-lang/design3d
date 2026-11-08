// Panel wykonawcy (CRM): wyceny z projektów, kontakty inwestorów, umowy, kalendarz, skrzynka e-mail, profil firmy.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Bell, Box, Check, CalendarDays, ChevronRight, Columns3, Eye, List, MessageSquare, FileSignature, Inbox, Lock, Mail, Phone, Plus, Settings, Sparkles, Users } from 'lucide-react';
import { api, type CrmContact, type CrmHistoryItem, type CrmNotification, type CrmOverview, type CrmQuote, type QuoteStatus } from './api';
import { useStudio } from './studioStore';
import { ConsentText } from './Consent';
import { PhoneField } from './PhoneField';
import { PhoneLogin } from './PhoneLogin';
import { Elapsed } from './Elapsed';
import { DemoActivity, DemoBanner, DemoCalendar, DemoContracts, DemoEmail, DemoLink } from './CrmDemo';

type Tab = 'quotes' | 'contacts' | 'contracts' | 'activity' | 'calendar' | 'email' | 'profile';
const DEMO_TABS: Tab[] = ['contracts', 'activity', 'calendar', 'email'];
const TABS: Array<{ key: Tab; label: string; icon: ReactNode }> = [
  { key: 'quotes', label: 'Wyceny', icon: <Box size={20} className="md:h-4 md:w-4" /> },
  { key: 'contacts', label: 'Kontakty', icon: <Users size={20} className="md:h-4 md:w-4" /> },
  { key: 'contracts', label: 'Umowy', icon: <FileSignature size={20} className="md:h-4 md:w-4" /> },
  { key: 'activity', label: 'Aktywność', icon: <Bell size={20} className="md:h-4 md:w-4" /> },
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
  const badge: Partial<Record<Tab, number>> = { quotes: fresh, activity: data?.unread ?? 0 };
  // tryb demo: przykładowe umowy, terminy, e-mail i powiadomienia (tylko front)
  const [demo, setDemoState] = useState(() => { try { return localStorage.getItem('crm_demo') === '1'; } catch { return false; } });
  const setDemo = (v: boolean) => { setDemoState(v); try { localStorage.setItem('crm_demo', v ? '1' : '0'); } catch { /* tryb prywatny */ } };
  const demoTab = demo && DEMO_TABS.includes(tab);
  const demoLink = data && !demo && DEMO_TABS.includes(tab) ? <div className="mx-auto max-w-3xl text-center"><DemoLink onClick={() => setDemo(true)} /></div> : null;

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
        <nav className={`${data ? '' : '!hidden'} fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:z-auto md:flex md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-t-0 md:bg-panel md:px-3 md:py-4 md:pb-4 md:backdrop-blur-none`} aria-label="Sekcje panelu" data-testid="crm-nav">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} type="button" data-testid={`crm-tab-${t.key}`} onClick={() => setTab(t.key)} aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 px-0.5 pb-1.5 pt-3.5 text-[10px] leading-tight md:flex-row md:justify-start md:gap-2 md:rounded-lg md:px-3 md:py-2 md:text-[13px] ${active ? 'text-ink md:bg-ink md:text-white' : 'text-muted md:text-ink/80 md:hover:bg-black/5'}`}>
                {active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-ink md:hidden" aria-hidden="true" />}
                <span className="relative">
                  {t.icon}
                  {(badge[t.key] ?? 0) > 0 && <span className={`absolute -right-2.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9.5px] font-semibold text-white md:hidden ${t.key === 'activity' ? 'bg-[#d92d20]' : 'bg-[#2f6fd6]'}`} data-testid={`crm-badge-${t.key}`}>{badge[t.key]}</span>}
                </span>
                <span className={`truncate ${active ? 'font-semibold md:font-normal' : ''}`}>{t.key === 'profile' ? <><span className="md:hidden">Profil</span><span className="hidden md:inline">{t.label}</span></> : t.label}</span>
                {(badge[t.key] ?? 0) > 0 && <span className={`ml-auto hidden rounded-full px-1.5 text-[10.5px] font-semibold md:inline ${active ? 'bg-white text-ink' : t.key === 'activity' ? 'bg-[#d92d20] text-white' : 'bg-[#2f6fd6] text-white'}`}>{badge[t.key]}</span>}
              </button>
            );
          })}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-6">
          {error && (
            <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-6" data-testid="crm-error">
              <div className="text-center"><Lock className="mx-auto text-muted" /><h1 className="mt-2 text-[17px] font-semibold">Zaloguj się do panelu wykonawcy</h1><p className="mt-1 text-[13px] text-muted">Wpisz numer telefonu firmy — wyślemy kod SMS.</p></div>
              <div className="mt-4"><PhoneLogin role="contractor" compact onDone={() => { setError(null); void load(); }} /></div>
              <p className="mt-4 border-t border-line pt-3 text-center text-[12.5px] text-muted">Nie masz konta? <a href="/#dla-wykonawcow" className="font-medium text-ink underline">Dołącz jako wykonawca</a></p>
            </div>
          )}
          {!data && !error && <p className="text-[13px] text-muted">Wczytywanie…</p>}
          {data && tab === 'quotes' && <Quotes data={data} highlight={highlight} reload={load} />}
          {data && tab === 'contacts' && <Contacts data={data} reload={load} />}
          {data && demoTab && <DemoBanner onExit={() => setDemo(false)} />}
          {data && demoTab && tab === 'contracts' && <DemoContracts />}
          {data && demoTab && tab === 'activity' && <DemoActivity />}
          {data && demoTab && tab === 'calendar' && <DemoCalendar />}
          {data && demoTab && tab === 'email' && <DemoEmail />}
          {data && !demoTab && tab === 'contracts' && <Contracts data={data} />}
          {data && !demoTab && tab === 'activity' && <Activity onSeen={() => setData((d) => (d ? { ...d, unread: 0 } : d))} />}
          {data && !demoTab && tab === 'calendar' && <Placeholder icon={<CalendarDays />} title="Kalendarz pomiarów i montaży" text="Planuj pomiary u inwestorów i terminy montażu przy każdej wycenie. Przypomnienia SMS dla Ciebie i klienta." badge={<Pro />} />}
          {data && !demoTab && tab === 'email' && <EmailTab />}
          {demoLink}
          {data && tab === 'profile' && <Profile data={data} reload={load} />}
        </main>
      </div>
    </div>
  );
}

function H({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3"><h1 className="text-[20px] font-semibold tracking-tight">{title}</h1><div className="flex-1" />{children}</div>;
}

type QuoteView = 'list' | 'pipeline';
const STAGES: QuoteStatus[] = ['new', 'in_progress', 'sent', 'won', 'lost'];
const STAGE_PLURAL: Record<QuoteStatus, string> = { new: 'Nowe', in_progress: 'W przygotowaniu', sent: 'Wysłane', won: 'Wygrane', lost: 'Przegrane' };

/** Otwiera projekt 3D wyceny (i oznacza jako obejrzany). */
function openProject(q: CrmQuote) {
  if (!q.token) return;
  void api.crmViewed(q.projectId).catch(() => {});
  location.href = `/konfigurator/p/${q.token}?view=3d`;
}

function ProjectButton({ q, compact = false }: { q: CrmQuote; compact?: boolean }) {
  return (
    <button type="button" data-testid="crm-open-project-quick" disabled={!q.token} onClick={(e) => { e.stopPropagation(); openProject(q); }}
      title="Otwórz projekt 3D i wymiary"
      className={`flex shrink-0 items-center gap-1.5 rounded-full bg-ink font-semibold text-white shadow-[0_4px_12px_-4px_rgba(20,19,17,0.45)] hover:bg-ink/85 disabled:opacity-40 ${compact ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2 text-[13px]'}`}>
      <Box size={compact ? 14 : 15} />Projekt 3D
    </button>
  );
}

/** Pasek etapów jak w umowach: Nowa → W przygotowaniu → Wysłana → Wygrana (przegrana — szary pasek). */
const PIPE: Array<[QuoteStatus, string]> = [['new', 'Nowa'], ['in_progress', 'Przygotowanie'], ['sent', 'Wysłana'], ['won', 'Wygrana']];
function StageBar({ status }: { status: QuoteStatus }) {
  const lost = status === 'lost';
  const idx = lost ? 2 : PIPE.findIndex(([k]) => k === status);
  return (
    <ol className="grid grid-cols-4 gap-1" data-testid="crm-stage-bar" aria-label={`Etap: ${STATUS[status].label}`}>
      {PIPE.map(([k, label], i) => (
        <li key={k} className="min-w-0">
          <div className={`h-1.5 rounded-full ${i <= idx ? (lost ? 'bg-muted/40' : status === 'won' ? 'bg-ok' : 'bg-oak') : 'bg-line'}`} />
          <div className={`mt-1 flex items-center gap-0.5 truncate text-[10.5px] ${i === idx ? 'font-semibold text-ink' : i < idx ? 'text-ink/70' : 'text-muted'}`}>
            {i < idx || (i === idx && status === 'won') ? <Check size={11} className="shrink-0" /> : null}{lost && i === 3 ? <span className="text-bad">Przegrana</span> : label}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Quotes({ data, highlight, reload }: { data: CrmOverview; highlight: string | null; reload: () => Promise<void> }) {
  // szanse domyślnie zminimalizowane — przycisk „Projekt 3D” zawsze widoczny na karcie
  const [open, setOpen] = useState<string | null>(null);
  const [stage, setStage] = useState<QuoteStatus | 'all'>('all');
  const [view, setView] = useState<QuoteView>(() => { try { return (localStorage.getItem('crm_view') as QuoteView) || 'list'; } catch { return 'list'; } });
  const changeView = (v: QuoteView) => { setView(v); try { localStorage.setItem('crm_view', v); } catch { /* tryb prywatny */ } };
  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s, data.quotes.filter((q) => q.status === s).length])) as Record<QuoteStatus, number>, [data.quotes]);
  const sorted = useMemo(() => [...data.quotes].sort((a, b) => Number(b.projectId === highlight) - Number(a.projectId === highlight) || Number(b.isNew) - Number(a.isNew) || b.receivedAt.localeCompare(a.receivedAt)), [data.quotes, highlight]);
  const shown = stage === 'all' ? sorted : sorted.filter((q) => q.status === stage);
  const total = (list: CrmQuote[]) => list.reduce((s, q) => s + (q.amount ?? 0), 0);
  return (
    <div className={view === 'pipeline' ? '' : 'mx-auto max-w-3xl'}>
      <H title="Wyceny">
        <div className="flex items-center gap-0.5 text-muted" role="group" aria-label="Widok">
          <button type="button" data-testid="crm-view-list" onClick={() => changeView('list')} aria-pressed={view === 'list'} title="Lista" aria-label="Lista" className={`rounded-md p-1.5 ${view === 'list' ? 'bg-black/[0.06] text-ink' : 'hover:text-ink'}`}><List size={16} /></button>
          <button type="button" data-testid="crm-view-pipeline" onClick={() => changeView('pipeline')} aria-pressed={view === 'pipeline'} title="Pipeline" aria-label="Pipeline" className={`rounded-md p-1.5 ${view === 'pipeline' ? 'bg-black/[0.06] text-ink' : 'hover:text-ink'}`}><Columns3 size={16} /></button>
        </div>
        {/* „Nowa wycena” dopiero po otwarciu pierwszego projektu — wcześniej skupiamy na otrzymanych zapytaniach */}
        {data.quotes.some((q) => !q.isNew) && <a href="/konfigurator/?from=crm" data-testid="crm-new-quote" className="flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-ink/80 hover:border-ink/30 hover:text-ink"><Plus size={14} />Nowa wycena</a>}
      </H>
      {view === 'list' && (
        <div className="choices -mx-3 -mt-2 mb-3 flex gap-3.5 overflow-x-auto border-b border-line px-3 sm:mx-0 sm:px-0" data-testid="crm-stage-filter">
          {(['all', ...STAGES] as const).map((s) => (
            <button key={s} type="button" data-testid={`crm-stage-${s}`} onClick={() => setStage(s)} aria-pressed={stage === s}
              className={`-mb-px flex shrink-0 items-center gap-1 border-b-2 py-1.5 text-[12px] ${stage === s ? 'border-ink/70 text-ink' : 'border-transparent text-muted hover:text-ink/80'}`}>
              {s === 'all' ? 'Wszystkie' : STAGE_PLURAL[s]}
              <span className="text-[10.5px] tabular-nums opacity-70">{s === 'all' ? data.quotes.length : counts[s]}</span>
            </button>
          ))}
        </div>
      )}
      {data.quotes.length === 0 && <Placeholder icon={<Box />} title="Brak wycen" text="Gdy inwestor udostępni Ci projekt albo wybierze Cię w wyszukiwarce wykonawców, pojawi się tutaj." />}
      {view === 'list' ? (
        <ul className="space-y-2.5">
          {shown.map((q) => <QuoteCard key={q.projectId} q={q} open={open === q.projectId} onToggle={() => setOpen(open === q.projectId ? null : q.projectId)} reload={reload} />)}
          {data.quotes.length > 0 && shown.length === 0 && <p className="py-6 text-center text-[13px] text-muted">Brak wycen na tym etapie.</p>}
        </ul>
      ) : (
        <Pipeline quotes={sorted} reload={reload} total={total} />
      )}
    </div>
  );
}

/** Pipeline: kolumny etapów; przeciągnij kartę (desktop) albo wybierz etap z listy (telefon). */
function Pipeline({ quotes, reload, total }: { quotes: CrmQuote[]; reload: () => Promise<void>; total: (l: CrmQuote[]) => number }) {
  const [over, setOver] = useState<QuoteStatus | null>(null);
  const move = async (pid: string, s: QuoteStatus) => { await api.crmUpdateQuote(pid, { status: s }).catch(() => {}); void reload(); };
  return (
    <div className="choices -mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0" data-testid="crm-pipeline">
      {STAGES.map((s) => {
        const list = quotes.filter((q) => q.status === s);
        return (
          <section key={s} data-testid={`crm-col-${s}`} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const pid = e.dataTransfer.getData('text/plain'); if (pid) void move(pid, s); }}
            className={`flex w-[78vw] max-w-[290px] shrink-0 snap-start flex-col rounded-2xl border bg-panel/70 sm:w-64 xl:w-auto xl:min-w-0 xl:max-w-none xl:flex-1 xl:shrink ${over === s ? 'border-ink/40 bg-oak-soft/40' : 'border-line'}`}>
            <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[s].cls}`}>{STAGE_PLURAL[s]}</span>
              <span className="text-[12px] tabular-nums text-muted">{list.length}</span>
              <span className="ml-auto text-[11.5px] tabular-nums text-muted">{total(list) ? fmtPLN(total(list)) : ''}</span>
            </header>
            <div className="flex min-h-24 flex-col gap-2 p-2">
              {list.map((q) => (
                <article key={q.projectId} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', q.projectId)} data-testid="crm-pipe-card"
                  className="cursor-grab rounded-xl border border-line bg-white p-2.5 shadow-sm active:cursor-grabbing">
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1 text-[13px] font-semibold leading-tight">{q.title}</div>
                    {q.isNew && <span className="rounded-full bg-[#2f6fd6] px-1.5 text-[9.5px] font-semibold uppercase text-white">Nowe</span>}
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] text-muted">{q.owner.name}</div>
                  {(q.status === 'new' || q.status === 'in_progress') && <Elapsed since={q.receivedAt} label="" className="mt-1 text-[11px]" />}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[12.5px] font-medium tabular-nums">{fmtPLN(q.amount)}</span>
                    <span className="flex-1" />
                    <ProjectButton q={q} compact />
                  </div>
                  <label className="mt-2 block text-[11px] text-muted">Etap
                    <select data-testid="crm-pipe-stage" value={q.status} onChange={(e) => void move(q.projectId, e.target.value as QuoteStatus)} className="mt-0.5 w-full rounded-lg border border-line bg-white px-2 py-1 text-[12.5px]">
                      {STAGES.map((x) => <option key={x} value={x}>{STATUS[x].label}</option>)}
                    </select>
                  </label>
                </article>
              ))}
              {list.length === 0 && <p className="px-1 py-4 text-center text-[11.5px] text-muted">Przeciągnij tutaj</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function QuoteCard({ q, open, onToggle, reload }: { q: CrmQuote; open: boolean; onToggle: () => void; reload: () => Promise<void> }) {
  const [status, setStatus] = useState<QuoteStatus>(q.status === 'new' ? 'in_progress' : q.status);
  const [amount, setAmount] = useState(q.amount === null ? '' : String(q.amount).replace('.', ','));
  const [note, setNote] = useState(q.note ?? '');
  const [msg, setMsg] = useState<string | null>(null);
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
          <div className="text-[13px] font-semibold tabular-nums text-ink/85">{fmtPLN(q.amount)}</div>
        </div>
        <ChevronRight size={18} className={`shrink-0 text-muted transition ${open ? 'rotate-90' : ''}`} />
      </button>
      <div className="-mt-1 grid gap-2.5 px-4 pb-3.5 sm:pl-[68px]">
        <StageBar status={q.status} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {(q.status === 'new' || q.status === 'in_progress') && <Elapsed since={q.receivedAt} className="text-[12px] font-medium" />}
          <span className="text-[12.5px] font-medium tabular-nums text-ink/80 sm:hidden">{q.amount !== null ? fmtPLN(q.amount) : ''}</span>
          <span className="flex-1" />
          {!open && <ProjectButton q={q} />}
        </div>
      </div>
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
              <button type="button" onClick={() => openProject(q)} disabled={!q.token} data-testid="crm-open-project" className="mt-1 flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-white hover:bg-ink/85 disabled:opacity-40"><Box size={15} />Otwórz projekt 3D i wymiary</button>
            </div>
            <div className="grid gap-2">
              <label className="text-[12px] text-muted">Status
                <select data-testid="crm-status" value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)} className="mt-0.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px]">
                  {(['in_progress', 'sent', 'won', 'lost'] as QuoteStatus[]).map((x) => <option key={x} value={x}>{STATUS[x].label}</option>)}
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

const fmtDateTime = (s: string) => new Date(s).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function historyIcon(type: string) {
  if (type === 'owner_message' || type === 'my_message') return <MessageSquare size={14} />;
  if (type === 'owner_view' || type === 'viewed') return <Eye size={14} />;
  if (type === 'status') return <Columns3 size={14} />;
  if (type === 'amount') return <FileSignature size={14} />;
  return <Inbox size={14} />;
}

function Timeline({ items, testid }: { items: Array<CrmHistoryItem & { title?: string }>; testid: string }) {
  if (items.length === 0) return <p className="py-4 text-[13px] text-muted">Brak zdarzeń.</p>;
  return (
    <ol className="relative space-y-3 border-l border-line pl-5" data-testid={testid}>
      {items.map((h, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[29px] grid h-6 w-6 place-items-center rounded-full border border-line bg-white text-muted">{historyIcon(h.type)}</span>
          <div className="text-[13px] leading-snug">{h.text}</div>
          <div className="text-[11.5px] text-muted">{fmtDateTime(h.at)}{h.title ? ` · ${h.title}` : ''}</div>
        </li>
      ))}
    </ol>
  );
}

function Contacts({ data }: { data: CrmOverview; reload: () => Promise<void> }) {
  const [sel, setSel] = useState<string | null>(null);
  const contact = data.contacts.find((c) => c.key === sel);
  if (contact) return <ContactDetail c={contact} data={data} onBack={() => setSel(null)} />;
  return (
    <div className="mx-auto max-w-3xl">
      <H title="Kontakty" />
      {data.contacts.length === 0 ? <Placeholder icon={<Users />} title="Brak kontaktów" text="Inwestorzy z Twoich wycen pojawią się tutaj automatycznie." /> : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-white" data-testid="crm-contacts">
          {data.contacts.map((c) => {
            const qs = data.quotes.filter((q) => c.projectIds.includes(q.projectId));
            return (
              <li key={c.key} className="border-t border-line first:border-t-0">
                <button type="button" data-testid="crm-contact" onClick={() => setSel(c.key)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper/60">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper text-[12px] font-semibold text-ink/70">{c.name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{c.name}</div>
                    <div className="truncate text-[12px] text-muted">{c.phone ? fmtTel(c.phone) : c.email ?? '—'} · ostatnio {fmtDate(c.last)}</div>
                  </div>
                  <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                    {qs.slice(0, 3).map((q) => <span key={q.projectId} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[q.status].cls}`}>{STATUS[q.status].label}</span>)}
                  </div>
                  <span className="rounded-full bg-paper px-2 text-[11px] tabular-nums text-muted" title="Szanse sprzedaży">{c.quotes}</span>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ContactDetail({ c, data, onBack }: { c: CrmContact; data: CrmOverview; onBack: () => void }) {
  const qs = data.quotes.filter((q) => c.projectIds.includes(q.projectId));
  const history = qs.flatMap((q) => q.history.map((h) => ({ ...h, title: q.title }))).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="mx-auto max-w-3xl" data-testid="crm-contact-detail">
      <button type="button" onClick={onBack} data-testid="crm-contact-back" className="mb-3 flex items-center gap-1.5 text-[13px] text-ink/70 hover:text-ink"><ArrowLeft size={16} />Kontakty</button>
      <div className="rounded-2xl border border-line bg-white p-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{c.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] hover:border-ink/40"><Phone size={14} />{fmtTel(c.phone)}</a>}
          {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] hover:border-ink/40"><Mail size={14} />{c.email}</a>}
        </div>
      </div>
      <h2 className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Szanse sprzedaży ({qs.length})</h2>
      <ul className="space-y-2" data-testid="crm-contact-deals">
        {qs.map((q) => (
          <li key={q.projectId} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3" data-testid="crm-contact-deal">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{q.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[q.status].cls}`}>{STATUS[q.status].label}</span>
                {q.amount !== null && <span className="tabular-nums text-ink/80">{fmtPLN(q.amount)} ·</span>}
                <span>otrzymano {fmtDate(q.receivedAt)}</span>
              </div>
            </div>
            <ProjectButton q={q} compact />
          </li>
        ))}
      </ul>
      <h2 className="mb-3 mt-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Historia</h2>
      <div className="rounded-2xl border border-line bg-white p-4 pl-6"><Timeline items={history} testid="crm-contact-history" /></div>
    </div>
  );
}

/** Powiadomienia: nowe projekty, wiadomości i otwarcia projektu przez inwestora. */
function Activity({ onSeen }: { onSeen: () => void }) {
  const [items, setItems] = useState<CrmNotification[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.crmNotifications().then((r) => {
      if (!alive) return;
      setItems(r.items);
      onSeen();
      void api.crmNotificationsSeen().catch(() => {});
    }).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="mx-auto max-w-3xl">
      <H title="Aktywność" />
      {err && <p className="text-[13px] text-bad">{err}</p>}
      {!items && !err && <p className="text-[13px] text-muted">Wczytywanie…</p>}
      {items && items.length === 0 && <Placeholder icon={<Bell />} title="Brak powiadomień" text="Tu zobaczysz, gdy inwestor otworzy projekt, napisze wiadomość albo przyśle nowy projekt do wyceny." />}
      {items && items.length > 0 && (
        <ul className="overflow-hidden rounded-2xl border border-line bg-white" data-testid="crm-activity">
          {items.map((n, i) => (
            <li key={i} className={`flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 ${n.unread ? 'bg-[#fff6f5]' : ''}`} data-testid="crm-notification">
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.unread ? 'bg-[#d92d20] text-white' : 'bg-paper text-muted'}`}>{historyIcon(n.type)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium leading-snug">{n.title}</div>
                <div className="line-clamp-2 text-[12.5px] text-ink/75">{n.text}</div>
                <div className="text-[11.5px] text-muted">{fmtDateTime(n.at)}</div>
              </div>
              {n.token && <a href={`/konfigurator/p/${n.token}?view=3d`} className="shrink-0 rounded-full border border-ink/15 px-2.5 py-1 text-[11.5px] font-medium hover:border-ink/40">Projekt</a>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-line bg-panel px-4 py-3 text-[12.5px] text-muted" data-testid="crm-activity-pro">
        <FileSignature size={16} className="mt-0.5 shrink-0" />
        <span>Powiadomienia „Inwestor zaakceptował umowę” i „Inwestor wpłacił zaliczkę” pojawią się wraz z umowami i płatnościami online. <Pro /></span>
      </div>
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
        <div className="text-[12px] text-muted">Telefon (logowanie kodem SMS)<PhoneField value={f.phone} onChange={(v) => setF({ ...f, phone: v })} className="mt-0.5" /></div>
        <label className="flex items-start gap-2 text-[12px] leading-snug text-ink/80"><input type="checkbox" checked={f.leads} onChange={(e) => setF({ ...f, leads: e.target.checked })} className="mt-0.5" /><ConsentText text={data.leadsText} /></label>
        {f.leads && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[12px] text-muted">Kod pocztowy firmy<input value={f.postalCode} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 5); setF({ ...f, postalCode: d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d }); }} className={input} /></label>
            <label className="text-[12px] text-muted">Promień działania (km)<input type="number" min={5} max={300} value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: e.target.value })} className={input} /></label>
          </div>
        )}
        <div className="flex items-center gap-3"><button type="submit" className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white">Zapisz</button>{msg && <span className="text-[12px] text-muted">{msg}</span>}
          <button type="button" data-testid="crm-logout" onClick={async () => { await api.logout().catch(() => {}); location.href = '/konfigurator/firma'; }} className="ml-auto text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">Wyloguj</button></div>
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
