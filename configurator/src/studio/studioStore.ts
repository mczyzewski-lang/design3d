// Stan projektu zapisanego na serwerze: wersje, udostępnianie, rola oglądającego, komentarze 3D.
import { create } from 'zustand';
import { mergeWithDefaults } from '../engine/defaults';
import type { Config, Vec3 } from '../engine/types';
import { useStore } from '../store/store';
import { api, type CommentDto, type ContractorDto, type ContractorForm, type ProjectListItem, type QuoteForm, type VersionInfo } from './api';
import { capture } from '../three/capture';
import { firstTouchSource, shareVia } from '../analytics';

export type Role = 'local' | 'owner' | 'contractor' | 'none';

/** Zrzut bieżącego widoku sceny (pomniejszony JPEG) jako podgląd projektu w bramce udostępnionego linku — bez blokowania zapisu. */
function uploadThumbnail(id: string): void {
  const src = capture.fn?.();
  if (!src) return;
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 960 / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#f3f0ea';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    api.putThumbnail(id, c.toDataURL('image/jpeg', 0.85)).catch(() => { /* podgląd jest opcjonalny */ });
  };
  img.src = src;
}

interface StudioState {
  /** okno „Zapisz i udostępnij” (otwierane z nagłówka i z karty „Znajdź wykonawców”) */
  shareOpen: boolean;
  setShareOpen: (v: boolean) => void;
  /** potwierdzony numer telefonu tej przeglądarki („logowanie numerem”) */
  phone: string | null;
  loadMe: () => Promise<void>;
  /** wysyła kod SMS; w trybie testowym (brak bramki) zwraca kod do pokazania */
  startPhone: (phone: string) => Promise<{ error: string } | { phone: string; testCode?: string }>;
  verifyPhone: (phone: string, code: string) => Promise<string | null>;
  projectId: string | null;
  name: string;
  version: number;
  versions: VersionInfo[];
  role: Role;
  shareToken: string | null;
  viewerName: string | null;
  contractors: ContractorDto[];
  savedJson: string;
  busy: boolean;
  error: string | null;
  /** udostępniony link bez dostępu — bramka nad rozmytym projektem */
  gate: null | { token: string; name: string; consentText: string; leadsText: string; thumb: string | null };
  comments: CommentDto[];
  commentMode: boolean;
  pendingPin: Vec3 | null;
  activeComment: number | null;
  myProjects: ProjectListItem[];

  init: () => Promise<void>;
  save: (name?: string) => Promise<boolean>;
  saveAsVersion: (label?: string) => Promise<boolean>;
  loadVersion: (v: number) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  ensureShare: () => Promise<string | null>;
  ownerLink: () => Promise<string | null>;
  register: (form: ContractorForm) => Promise<string[] | null>;
  /** „Znajdź wykonawcę”: zapisuje i udostępnia projekt, potem zgłasza go z kodem pocztowym. */
  requestQuotes: (form: QuoteForm) => Promise<{ errors: string[] } | { nearby: number; selected: number }>;
  continueAsOwner: () => Promise<boolean>;
  loadComments: () => Promise<void>;
  addComment: (text: string, pos: Vec3 | null) => Promise<boolean>;
  resolveComment: (id: number, resolved: boolean) => Promise<void>;
  setCommentMode: (on: boolean) => void;
  setPendingPin: (p: Vec3 | null) => void;
  setActiveComment: (id: number | null) => void;
  clearError: () => void;
  newLocal: () => void;
}

const cfg = () => useStore.getState().config;
const json = (c: Config) => JSON.stringify(c);
const projectPath = (id: string) => `/konfigurator/?project=${id}`;

