import { create } from 'zustand';
import { DEFAULT_CONFIG, cloneConfig, mergeWithDefaults } from '../engine/defaults';
import { applyCollection } from '../engine/presets';
import { applyPatch } from '../engine/validate';
import { autofit, type AutofitResult } from '../engine/autofit';
import { fitForShape } from '../engine/shapeFit';
import { solve } from '../engine/solve';
import { configFromHash } from '../engine/share';
import type { Config, LightingConfig, Patch, RailingConfig, RoomConfig, Shape, StairConfig, SteelConfig, StructureConfig, TreadConfig, TurnType, WallKey } from '../engine/types';

export type CameraMode = 'persp' | 'top' | 'side' | 'section' | 'eye';
export type WallMode = 'auto' | 'all' | 'transparent' | 'selected' | 'section';

export interface ViewState {
  camera: CameraMode;
  wallMode: WallMode;
  selectedWalls: Record<WallKey, boolean>;
  showSlab: boolean;
  showDims: boolean;
  showFootprint: boolean;
  sideFlip: boolean;
  eyeFrom: 'entry' | 'top';
  fitNonce: number;
  resetNonce: number;
  /** delikatny obrót kamery (tło bramki udostępnionego linku) */
  spin: boolean;
}

const STORAGE_KEY = 'stair-studio:v1';
const COLLECTIONS_KEY = 'stair-studio:collections';
const PROJECTS_KEY = 'stair-studio:projects';

export interface UserCollection { key: string; label: string; structure: Config['structure']; treads: Config['treads']; steel: Config['steel']; railing: Config['railing']; lighting: Config['lighting'] }
export interface SavedProject { id: string; name: string; savedAt: string; config: Config }

