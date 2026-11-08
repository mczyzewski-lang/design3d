// UI projektu zapisanego na serwerze: Zapisz ▾ (wersje), Udostępnij (link / e-mail / SMS), komentarze 3D, bramka linku.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Copy, HardHat, House, KeyRound, Lock, Mail, MessageCirclePlus, MessageSquare, Save, Send, Share2, X } from 'lucide-react';
import { useConfig } from '../store/store';
import { isDirty, useStudio } from './studioStore';
import { api } from './api';

const fmt = (iso: string) => new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

function Modal({ open, onClose, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div className={`w-full ${width} rounded-2xl bg-white p-5 shadow-2xl`} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} onMouseDown={(e) => e.stopPropagation()}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------- Zapisz ▾ + Udostępnij ----------------

export function ProjectActions({ toast }: { toast: (m: string) => void }) {
  const st = useStudio();
  const config = useConfig();
  const [menu, setMenu] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dirty = isDirty(st, config);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { if (st.error) { toast(st.error); st.clearError(); } }, [st.error]); // eslint-disable-line react-hooks/exhaustive-deps
  if (st.role === 'none') return null;
  const owner = st.role === 'owner';

  const save = async () => {
    let name: string | undefined;
    if (!owner) {
      const n = prompt(st.role === 'contractor' ? 'Zapisz własną kopię projektu — nazwa:' : 'Nazwa projektu (np. „Schody — dom Kowalskich”):', st.role === 'contractor' ? `${st.name} (kopia)` : st.name);
      if (n === null) return;
      name = n.trim() || st.name;
    }
    if (await st.save(name)) toast(owner ? `Zapisano — nadpisano wersję ${st.version}` : 'Projekt zapisany');
  };
  const saveVersion = async () => {
    setMenu(false);
    const next = (st.versions[0]?.version ?? 0) + 1;
    const label = prompt('Nazwa nowej wersji:', `Wersja ${next}`);
    if (label === null) return;
    if (await st.saveAsVersion(label.trim() || undefined)) toast(`Zapisano jako nową wersję (${useStudio.getState().version})`);
  };

  return (
    <div className="flex items-center gap-1.5">
      {owner && st.versions.length > 0 && <span className="hidden text-[11.5px] text-muted lg:inline">{st.name} · wersja {st.version}{dirty ? ' · niezapisane zmiany' : ''}</span>}
      {st.role === 'contractor' && <span className="hidden items-center gap-1 rounded-full bg-[#e8f0fd] px-2.5 py-1 text-[11.5px] text-[#2f6fd6] md:flex"><HardHat size={13} />{st.viewerName} · firma wykonawcza</span>}
      {(owner || st.role === 'local') && (
        <button type="button" data-testid="share-project" onClick={() => setShareOpen(true)} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12.5px] hover:border-oak">
          <Share2 size={14} /> <span className="hidden sm:inline">Udostępnij ten projekt</span>
        </button>
      )}
      <div className="relative flex" ref={ref}>
        <button type="button" data-testid="save" disabled={st.busy} onClick={save} className="flex items-center gap-2 rounded-l-full bg-ink py-1.5 pl-3 pr-2.5 sm:pl-4 sm:pr-3 text-[12.5px] font-medium text-white hover:bg-ink/85 disabled:opacity-60">
          <Save size={14} /> <span className={st.busy ? '' : 'hidden min-[400px]:inline'}>{st.busy ? 'Zapisywanie…' : st.role === 'contractor' ? 'Zapisz kopię' : 'Zapisz'}</span>
          {dirty && owner && <span className="h-1.5 w-1.5 rounded-full bg-[#f3a845]" title="Niezapisane zmiany" />}
        </button>
        <button type="button" data-testid="save-menu" aria-label="Więcej opcji zapisu" onClick={() => { setMenu(!menu); void st.refreshProjects(); }} className="rounded-r-full border-l border-white/20 bg-ink px-2 text-white hover:bg-ink/85">
          <ChevronDown size={15} />
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-line bg-white p-1.5 shadow-xl">
              <Item testId="save-version" onClick={saveVersion}><Save size={14} /> Zapisz jako nową wersję…</Item>
              {owner && st.versions.length > 0 && <Hdr>Wersje projektu</Hdr>}
              {owner && st.versions.map((v) => (
                <Item key={v.version} active={v.version === st.version} onClick={() => { setMenu(false); void st.loadVersion(v.version).then(() => toast(`Wczytano: ${v.label}`)); }}>
                  <div><div className="font-medium">{v.label}</div><div className="text-[10.5px] text-muted">zapisano {fmt(v.updated_at)}</div></div>
                </Item>
              ))}
              {owner && (
                <Item onClick={async () => { setMenu(false); const url = await st.ownerLink(); if (url) { await copy(url); toast('Skopiowano link właściciela (7 dni) — otwórz go na innym urządzeniu'); } }}>
                  <KeyRound size={14} /> Link właściciela (inne urządzenie)
                </Item>
              )}
              {st.myProjects.length > 0 && <Hdr>Moje projekty</Hdr>}
              {st.myProjects.slice(0, 8).map((p) => (
                <Item key={p.id} active={p.id === st.projectId} onClick={() => { setMenu(false); void st.openProject(p.id).then(() => toast(`Otwarto: ${p.name}`)); }}>
                  <div><div className="font-medium">{p.name}</div><div className="text-[10.5px] text-muted">wersja {p.current_version} · {fmt(p.updated_at)}</div></div>
                </Item>
              ))}
              {owner && <Item onClick={() => { setMenu(false); st.newLocal(); toast('Nowy projekt — zapisz, aby utworzyć'); }}>+ Nowy projekt (od bieżących schodów)</Item>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} toast={toast} />
    </div>
  );
}

