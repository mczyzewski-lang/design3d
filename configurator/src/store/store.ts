import { create } from 'zustand';
import { DEFAULT_CONFIG, cloneConfig, mergeWithDefaults } from '../engine/defaults';
import { applyCollection } from '../engine/presets';
import { applyPatch } from '../engine/validate';
import { autofit, type AutofitResult } from '../engine/autofit';
import { solve } from '../engine/solve';
import type { Config, LightingConfig, Patch, RailingConfig, RoomConfig, Shape, StairConfig, SteelConfig, StructureConfig, TreadConfig, WallKey } from '../engine/types';

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
}

const STORAGE_KEY = 'stair-studio:v1';

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
  clearAutofit: () => void;
  saveLocal: () => boolean;
  restoreLocal: () => boolean;
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
};

export const useStore = create<Store>((set, get) => ({
  config: cloneConfig(DEFAULT_CONFIG),
  view: VIEW,
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