function readLS<T>(key: string, d: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : d;
  } catch {
    return d;
  }
}
function writeLS(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

function initialConfig(): Config {
  if (typeof location !== 'undefined') {
    const c = configFromHash(location.hash);
    if (c) return c;
  }
  return cloneConfig(DEFAULT_CONFIG);
}

interface Store {
  config: Config;
  view: ViewState;
  autofit: AutofitResult | null;
  setRoom: (p: Partial<RoomConfig>) => void;
  setStairs: (p: Partial<StairConfig>) => void;
  setStructure: (p: Partial<StructureConfig>) => void;
  setTreads: (p: Partial<TreadConfig>) => void;
  setSteel: (p: Partial<SteelConfig>) => void;
  setRailing: (p: Partial<RailingConfig>) => void;
  setLighting: (p: Partial<LightingConfig>) => void;
  patch: (p: Patch) => void;
  collection: (key: string) => void;
  load: (c: unknown) => void;
  reset: () => void;
  setView: (p: Partial<ViewState>) => void;
  requestFit: () => void;
  requestCameraReset: () => void;
  runAutofit: (shape?: Shape) => void;
  /** Zmiana układu/zakrętu z natychmiastowym dopasowaniem parametrów (bez błędów ze stanu standardowego). */
  chooseShape: (shape: Shape, turnType?: TurnType) => void;
  clearAutofit: () => void;
  saveLocal: () => boolean;
  restoreLocal: () => boolean;
  userCollections: UserCollection[];
  saveCollection: (label: string) => void;
  applyUserCollection: (key: string) => void;
  deleteCollection: (key: string) => void;
  projects: SavedProject[];
  saveProject: (name: string) => void;
  loadProject: (id: string) => void;
  deleteProject: (id: string) => void;
}

const VIEW: ViewState = {
  camera: 'persp',
  wallMode: 'auto',
  selectedWalls: { back: true, left: true, right: true, front: true },
  showSlab: true,
  showDims: true,
  showFootprint: false,
  sideFlip: false,
  eyeFrom: 'entry',
  fitNonce: 0,
  resetNonce: 0,
  spin: false,
};

export const useStore = create<Store>((set, get) => ({
  config: initialConfig(),
  view: VIEW,
  userCollections: typeof localStorage !== 'undefined' ? readLS<UserCollection[]>(COLLECTIONS_KEY, []) : [],
  projects: typeof localStorage !== 'undefined' ? readLS<SavedProject[]>(PROJECTS_KEY, []) : [],
  saveCollection: (label) => {
    const c = get().config;
    const col: UserCollection = { key: `user-${Date.now().toString(36)}`, label, structure: c.structure, treads: c.treads, steel: c.steel, railing: c.railing, lighting: c.lighting };
    const list = [...get().userCollections, col];
    writeLS(COLLECTIONS_KEY, list);
    set({ userCollections: list, config: { ...c, collection: col.key } });
  },
  applyUserCollection: (key) => {
    const col = get().userCollections.find((x) => x.key === key);
    if (!col) return;
    set((s) => ({ config: { ...s.config, collection: key, structure: col.structure, treads: col.treads, steel: col.steel, railing: { ...s.config.railing, ...col.railing }, lighting: col.lighting } }));
  },
  deleteCollection: (key) => {
    const list = get().userCollections.filter((x) => x.key !== key);
    writeLS(COLLECTIONS_KEY, list);
    set({ userCollections: list });
  },
  saveProject: (name) => {
    const p: SavedProject = { id: Date.now().toString(36), name, savedAt: new Date().toISOString(), config: get().config };
    const list = [p, ...get().projects].slice(0, 50);
    writeLS(PROJECTS_KEY, list);
    set({ projects: list });
  },
  loadProject: (id) => {
    const p = get().projects.find((x) => x.id === id);
    if (p) set({ config: mergeWithDefaults(p.config), autofit: null });
  },
  deleteProject: (id) => {
    const list = get().projects.filter((x) => x.id !== id);
    writeLS(PROJECTS_KEY, list);
    set({ projects: list });
  },
  autofit: null,
  setRoom: (p) => set((s) => ({ config: { ...s.config, room: { ...s.config.room, ...p } }, autofit: null })),
  setStairs: (p) => set((s) => ({ config: { ...s.config, stairs: { ...s.config.stairs, ...p } }, autofit: null })),
  setStructure: (p) => set((s) => ({ config: { ...s.config, structure: { ...s.config.structure, ...p } } })),
  setTreads: (p) => set((s) => ({ config: { ...s.config, treads: { ...s.config.treads, ...p } } })),
  setSteel: (p) => set((s) => ({ config: { ...s.config, steel: { ...s.config.steel, ...p } } })),
  setRailing: (p) => set((s) => ({ config: { ...s.config, railing: { ...s.config.railing, ...p } } })),
  setLighting: (p) => set((s) => ({ config: { ...s.config, lighting: { ...s.config.lighting, ...p } } })),
  patch: (p) => set((s) => ({ config: applyPatch(s.config, p), autofit: null })),
  collection: (key) => set((s) => ({ config: applyCollection(s.config, key) })),
  load: (c) => set({ config: mergeWithDefaults(c), autofit: null }),
  reset: () => set({ config: cloneConfig(DEFAULT_CONFIG), autofit: null, view: { ...get().view, resetNonce: get().view.resetNonce + 1 } }),
  setView: (p) => set((s) => ({ view: { ...s.view, ...p } })),
  requestFit: () => set((s) => ({ view: { ...s.view, fitNonce: s.view.fitNonce + 1 } })),
  requestCameraReset: () => set((s) => ({ view: { ...s.view, resetNonce: s.view.resetNonce + 1 } })),
  runAutofit: (shape) => {
    const c = get().config;
    const target = shape ?? c.stairs.shape;
    const r = autofit(c, target);
    if (r.ok && r.patch) set({ config: applyPatch(c, r.patch), autofit: r });
    else set({ autofit: r });
  },
  chooseShape: (shape, turnType) => {
    const { config, result } = fitForShape(get().config, shape, turnType ?? get().config.stairs.turnType);
    set({ config, autofit: result }); // przy porażce karta analizy pokaże układy, które się zmieszczą
  },
  clearAutofit: () => set({ autofit: null }),
  saveLocal: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().config));
      return true;
    } catch {
      return false;
    }
  },
  restoreLocal: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      set({ config: mergeWithDefaults(JSON.parse(raw)), autofit: null });
      return true;
    } catch {
      return false;
    }
  },
}));

/** Rozwiązanie memoizowane po kluczu geometrii — zmiana materiału zwraca ten sam obiekt. */
export const useSolved = () => useStore((s) => solve(s.config));
export const useConfig = () => useStore((s) => s.config);
export const useView = () => useStore((s) => s.view);

export const hasSaved = (): boolean => {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
};