const Item = ({ onClick, children, active, testId }: { onClick: () => void; children: ReactNode; active?: boolean; testId?: string }) => (
  <button type="button" data-testid={testId} onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-paper">
    {children}{active && <Check size={14} className="ml-auto text-oak" />}
  </button>
);
const Hdr = ({ children }: { children: ReactNode }) => <div className="mx-2.5 mt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{children}</div>;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareDialog({ open, onClose, toast }: { open: boolean; onClose: () => void; toast: (m: string) => void }) {
  const st = useStudio();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setUrl(null);
    void st.ensureShare().then((u) => { if (u) setUrl(u); else onClose(); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = `Projekt schodów „${st.name}” w Stair Studio — zobacz i wyceń: `;
  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[15px] font-semibold">Udostępnij ten projekt</div>
          <div className="text-[12px] text-muted">Link zawsze pokazuje bieżącą wersję. Firma wykonawcza zobaczy projekt po krótkiej rejestracji.</div>
        </div>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
      </div>
      <div className="mt-4 flex gap-2">
        <input data-testid="share-url" readOnly value={url ?? 'Zapisywanie projektu…'} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px]" onFocus={(e) => e.target.select()} />
        <button type="button" disabled={!url} onClick={async () => { if (url && (await copy(url))) { setCopied(true); toast('Skopiowano link'); } }} className="flex items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] text-white disabled:opacity-50">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Skopiowano' : 'Kopiuj'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a data-testid="share-email" aria-disabled={!url} href={url ? `mailto:?subject=${encodeURIComponent(`Projekt schodów: ${st.name}`)}&body=${encodeURIComponent(`Dzień dobry,\n\n${text}\n${url}?via=email\n\nPozdrawiam`)}` : undefined} className="flex items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-[13px] hover:border-oak">
          <Mail size={15} /> Wyślij e-mailem
        </a>
        <a data-testid="share-sms" aria-disabled={!url} href={url ? `sms:?&body=${encodeURIComponent(`${text}${url}?via=sms`)}` : undefined} className="flex items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-[13px] hover:border-oak">
          <MessageSquare size={15} /> Wyślij SMS-em
        </a>
      </div>
      {st.contractors.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Firmy, które otworzyły projekt</div>
          <ul className="mt-1.5 space-y-1.5">
            {st.contractors.map((c) => (
              <li key={c.email} className="rounded-lg bg-paper px-3 py-2 text-[12px]">
                <div className="font-medium">{c.first_name} {c.last_name}</div>
                <div className="text-muted"><a className="underline" href={`mailto:${c.email}`}>{c.email}</a> · <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a> · ostatnio {fmt(c.last_at)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

// ---------------- komentarze ----------------

export function CommentComposer() {
  const pending = useStudio((s) => s.pendingPin);
  const mode = useStudio((s) => s.commentMode);
  const role = useStudio((s) => s.role);
  const add = useStudio((s) => s.addComment);
  const setPending = useStudio((s) => s.setPendingPin);
  const setMode = useStudio((s) => s.setCommentMode);
  const [text, setText] = useState('');
  if (role === 'none' || (!pending && !mode)) return null;
  return (
    <div className="pointer-events-auto w-[min(440px,calc(100%-24px))] rounded-2xl border border-line bg-white/95 p-3 shadow-xl backdrop-blur" data-testid="comment-composer">
      {!pending ? (
        <div className="flex items-center gap-2 text-[12.5px]">
          <MessageCirclePlus size={16} className="text-oak" /> Kliknij w schody lub pomieszczenie, aby przypiąć komentarz w tym miejscu.
          <button type="button" onClick={() => setMode(false)} className="ml-auto text-muted hover:text-ink"><X size={16} /></button>
        </div>
      ) : (
        <form onSubmit={async (e) => { e.preventDefault(); if (text.trim() && (await add(text.trim(), pending))) setText(''); }}>
          <textarea data-testid="comment-text" autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Komentarz w tym miejscu, np. „Tu balustrada szklana zamiast prętów?”" className="w-full resize-none rounded-lg border border-line px-3 py-2 text-[13px] outline-none focus:border-oak" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => { setPending(null); setMode(false); setText(''); }} className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted hover:text-ink">Anuluj</button>
            <button type="submit" data-testid="comment-submit" className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] text-white"><Send size={13} /> Dodaj komentarz</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function CommentsCard() {
  const st = useStudio();
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  // rozwiń przy wskazaniu komentarza na modelu
  useEffect(() => { if (st.activeComment) setExpanded(true); }, [st.activeComment]);
  useEffect(() => {
    if (st.role !== 'owner' && st.role !== 'contractor') return;
    const t = setInterval(() => { if (!document.hidden) void useStudio.getState().loadComments(); }, 15000);
    return () => clearInterval(t);
  }, [st.role, st.projectId, st.shareToken]);
  useEffect(() => {
    if (st.activeComment) document.getElementById(`comment-${st.activeComment}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [st.activeComment]);
  if (st.role === 'none') return null;
  const open = st.comments.filter((c) => !c.resolved).length;
  return (
    <div className={`mx-3 mb-3 rounded-2xl border border-line bg-white ${expanded ? 'p-4' : 'px-4 py-2'}`} data-testid="comments-card">
      <div className="flex items-center justify-between">
        <button type="button" data-testid="comments-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink">
          Komentarze {st.comments.length ? `(${open} otwarte)` : ''}
          <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" data-testid="comment-mode" onClick={() => st.setCommentMode(!st.commentMode)} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] ${st.commentMode ? 'bg-oak text-white' : 'border border-line hover:border-oak'}`}>
          <MessageCirclePlus size={13} /> Przypnij w 3D
        </button>
      </div>
      {expanded && (<>
      {st.comments.length === 0 && <p className="mt-2 text-[12px] text-muted">{st.role === 'local' ? 'Komentarze zapisują się w projekcie — pierwszy komentarz zapisze projekt.' : 'Brak komentarzy. Przypnij uwagę w konkretnym miejscu schodów.'}</p>}
      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
        {st.comments.map((c, i) => (
          <li key={c.id} id={`comment-${c.id}`} onClick={() => st.setActiveComment(st.activeComment === c.id ? null : c.id)}
            className={`cursor-pointer rounded-xl px-3 py-2 text-[12.5px] ${st.activeComment === c.id ? 'bg-oak-soft/70 ring-1 ring-oak' : 'bg-paper'} ${c.resolved ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2">
              <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10.5px] font-bold text-white ${c.resolved ? 'bg-[#a8a29a]' : c.author_role === 'contractor' ? 'bg-[#2f6fd6]' : 'bg-oak'}`}>{c.pos ? i + 1 : '•'}</span>
              <span className="font-medium">{c.author_name}</span>
              <span className="text-[10.5px] text-muted">{fmt(c.created_at)} · w. {c.version}</span>
              {st.role === 'owner' && (
                <button type="button" onClick={(e) => { e.stopPropagation(); void st.resolveComment(c.id, !c.resolved); }} className="ml-auto text-[10.5px] text-muted hover:text-ink">{c.resolved ? 'Otwórz' : 'Rozwiązane'}</button>
              )}
            </div>
            <div className="mt-1 whitespace-pre-wrap">{c.text}</div>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (text.trim() && (await st.addComment(text.trim(), null))) setText(''); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Komentarz ogólny…" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-[12.5px] outline-none focus:border-oak" />
        <button type="submit" className="rounded-lg border border-line px-2.5 text-muted hover:text-ink" aria-label="Wyślij"><Send size={14} /></button>
      </form>
      </>)}
    </div>
  );
}

// ---------------- bramka udostępnionego linku ----------------

export function ShareGate() {
  const gate = useStudio((s) => s.gate);
  const register = useStudio((s) => s.register);
  const continueAsOwner = useStudio((s) => s.continueAsOwner);
  const [who, setWho] = useState<'pick' | 'owner' | 'contractor'>('pick');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', consent: false, leads: false, postalCode: '', radiusKm: '30' });
  const [thumbOk, setThumbOk] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ownerMsg, setOwnerMsg] = useState<string | null>(null);
  if (!gate) return null;
  const thumb = gate.thumb && thumbOk ? gate.thumb : null;
  const field = (k: 'firstName' | 'lastName' | 'email' | 'phone', label: string, type = 'text', auto = '') => (
    <label className="block">
      <span className="text-[11.5px] text-muted">{label}</span>
      <input data-testid={`gate-${k}`} required type={type} autoComplete={auto} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-0.5 w-full rounded-lg border border-line px-3 py-2 text-[13.5px] outline-none focus:border-oak" />
    </label>
  );
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#f7f5f1]/30" data-testid="share-gate">
      <div className="flex min-h-full items-center justify-center p-4">
      <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-md rounded-3xl bg-white/95 p-6 shadow-2xl backdrop-blur">
        {/* podgląd projektu: duży przy wyborze, mały przy formularzu */}
        {thumb && who === 'pick' && (
          <img src={thumb} alt={`Podgląd projektu „${gate.name}”`} data-testid="gate-thumb-large" onError={() => setThumbOk(false)}
            className="mb-4 aspect-[16/10] w-full rounded-2xl bg-paper object-cover ring-1 ring-line" />
        )}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Stair Studio · design3d.pl</div>
            <div className="mt-1 text-[19px] font-semibold leading-tight">Udostępniono Ci projekt schodów</div>
            <div className="mt-0.5 truncate text-[13px] text-muted">„{gate.name}”</div>
          </div>
          {thumb && who !== 'pick' && (
            <img src={thumb} alt="" data-testid="gate-thumb-small" onError={() => setThumbOk(false)} className="h-16 w-24 shrink-0 rounded-xl bg-paper object-cover ring-1 ring-line" />
          )}
        </div>
        {who === 'pick' && (
          <div className="mt-5 grid gap-2.5">
            <button type="button" data-testid="gate-owner" onClick={async () => { setWho('owner'); setOwnerMsg(null); if (!(await continueAsOwner())) setOwnerMsg('Na tym urządzeniu nie ma aktywnej sesji właściciela. Otwórz projekt na urządzeniu, na którym go zapisałeś, albo użyj „Linku właściciela” z menu Zapisz ▾.'); }}
              className="flex items-center gap-3 rounded-2xl border border-line p-4 text-left hover:border-oak">
              <House size={22} className="text-oak" /><div><div className="text-[14px] font-medium">Jestem właścicielem projektu</div><div className="text-[12px] text-muted">Otwórz i edytuj swój projekt</div></div>
            </button>
            <button type="button" data-testid="gate-contractor" onClick={() => setWho('contractor')} className="flex items-center gap-3 rounded-2xl border border-line p-4 text-left hover:border-oak">
              <HardHat size={22} className="text-[#2f6fd6]" /><div><div className="text-[14px] font-medium">Firma wykonawcza schodów</div><div className="text-[12px] text-muted">Zobacz projekt, wymiary i przygotuj wycenę</div></div>
            </button>
          </div>
        )}
        {who === 'owner' && (
          <div className="mt-5">
            {ownerMsg ? <p className="rounded-xl bg-paper p-3 text-[12.5px]"><Lock size={14} className="mb-0.5 mr-1 inline" />{ownerMsg}</p> : <p className="text-[12.5px] text-muted">Sprawdzanie sesji…</p>}
            <button type="button" onClick={() => setWho('pick')} className="mt-3 text-[12.5px] text-muted underline">Wróć</button>
          </div>
        )}
        {who === 'contractor' && (
          <form className="mt-4 grid gap-2.5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await register(form); setBusy(false); setErrors(r ?? []); }}>
            <div className="grid grid-cols-2 gap-2.5">{field('firstName', 'Imię', 'text', 'given-name')}{field('lastName', 'Nazwisko', 'text', 'family-name')}</div>
            {field('email', 'E-mail', 'email', 'email')}
            {field('phone', 'Telefon', 'tel', 'tel')}
            <label className="flex items-start gap-2 text-[11.5px] leading-snug text-ink/75">
              <input data-testid="gate-consent" type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5" />
              <span>{gate.consentText}</span>
            </label>
            <label className="flex items-start gap-2 text-[11.5px] leading-snug text-ink/75">
              <input data-testid="gate-leads" type="checkbox" checked={form.leads} onChange={(e) => setForm({ ...form, leads: e.target.checked })} className="mt-0.5" />
              <span><span className="font-medium text-ink">{gate.leadsText}</span> <span className="text-muted">(dobrowolne, możesz zrezygnować w każdej chwili)</span></span>
            </label>
            {form.leads && (
              <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-paper p-2.5">
                <label className="block">
                  <span className="text-[11.5px] text-muted">Kod pocztowy</span>
                  <input data-testid="gate-postalCode" required inputMode="numeric" autoComplete="postal-code" placeholder="00-000" maxLength={6} value={form.postalCode}
                    onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 5); setForm({ ...form, postalCode: d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d }); }}
                    className="mt-0.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px] outline-none focus:border-oak" />
                </label>
                <label className="block">
                  <span className="text-[11.5px] text-muted">Promień (km)</span>
                  <input data-testid="gate-radiusKm" required type="number" inputMode="numeric" min={5} max={300} step={5} value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px] outline-none focus:border-oak" />
                </label>
              </div>
            )}
            {errors.length > 0 && <div className="rounded-lg bg-bad-soft px-3 py-2 text-[12px] text-bad" data-testid="gate-errors">{errors.join('. ')}</div>}
            <button type="submit" data-testid="gate-submit" disabled={busy} className="mt-1 rounded-2xl bg-ink py-3 text-[14px] font-medium text-white hover:bg-ink/85 disabled:opacity-60">
              {busy ? 'Chwileczkę…' : 'Zobacz i wyceń projekt schodów'}
            </button>
            <button type="button" onClick={() => setWho('pick')} className="text-[12px] text-muted underline">Wróć</button>
          </form>
        )}
      </motion.div>
      </div>
    </div>
  );
}

// ---------------- krok 2: znajdź wykonawcę z okolicy ----------------

export function FindContractorCard() {
  const role = useStudio((s) => s.role);
  const [open, setOpen] = useState(false);
  if (role !== 'local' && role !== 'owner') return null;
  return (
    <>
      <div className="mx-3 mb-3 flex items-center gap-3 rounded-2xl border border-oak/40 bg-oak-soft/40 px-4 py-3" data-testid="find-contractor-card">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-oak">Krok 2 · bezpłatnie</div>
          <div className="text-[13px] font-medium leading-tight">Znajdź wykonawcę z okolicy</div>
        </div>
        <button type="button" data-testid="find-contractor" onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[12px] font-medium text-white hover:bg-ink/85">Znajdź wykonawcę</button>
      </div>
      <FindContractorDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function FindContractorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const requestQuotes = useStudio((s) => s.requestQuotes);
  const [form, setForm] = useState({ name: '', email: '', phone: '', postalCode: '', radiusKm: '30', consent: false });
  const [consentText, setConsentText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { nearby: number }>(null);
  useEffect(() => {
    if (!open) return;
    setDone(null); setErrors([]);
    if (!consentText) void api.me().then((m) => setConsentText(m.texts.quote)).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = 'mt-0.5 w-full rounded-lg border border-line px-3 py-2 text-[13.5px] outline-none focus:border-oak';
  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[15px] font-semibold">Znajdź wykonawcę z okolicy</div>
          <div className="text-[12px] text-muted">Bezpłatnie. Przekażemy Twój projekt firmom schodowym działającym w pobliżu — odezwą się z wyceną.</div>
        </div>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
      </div>
      {done ? (
        <div className="mt-4 rounded-xl bg-ok-soft p-3 text-[13px]" data-testid="quote-done">
          <div className="font-medium">Dziękujemy! Zgłoszenie przyjęte.</div>
          <div className="mt-1 text-ink/75">
            {done.nearby > 0
              ? `W naszej bazie są wykonawcy z Twojego obszaru (${done.nearby}). Przekażemy im projekt — wyceny trafią na podany kontakt.`
              : 'Szukamy wykonawców w Twojej okolicy — przekażemy projekt, gdy tylko ich dopasujemy, i odezwiemy się na podany kontakt.'}
          </div>
          <button type="button" onClick={onClose} className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] text-white">Zamknij</button>
        </div>
      ) : (
        <form className="mt-4 grid gap-2.5" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          const r = await requestQuotes(form); setBusy(false);
          if ('errors' in r) setErrors(r.errors); else setDone(r);
        }}>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block"><span className="text-[11.5px] text-muted">Kod pocztowy inwestycji</span>
              <input data-testid="quote-postal" required inputMode="numeric" autoComplete="postal-code" placeholder="00-000" maxLength={6} value={form.postalCode}
                onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 5); setForm({ ...form, postalCode: d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d }); }} className={input} />
            </label>
            <label className="block"><span className="text-[11.5px] text-muted">Szukaj w promieniu (km)</span>
              <input data-testid="quote-radius" type="number" min={5} max={300} step={5} value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: e.target.value })} className={input} />
            </label>
          </div>
          <label className="block"><span className="text-[11.5px] text-muted">Imię</span>
            <input data-testid="quote-name" required autoComplete="given-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block"><span className="text-[11.5px] text-muted">E-mail</span>
              <input data-testid="quote-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
            </label>
            <label className="block"><span className="text-[11.5px] text-muted">Telefon</span>
              <input data-testid="quote-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
            </label>
          </div>
          <p className="-mt-1 text-[11px] text-muted">Wystarczy e-mail albo telefon.</p>
          <label className="flex items-start gap-2 text-[11.5px] leading-snug text-ink/75">
            <input data-testid="quote-consent" type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5" />
            <span>{consentText || 'Wyrażam zgodę na przekazanie projektu i kontaktu wykonawcom z mojej okolicy.'}</span>
          </label>
          {errors.length > 0 && <div className="rounded-lg bg-bad-soft px-3 py-2 text-[12px] text-bad" data-testid="quote-errors">{errors.join('. ')}</div>}
          <button type="submit" data-testid="quote-submit" disabled={busy} className="mt-1 rounded-2xl bg-ink py-3 text-[14px] font-medium text-white hover:bg-ink/85 disabled:opacity-60">
            {busy ? 'Wysyłanie…' : 'Znajdź wykonawcę'}
          </button>
        </form>
      )}
    </Modal>
  );
}
