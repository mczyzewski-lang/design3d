// UI projektu zapisanego na serwerze: Zapisz ▾ (wersje), Udostępnij (link / e-mail / SMS), komentarze 3D, bramka linku.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Copy, HardHat, House, KeyRound, Lock, Mail, MessageCirclePlus, MessageSquare, Save, Send, Share2, X } from 'lucide-react';
import { useConfig } from '../store/store';
import { isDirty, useStudio } from './studioStore';
import { api, type NearbyDto } from './api';

const fmt = (iso: string) => new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

function Modal({ open, onClose, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  // portal do <body>: rodzic z backdrop-filter (nagłówek) zamykałby „fixed” w swoim obszarze
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          {/* przewijane, gdy okno jest wyższe niż ekran (telefon) */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div className={`w-full ${width} rounded-2xl bg-white p-5 shadow-2xl`} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} onMouseDown={(e) => e.stopPropagation()}>
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------- Zapisz ▾ + Udostępnij ----------------

export function ProjectActions({ toast }: { toast: (m: string) => void }) {
  const st = useStudio();
  const config = useConfig();
  const [menu, setMenu] = useState(false);
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
  const contractor = st.role === 'contractor';

  const save = async () => {
    setMenu(false);
    let name: string | undefined;
    if (!owner) {
      const n = prompt(contractor ? 'Zapisz własną kopię projektu — nazwa:' : 'Nazwa projektu (np. „Schody — dom Kowalskich”):', contractor ? `${st.name} (kopia)` : st.name);
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
      {contractor && <span className="hidden items-center gap-1 rounded-full bg-[#e8f0fd] px-2.5 py-1 text-[11.5px] text-[#2f6fd6] md:flex"><HardHat size={13} />{st.viewerName} · firma wykonawcza</span>}
      <div className="relative flex" ref={ref}>
        {contractor ? (
          <button type="button" data-testid="save" disabled={st.busy} onClick={save} className="flex items-center gap-2 rounded-l-full bg-ink py-1.5 pl-3.5 pr-3 text-[12.5px] font-medium text-white hover:bg-ink/85 disabled:opacity-60">
            <Save size={14} /> {st.busy ? 'Zapisywanie…' : 'Zapisz kopię'}
          </button>
        ) : (
          <button type="button" data-testid="save-share" disabled={st.busy} onClick={() => st.setShareOpen(true)} className="flex items-center gap-2 whitespace-nowrap rounded-l-full bg-ink py-1.5 pl-3.5 pr-3 text-[12.5px] font-medium text-white hover:bg-ink/85 disabled:opacity-60">
            <Share2 size={14} /> {st.busy ? 'Zapisywanie…' : 'Zapisz i udostępnij'}
            {dirty && owner && <span className="h-1.5 w-1.5 rounded-full bg-[#f3a845]" title="Niezapisane zmiany" />}
          </button>
        )}
        <button type="button" data-testid="save-menu" aria-label="Więcej opcji zapisu" onClick={() => { setMenu(!menu); void st.refreshProjects(); }} className="rounded-r-full border-l border-white/20 bg-ink px-2 text-white hover:bg-ink/85">
          <ChevronDown size={15} />
        </button>
        <AnimatePresence>
          {menu && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-line bg-white p-1.5 shadow-xl">
              {!contractor && <Item testId="save" onClick={save}><Save size={14} /> {owner ? 'Zapisz zmiany (bez udostępniania)' : 'Zapisz projekt (bez udostępniania)'}</Item>}
              <Item testId="save-version" onClick={saveVersion}><Save size={14} /> Zapisz jako nową wersję…</Item>
              {owner && st.versions.length > 0 && <Hdr>Wersje projektu</Hdr>}
              {owner && st.versions.map((v) => (
                <Item key={v.version} active={v.version === st.version} onClick={() => { setMenu(false); void st.loadVersion(v.version).then(() => toast(`Wczytano: ${v.label}`)); }}>
                  <div><div className="font-medium">{v.label}</div><div className="text-[10.5px] text-muted">zapisano {fmt(v.updated_at)}</div></div>
                </Item>
              ))}
              {owner && !st.phone && (
                <Item onClick={async () => { setMenu(false); const url = await st.ownerLink(); if (url) { await copy(url); toast('Skopiowano link właściciela (7 dni) — otwórz go na innym urządzeniu'); } }}>
                  <KeyRound size={14} /> Link właściciela (inne urządzenie)
                </Item>
              )}
              {st.myProjects.length > 0 && <Hdr>Moje projekty{st.phone ? ` · ${fmtPhone(st.phone)}` : ''}</Hdr>}
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
      {!contractor && <SaveShareDialog open={st.shareOpen} onClose={() => st.setShareOpen(false)} toast={toast} />}
    </div>
  );
}

export const fmtPhone = (p: string) => p.replace(/^\+48(\d{3})(\d{3})(\d{3})$/, '+48 $1 $2 $3');

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

/** Krok w oknie „Zapisz i udostępnij” — numerowany, widoczny od razu, nieaktywny do czasu poprzedniego kroku. */
function Step({ n, title, done, active, children, testId }: { n: number; title: string; done: boolean; active: boolean; children: ReactNode; testId?: string }) {
  return (
    <li className={`relative pl-10 ${active || done ? '' : 'opacity-55'}`} data-testid={testId}>
      <span className={`absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full text-[12.5px] font-bold ${done ? 'bg-ok text-white' : active ? 'bg-ink text-white' : 'border border-line bg-paper text-muted'}`}>{done ? <Check size={15} /> : n}</span>
      <div className="text-[14px] font-semibold leading-7">{title}</div>
      <div className="mt-1">{children}</div>
    </li>
  );
}

export function SaveShareDialog({ open, onClose, toast }: { open: boolean; onClose: () => void; toast: (m: string) => void }) {
  const st = useStudio();
  const [phoneInput, setPhoneInput] = useState('');
  const [sent, setSent] = useState<null | { phone: string; testCode?: string }>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const verified = !!st.phone;
  useEffect(() => {
    if (!open) return;
    setErr(null); setCopied(false); setUrl(null);
    // numer już potwierdzony → od razu zapis i link
    if (st.phone) void st.ensureShare().then((u) => { if (u) setUrl(u); });
  }, [open, st.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setErr(null);
    const r = await st.startPhone(phoneInput);
    setBusy(false);
    if ('error' in r) setErr(r.error); else { setSent(r); setCode(''); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sent) return;
    setBusy(true); setErr(null);
    const r = await st.verifyPhone(sent.phone, code);
    setBusy(false);
    if (r) setErr(r); else toast('Numer potwierdzony — projekt przypisany');
  };
  const text = `Projekt schodów „${st.name}” w Stair Studio — zobacz i wyceń: `;
  const input = 'w-full rounded-lg border border-line px-3 py-2 text-[14px] outline-none focus:border-oak';

  return (
    <>
      <Modal open={open && !findOpen} onClose={onClose}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[15px] font-semibold">Zapisz i udostępnij projekt</div>
            <div className="text-[12px] text-muted">Trzy kroki — wszystko bezpłatnie.</div>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Zamknij"><X size={18} /></button>
        </div>
        <ol className="mt-4 space-y-5" data-testid="save-share-dialog">
          <Step n={1} title="Przypisz projekt do numeru telefonu" done={verified} active={!verified} testId="step-phone">
            {verified ? (
              <p className="text-[12.5px] text-ink/80" data-testid="phone-done">Projekt przypisany do numeru <b>{fmtPhone(st.phone!)}</b>. Na innym urządzeniu wystarczy ten sam numer.</p>
            ) : !sent ? (
              <form className="flex gap-2" onSubmit={send}>
                <div className="flex min-w-0 flex-1 items-center rounded-lg border border-line focus-within:border-oak">
                  <span className="pl-3 text-[14px] text-muted">+48</span>
                  <input data-testid="phone-input" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="600 100 200" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[14px] outline-none" />
                </div>
                <button type="submit" data-testid="phone-send" disabled={busy || phoneInput.replace(/\D/g, '').length < 9} className="shrink-0 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-white disabled:opacity-50">{busy ? 'Wysyłanie…' : 'Wyślij kod SMS'}</button>
              </form>
            ) : (
              <form className="grid gap-2" onSubmit={verify}>
                <p className="text-[12px] text-muted">Wysłaliśmy 6-cyfrowy kod na <b className="text-ink">{fmtPhone(sent.phone)}</b>.</p>
                {sent.testCode && <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn" data-testid="phone-test-code">Tryb testowy (bramka SMS nie jest jeszcze skonfigurowana) — Twój kod: <b className="tracking-[0.2em]">{sent.testCode}</b></p>}
                <div className="flex gap-2">
                  <input data-testid="phone-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${input} text-center tracking-[0.4em]`} />
                  <button type="submit" data-testid="phone-verify" disabled={busy || code.length !== 6} className="shrink-0 rounded-lg bg-ink px-4 text-[12.5px] font-medium text-white disabled:opacity-50">{busy ? '…' : 'Potwierdź'}</button>
                </div>
                <button type="button" onClick={() => { setSent(null); setErr(null); }} className="justify-self-start text-[11.5px] text-muted underline">Zmień numer lub wyślij kod ponownie</button>
              </form>
            )}
            {err && <div className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-[12px] text-bad" data-testid="phone-error">{err}</div>}
          </Step>

          <Step n={2} title="Link do projektu" done={!!url} active={verified && !url} testId="step-link">
            {url ? (
              <>
                <div className="flex gap-2">
                  <input data-testid="share-url" readOnly value={url} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px]" onFocus={(e) => e.target.select()} />
                  <button type="button" onClick={async () => { if (await copy(url)) { setCopied(true); toast('Skopiowano link'); } }} className="flex items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] text-white">
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Skopiowano' : 'Kopiuj'}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <a data-testid="share-email" href={`mailto:?subject=${encodeURIComponent(`Projekt schodów: ${st.name}`)}&body=${encodeURIComponent(`Dzień dobry,\n\n${text}\n${url}?via=email\n\nPozdrawiam`)}`} className="flex items-center justify-center gap-2 rounded-xl border border-line py-2 text-[12.5px] hover:border-oak"><Mail size={14} /> E-mailem</a>
                  <a data-testid="share-sms" href={`sms:?&body=${encodeURIComponent(`${text}${url}?via=sms`)}`} className="flex items-center justify-center gap-2 rounded-xl border border-line py-2 text-[12.5px] hover:border-oak"><MessageSquare size={14} /> SMS-em</a>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">Link zawsze pokazuje bieżącą wersję. Firma zobaczy projekt po krótkiej rejestracji.</p>
                {st.contractors.length > 0 && (
                  <div className="mt-3">
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
              </>
            ) : (
              <p className="text-[12px] text-muted">{verified ? 'Zapisywanie projektu i tworzenie linku…' : 'Link pojawi się po potwierdzeniu numeru.'}</p>
            )}
          </Step>

          <Step n={3} title="Znajdź wykonawców w okolicy" done={false} active={!!url} testId="step-find">
            <p className="text-[12px] text-muted">Wpisz kod pocztowy — pokażemy firmy schodowe w promieniu 50 km i poprosisz wybrane o wycenę.</p>
            <button type="button" data-testid="open-find" disabled={!url} onClick={() => setFindOpen(true)} className="mt-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-40">Znajdź wykonawców</button>
          </Step>
        </ol>
      </Modal>
      <FindContractorDialog open={findOpen} onClose={() => { setFindOpen(false); onClose(); }} />
    </>
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
  const [form, setForm] = useState({ firstName: '', lastName: '', companyName: '', email: '', phone: '', consent: false, leads: false, postalCode: '', radiusKm: '30' });
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
            <img src={`${import.meta.env.BASE_URL}brand/design3d-schody-logo.svg`} alt="design3d schody" className="h-5 w-auto" />
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
                <label className="col-span-2 block">
                  <span className="text-[11.5px] text-muted">Nazwa firmy (pokazywana inwestorom)</span>
                  <input data-testid="gate-companyName" autoComplete="organization" maxLength={120} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px] outline-none focus:border-oak" />
                </label>
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

// ---------------- krok 2: znajdź wykonawców z okolicy (tabela) ----------------

export function FindContractorCard() {
  const role = useStudio((s) => s.role);
  const setShareOpen = useStudio((s) => s.setShareOpen);
  if (role !== 'local' && role !== 'owner') return null;
  return (
    <div className="mx-3 mb-3 flex items-center gap-3 rounded-2xl border border-oak/40 bg-oak-soft/40 px-4 py-3" data-testid="find-contractor-card">
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-oak">Bezpłatnie</div>
        <div className="text-[13px] font-medium leading-tight">Porównaj wyceny wykonawców z okolicy</div>
      </div>
      <button type="button" data-testid="find-contractor" onClick={() => setShareOpen(true)} className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[12px] font-medium text-white hover:bg-ink/85">Znajdź wykonawców</button>
    </div>
  );
}

const fmtPostal = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 5); return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d; };

export function FindContractorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const requestQuotes = useStudio((s) => s.requestQuotes);
  const [postal, setPostal] = useState('');
  const [radius, setRadius] = useState(50);
  const [search, setSearch] = useState<null | NearbyDto>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const myPhone = useStudio((s) => s.phone);
  const [contact, setContact] = useState({ name: '', email: '', phone: '', consent: false });
  useEffect(() => { if (myPhone && !contact.phone) setContact((c) => ({ ...c, phone: fmtPhone(myPhone) })); }, [myPhone]); // eslint-disable-line react-hooks/exhaustive-deps
  const [consentText, setConsentText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { selected: number }>(null);
  useEffect(() => {
    if (!open) return;
    setDone(null); setErrors([]);
    if (!consentText) void api.me().then((m) => setConsentText(m.texts.quote)).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async (e?: React.FormEvent, r = radius) => {
    e?.preventDefault();
    setSearching(true); setSearchErr(null);
    try {
      const res = await api.nearby(postal, r);
      setSearch(res);
      // domyślnie zaznaczeni ci, którzy deklarują dojazd w Twój rejon
      setPicked(new Set(res.results.filter((c) => c.servesArea).map((c) => c.id)));
    } catch (err) {
      setSearch(null); setSearchErr((err as Error).message);
    } finally {
      setSearching(false);
    }
  };
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const results = search?.results ?? [];
  const allOn = results.length > 0 && results.every((c) => picked.has(c.id));
  const input = 'mt-0.5 w-full rounded-lg border border-line px-3 py-2 text-[13.5px] outline-none focus:border-oak';

  return (
    <Modal open={open} onClose={onClose} width="max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Znajdź wykonawców w okolicy</div>
          <div className="text-[12px] text-muted">Bezpłatnie i bez zobowiązań. Pokażemy firmy schodowe w promieniu {radius} km od Twojej inwestycji — najbliższe na górze.</div>
        </div>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
      </div>

      {done ? (
        <div className="mt-4 rounded-xl bg-ok-soft p-3 text-[13px]" data-testid="quote-done">
          <div className="font-medium">Dziękujemy! Zapytanie przyjęte.</div>
          <div className="mt-1 text-ink/75">
            {done.selected > 0
              ? `Przekażemy Twój projekt wybranym wykonawcom (${done.selected}) — odezwą się z wyceną na podany kontakt.`
              : 'Poszukamy dla Ciebie wykonawców z okolicy i przekażemy im projekt — odezwiemy się na podany kontakt.'}
          </div>
          <button type="button" onClick={onClose} className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] text-white">Zamknij</button>
        </div>
      ) : (
        <>
          <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={runSearch}>
            <label className="block min-w-[130px] flex-1"><span className="text-[11.5px] text-muted">Kod pocztowy inwestycji</span>
              <input data-testid="quote-postal" required inputMode="numeric" autoComplete="postal-code" placeholder="00-000" maxLength={6} value={postal} onChange={(e) => setPostal(fmtPostal(e.target.value))} className={input} />
            </label>
            <label className="block w-28"><span className="text-[11.5px] text-muted">Promień</span>
              <select data-testid="quote-radius" value={radius} onChange={(e) => { const r = Number(e.target.value); setRadius(r); if (search) void runSearch(undefined, r); }} className={input}>
                {[25, 50, 100].map((r) => <option key={r} value={r}>{r} km</option>)}
              </select>
            </label>
            <button type="submit" data-testid="quote-search" disabled={searching || postal.length < 6} className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">{searching ? 'Szukam…' : 'Szukaj'}</button>
          </form>
          {searchErr && <div className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-[12px] text-bad">{searchErr}</div>}

          {search && (
            <div className="mt-4" data-testid="nearby-results">
              <div className="text-[12.5px] text-ink/80">
                Okolice: <b>{search.origin.place}</b> ({search.origin.code}){search.origin.precision === 'area' && <span className="text-muted"> — lokalizacja przybliżona (obszar kodu)</span>} · {results.length
                  ? <>znaleziono <b>{results.length}</b> {results.length === 1 ? 'wykonawcę' : 'wykonawców'} w promieniu {search.radiusKm} km</>
                  : <>brak wykonawców w promieniu {search.radiusKm} km</>}
              </div>
              {results.length > 0 ? (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line scrollbar-thin">
                  <table className="w-full text-left text-[12.5px]" data-testid="nearby-table">
                    <thead className="sticky top-0 bg-paper text-[11px] uppercase tracking-[0.06em] text-muted">
                      <tr>
                        <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Zaznacz wszystkich" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(results.map((c) => c.id)))} /></th>
                        <th className="px-2 py-2 font-semibold">Wykonawca</th>
                        <th className="px-2 py-2 text-right font-semibold">Odległość</th>
                        <th className="hidden px-3 py-2 font-semibold sm:table-cell">Zasięg działania</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((c) => (
                        <tr key={c.id} onClick={() => toggle(c.id)} className={`cursor-pointer border-t border-line ${picked.has(c.id) ? 'bg-oak-soft/40' : 'hover:bg-paper'}`} data-testid="nearby-row">
                          <td className="px-3 py-2"><input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} onClick={(e) => e.stopPropagation()} aria-label={`Wybierz: ${c.name}`} /></td>
                          <td className="px-2 py-2"><div className="font-medium">{c.name}</div><div className="text-[11.5px] text-muted">{c.place}</div></td>
                          <td className="px-2 py-2 text-right tabular-nums">{c.distanceKm.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} km</td>
                          <td className="hidden px-3 py-2 sm:table-cell">
                            {c.servesArea
                              ? <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] text-ok">dojeżdża do Ciebie</span>
                              : <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] text-warn">zasięg {c.radiusKm} km</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 rounded-xl bg-paper p-3 text-[12.5px] text-ink/75">Nie mamy jeszcze wykonawców w tej okolicy. Zostaw kontakt — poszukamy firm dla Ciebie i przekażemy im projekt.</p>
              )}

              <form className="mt-4 grid gap-2.5" onSubmit={async (e) => {
                e.preventDefault(); setBusy(true);
                const r = await requestQuotes({ ...contact, postalCode: postal, radiusKm: String(radius), contractorIds: [...picked] });
                setBusy(false);
                if ('errors' in r) setErrors(r.errors); else setDone({ selected: r.selected });
              }}>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <label className="block"><span className="text-[11.5px] text-muted">Imię</span>
                    <input data-testid="quote-name" required autoComplete="given-name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={input} />
                  </label>
                  <label className="block"><span className="text-[11.5px] text-muted">E-mail</span>
                    <input data-testid="quote-email" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={input} />
                  </label>
                  <label className="block"><span className="text-[11.5px] text-muted">Telefon</span>
                    <input data-testid="quote-phone" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={input} />
                  </label>
                </div>
                <p className="-mt-1 text-[11px] text-muted">Wystarczy e-mail albo telefon. Dane kontaktowe wykonawców nie są publiczne — zapytanie przekazujemy my.</p>
                <label className="flex items-start gap-2 text-[11.5px] leading-snug text-ink/75">
                  <input data-testid="quote-consent" type="checkbox" checked={contact.consent} onChange={(e) => setContact({ ...contact, consent: e.target.checked })} className="mt-0.5" />
                  <span>{consentText || 'Wyrażam zgodę na przekazanie projektu i kontaktu wykonawcom z mojej okolicy.'}</span>
                </label>
                {errors.length > 0 && <div className="rounded-lg bg-bad-soft px-3 py-2 text-[12px] text-bad" data-testid="quote-errors">{errors.join('. ')}</div>}
                <button type="submit" data-testid="quote-submit" disabled={busy} className="rounded-2xl bg-ink py-3 text-[14px] font-medium text-white hover:bg-ink/85 disabled:opacity-60">
                  {busy ? 'Wysyłanie…' : picked.size > 0 ? `Poproś o wycenę (${picked.size} ${picked.size === 1 ? 'wykonawca' : 'wykonawców'})` : 'Zostaw zgłoszenie'}
                </button>
              </form>
            </div>
          )}
          <p className="mt-3 text-[10.5px] text-muted">Odległości liczone od kodów pocztowych (lokalizacje: © GeoNames, CC BY 4.0).</p>
        </>
      )}
    </Modal>
  );
}