export const useStudio = create<StudioState>((set, get) => ({
  projectId: null,
  name: 'Mój projekt schodów',
  version: 1,
  versions: [],
  role: 'local',
  shareToken: null,
  viewerName: null,
  contractors: [],
  savedJson: '',
  busy: false,
  error: null,
  gate: null,
  comments: [],
  commentMode: false,
  pendingPin: null,
  activeComment: null,
  myProjects: [],
  phone: null,
  shareOpen: false,
  setShareOpen: (v) => set({ shareOpen: v }),
  loadMe: async () => {
    try { set({ phone: (await api.me()).phone }); } catch { /* offline */ }
  },
  startPhone: async (phone) => {
    try {
      const r = await api.phoneStart(phone);
      return { phone: r.phone, testCode: r.testCode };
    } catch (e) {
      return { error: (e as Error).message };
    }
  },
  verifyPhone: async (phone, code) => {
    try {
      const r = await api.phoneVerify(phone, code);
      set({ phone: r.phone });
      void get().refreshProjects();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  },

  init: async () => {
    void get().loadMe();
    const m = /\/konfigurator\/p\/([A-Za-z0-9_-]+)/.exec(location.pathname);
    try {
      if (m) {
        const token = m[1];
        const sh = await api.getShare(token, shareVia());
        useStore.getState().load(sh.config);
        set({ shareToken: token, name: sh.name, version: sh.currentVersion, savedJson: json(cfg()) });
        if (sh.role === 'owner' && sh.projectId) {
          await get().openProject(sh.projectId);
          set({ shareToken: token });
        } else if (sh.role === 'contractor') {
          set({ role: 'contractor', viewerName: sh.viewer?.name ?? null });
          await get().loadComments();
        } else {
          set({ role: 'none', gate: { token, name: sh.name, consentText: sh.consentText, leadsText: sh.leadsText, thumb: sh.thumbnail ? api.thumbnailUrl(token, sh.thumbnail) : null } });
          useStore.getState().setView({ spin: true });
        }
        return;
      }
      const params = new URLSearchParams(location.search);
      const id = params.get('project');
      const claim = /#claim=([A-Za-z0-9_-]+)/.exec(location.hash);
      if (id && claim) {
        await api.claim(id, claim[1]);
        history.replaceState(null, '', projectPath(id));
      }
      if (id) await get().openProject(id);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  openProject: async (id) => {
    const p = await api.getProject(id);
    useStore.getState().load(p.config);
    set({
      projectId: p.id, name: p.name, version: p.currentVersion, versions: p.versions, role: 'owner', shareToken: p.shareToken ?? null,
      contractors: p.contractors ?? [], savedJson: json(cfg()), gate: null, pendingPin: null, activeComment: null,
    });
    if (!location.pathname.includes('/p/')) history.replaceState(null, '', projectPath(p.id) + location.hash.replace(/#claim=[^&]*/, ''));
    await get().loadComments();
  },

  refreshProjects: async () => {
    try { set({ myProjects: await api.listProjects() }); } catch { /* offline */ }
  },

  /** Zapisz: pierwszy zapis tworzy projekt, kolejne nadpisują bieżącą wersję. Firma zapisuje własną kopię. */
  save: async (name) => {
    const s = get();
    set({ busy: true, error: null });
    try {
      if (s.role === 'owner' && s.projectId) {
        const p = await api.save(s.projectId, cfg(), s.version, name);
        set({ name: p.name, version: p.currentVersion, versions: p.versions, savedJson: json(cfg()) });
        uploadThumbnail(p.id);
      } else {
        const p = await api.createProject(name ?? s.name, cfg(), s.role === 'contractor' ? 'contractor_copy' : firstTouchSource());
        set({ projectId: p.id, name: p.name, version: p.currentVersion, versions: p.versions, role: 'owner', shareToken: null, savedJson: json(cfg()), comments: [] });
        history.replaceState(null, '', projectPath(p.id));
        uploadThumbnail(p.id);
      }
      void get().refreshProjects();
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  saveAsVersion: async (label) => {
    const s = get();
    if (s.role !== 'owner' || !s.projectId) return get().save();
    set({ busy: true, error: null });
    try {
      const p = await api.saveVersion(s.projectId, cfg(), label);
      set({ version: p.currentVersion, versions: p.versions, savedJson: json(cfg()) });
      uploadThumbnail(p.id);
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  loadVersion: async (v) => {
    const s = get();
    if (!s.projectId) return;
    const r = await api.getVersion(s.projectId, v);
    useStore.getState().load(r.config);
    set({ version: v, savedJson: json(mergeWithDefaults(r.config)) });
  },

  ensureShare: async () => {
    const s = get();
    if (s.role !== 'owner' || !s.projectId) {
      const ok = await get().save();
      if (!ok) return null;
    } else if (json(cfg()) !== s.savedJson) {
      await get().save();
    }
    const id = get().projectId!;
    const r = await api.share(id);
    set({ shareToken: r.token });
    return location.origin + r.path;
  },

  ownerLink: async () => {
    const id = get().projectId;
    if (!id) return null;
    const r = await api.ownerLink(id);
    return location.origin + r.path;
  },

  register: async (form) => {
    const g = get().gate;
    if (!g) return null;
    try {
      const r = await api.registerContractor(g.token, form, shareVia());
      set({ role: 'contractor', viewerName: r.viewer.name, gate: null });
      useStore.getState().setView({ spin: false });
      await get().loadComments();
      return null;
    } catch (e) {
      const err = e as { errors?: string[]; message: string };
      return err.errors ?? [err.message];
    }
  },

  requestQuotes: async (form) => {
    try {
      const url = await get().ensureShare();
      const id = get().projectId;
      if (!url || !id) return { errors: [get().error ?? 'Nie udało się zapisać projektu'] };
      const r = await api.quoteRequest(id, form);
      return { nearby: r.nearby, selected: r.selected };
    } catch (e) {
      const err = e as { errors?: string[]; message: string };
      return { errors: err.errors ?? [err.message] };
    }
  },

  continueAsOwner: async () => {
    const g = get().gate;
    if (!g) return false;
    const sh = await api.getShare(g.token);
    if (sh.role === 'owner' && sh.projectId) {
      useStore.getState().setView({ spin: false });
      await get().openProject(sh.projectId);
      return true;
    }
    return false;
  },

  loadComments: async () => {
    const s = get();
    if (s.role === 'local' || s.role === 'none') return;
    try {
      const list = await api.comments({ projectId: s.projectId, shareToken: s.shareToken, owner: s.role === 'owner' });
      set({ comments: list });
    } catch { /* brak dostępu / offline */ }
  },

  addComment: async (text, pos) => {
    let s = get();
    if (s.role === 'local') {
      const ok = await get().save();
      if (!ok) return false;
      s = get();
    }
    try {
      const c = await api.addComment({ projectId: s.projectId, shareToken: s.shareToken, owner: s.role === 'owner' }, text, pos);
      set({ comments: [...get().comments, c], pendingPin: null, activeComment: c.id, commentMode: false });
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  resolveComment: async (id, resolved) => {
    const s = get();
    if (s.role !== 'owner' || !s.projectId) return;
    set({ comments: await api.resolveComment(s.projectId, id, resolved) });
  },

  setCommentMode: (on) => set({ commentMode: on, pendingPin: on ? get().pendingPin : null }),
  setPendingPin: (p) => set({ pendingPin: p }),
  setActiveComment: (id) => set({ activeComment: id }),
  clearError: () => set({ error: null }),
  newLocal: () => {
    set({ projectId: null, role: 'local', name: 'Mój projekt schodów', version: 1, versions: [], shareToken: null, comments: [], contractors: [], savedJson: '' });
    history.replaceState(null, '', '/konfigurator/');
  },
}));

export const isDirty = (s: StudioState, c: Config) => s.savedJson !== JSON.stringify(c);
