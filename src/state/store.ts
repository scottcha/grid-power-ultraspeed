import { create } from 'zustand';
import { createGame, endTurn, projectDispatch, registerAIPlayer, setPolicy as engineSetPolicy, claimTile, buildStructure, upgradeStructure, buyTech, buildOptions, canClaim, claimCost, claimableTiles, canBuild, canUpgrade, structureCost, ownedTiles, isUnlocked } from '../engine/index.ts';
import { takeAITurn } from '../engine/ai.ts';
import { loadGame, saveGame, listSaves, deleteSave } from '../engine/save.ts';
import type { BuildOption, DispatchResult, GameState, Policy, StructureKind } from '../engine/index.ts';
import { playSfx, initAudio, setMuted as audioSetMuted } from '../audio/audio.ts';

registerAIPlayer(takeAITurn);

export type Screen = 'menu' | 'game';
export type Modal = 'none' | 'tech' | 'market' | 'log' | 'help' | 'pause' | 'objectives' | 'empire' | 'settings' | 'summary' | 'victory';
export type Overlay = 'none' | 'power' | 'compute' | 'territory' | 'economy';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
  hint?: boolean;
}

interface Store {
  screen: Screen;
  game: GameState | null;
  preview: DispatchResult | null;
  selection: { x: number; y: number } | null;
  hover: { x: number; y: number } | null;
  hoverScreen: { x: number; y: number };
  buildKind: StructureKind | null;
  overlay: Overlay;
  showGrid: boolean;
  modal: Modal;
  toasts: Toast[];
  muted: boolean;
  focusRequest: { x: number; y: number; id: number; zoom?: number } | null;
  tutorialSeen: Record<string, boolean>;
  lastAction: { kind: string; message: string; ok: boolean } | null;

  startNewGame: (opts: { seed?: number; size?: number; difficulty?: number }) => void;
  continueGame: () => boolean;
  quitToMenu: () => void;
  selectTile: (x: number, y: number) => void;
  setHover: (x: number, y: number, screen: { x: number; y: number }) => void;
  clearSelection: () => void;
  setBuildKind: (kind: StructureKind | null) => void;
  claimSelected: () => void;
  buildSelected: (kind?: StructureKind) => void;
  upgradeSelected: () => void;
  research: (id: string) => void;
  setPolicy: (policy: Policy) => void;
  endTurn: () => void;
  setModal: (m: Modal) => void;
  setOverlay: (o: Overlay) => void;
  toggleGrid: () => void;
  toggleMute: () => void;
  toast: (text: string, kind?: Toast['kind'], hint?: boolean) => void;
  dismissToast: (id: number) => void;
  focus: (x: number, y: number) => void;
  save: (slot?: string) => void;
  loadSlot: (slot: string) => void;
  deleteSlot: (slot: string) => void;
  optionsFor: (kind: StructureKind) => BuildOption | null;
  selectionInfo: () => SelectionInfo | null;
}

export interface SelectionInfo {
  owned: boolean;
  claimable: boolean;
  claimCost: number;
  canClaimNow: boolean;
  canBuildHere: boolean;
  structures: BuildOption[];
  canUpgradeNow: boolean;
  upgradeCost: number;
  upgradeReason?: string;
  reasonClaim?: string;
}

let toastId = 1;

function refresh(game: GameState) {
  return { game: { ...game }, preview: projectDispatch(game, 0) };
}

export const useGame = create<Store>((set, get) => ({
  screen: 'menu',
  game: null,
  preview: null,
  selection: null,
  hover: null,
  hoverScreen: { x: 0, y: 0 },
  buildKind: null,
  overlay: 'none',
  showGrid: true,
  modal: 'none',
  toasts: [],
  muted: false,
  focusRequest: null,
  tutorialSeen: {},
  lastAction: null,

  startNewGame: (opts) => {
    initAudio();
    const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000_000);
    const game = createGame({ seed, size: opts.size ?? 18, difficulty: opts.difficulty ?? 1 });
    const start = game.tiles.find((t) => t.owner === 0 && t.structure?.kind === 'dc_edge')!;
    saveGame(game, 'auto');
    set({
      ...refresh(game),
      screen: 'game',
      selection: { x: start.x, y: start.y },
      buildKind: null,
      overlay: 'none',
      modal: 'none',
      toasts: [
        { id: toastId++, text: 'Welcome, CEO. Your edge data center is online — select it to inspect operations.', kind: 'info', hint: true },
        { id: toastId++, text: 'Claim adjacent land, then build power and compute. Keep the two in balance.', kind: 'info', hint: true },
      ],
      tutorialSeen: {},
      focusRequest: { x: start.x, y: start.y, id: Date.now(), zoom: window.innerWidth < 900 ? 1.05 : 1.55 },
      lastAction: null,
    });
    playSfx('turn');
  },

  continueGame: () => {
    initAudio();
    const game = loadGame('auto');
    if (!game) return false;
    const start = game.tiles.find((t) => t.owner === 0 && t.structure?.kind === 'dc_edge') ?? game.tiles.find((t) => t.owner === 0);
    set({
      ...refresh(game),
      screen: 'game',
      selection: start ? { x: start.x, y: start.y } : null,
      buildKind: null,
      modal: 'none',
      overlay: 'none',
      toasts: [{ id: toastId++, text: 'Grid restored from local save.', kind: 'good' }],
      focusRequest: start ? { x: start.x, y: start.y, id: Date.now(), zoom: window.innerWidth < 900 ? 1.05 : 1.55 } : null,
      lastAction: null,
    });
    return true;
  },

  quitToMenu: () => {
    set({ screen: 'menu', modal: 'none', game: null, preview: null, selection: null, buildKind: null });
  },

  selectTile: (x, y) => {
    const game = get().game;
    if (!game) return;
    const tile = game.tiles[y * game.size + x];
    if (!tile || !tile.explored[0]) {
      set({ selection: null });
      return;
    }
    const prev = get().selection;
    if (prev && prev.x === x && prev.y === y) {
      set({ selection: null, buildKind: null });
      return;
    }
    playSfx('select');
    const usable = tile.owner === 0 && !tile.structure;
    set({
      selection: { x, y },
      buildKind: usable ? get().buildKind : null,
      tutorialSeen: { ...get().tutorialSeen, selected: true },
    });
  },

  setHover: (x, y, screen) => {
    const prev = get().hover;
    if (prev && prev.x === x && prev.y === y) return;
    set({ hover: x >= 0 ? { x, y } : null, hoverScreen: screen });
  },

  clearSelection: () => set({ selection: null, buildKind: null }),

  setBuildKind: (kind) => {
    set({ buildKind: kind });
    if (kind) playSfx('click');
  },

  claimSelected: () => {
    const { game, selection } = get();
    if (!game || !selection) return;
    const check = canClaim(game, 0, selection.x, selection.y);
    if (!check.ok) {
      playSfx('error');
      set({ lastAction: { kind: 'claim', message: check.reason ?? 'Cannot claim', ok: false } });
      get().toast(check.reason ?? 'Cannot claim this tile', 'bad');
      return;
    }
    if (claimTile(game, 0, selection.x, selection.y)) {
      playSfx('claim');
      const firstClaim = !get().tutorialSeen.claimed;
      set({
        ...refresh(game),
        lastAction: { kind: 'claim', message: `Claimed ${coord(selection.x, selection.y)} for $${check.cost}`, ok: true },
        tutorialSeen: { ...get().tutorialSeen, claimed: true },
      });
      if (firstClaim) get().toast('Territory claimed. Build power generation here, or a data center to earn compute.', 'good', true);
    }
  },

  buildSelected: (kindArg) => {
    const { game, selection, buildKind } = get();
    if (!game || !selection) return;
    const kind = kindArg ?? buildKind;
    if (!kind) return;
    const check = canBuild(game, 0, selection.x, selection.y, kind);
    if (!check.ok) {
      playSfx('error');
      set({ lastAction: { kind: 'build', message: check.reason ?? 'Cannot build here', ok: false } });
      get().toast(check.reason ?? 'Cannot build here', 'bad');
      return;
    }
    if (buildStructure(game, 0, selection.x, selection.y, kind)) {
      playSfx('build');
      const first = !get().tutorialSeen.built;
      set({
        ...refresh(game),
        buildKind: null,
        lastAction: { kind: 'build', message: `Built ${labelOf(kind)} for $${check.cost}`, ok: true },
        tutorialSeen: { ...get().tutorialSeen, built: true },
      });
      if (first) get().toast('Construction complete. Buildings must touch your substation or a line to receive power.', 'good', true);
      saveGame(game, 'auto');
    }
  },

  upgradeSelected: () => {
    const { game, selection } = get();
    if (!game || !selection) return;
    const tile = game.tiles[selection.y * game.size + selection.x];
    const check = canUpgrade(game, 0, tile);
    if (!check.ok) {
      playSfx('error');
      get().toast(check.reason ?? 'Cannot upgrade', 'bad');
      return;
    }
    if (upgradeStructure(game, 0, selection.x, selection.y)) {
      playSfx('upgrade');
      set({
        ...refresh(game),
        lastAction: { kind: 'upgrade', message: `Upgraded to ${labelOf(tile.structure!.kind)}`, ok: true },
      });
      get().toast('Data center upgraded — more compute per tile.', 'good');
      saveGame(game, 'auto');
    }
  },

  research: (id) => {
    const { game } = get();
    if (!game) return;
    if (buyTech(game, 0, id)) {
      playSfx('research');
      set({
        ...refresh(game),
        lastAction: { kind: 'research', message: `Researched ${id}`, ok: true },
      });
      get().toast('Technology unlocked — effects apply immediately.', 'good');
      saveGame(game, 'auto');
    } else {
      playSfx('error');
      get().toast('Cannot research that yet — check prerequisites and RP.', 'bad');
    }
  },

  setPolicy: (policy) => {
    const { game } = get();
    if (!game) return;
    engineSetPolicy(game, 0, policy);
    set(refresh(game));
    playSfx('click');
  },

  endTurn: () => {
    const { game } = get();
    if (!game || game.phase !== 'player') return;
    playSfx('turn');
    const report = endTurn(game);
    saveGame(game, 'auto');
    const over = game.victory.winner !== null || game.turn > game.maxTurns;
    set({
      ...refresh(game),
      modal: over ? 'victory' : 'summary',
      selection: null,
      buildKind: null,
      lastAction: null,
    });
    if (over) playSfx('victory');
    else if (report.notes.some((n) => n.includes('unserved') || n.includes('Brownout'))) playSfx('error');
  },

  setModal: (m) => set({ modal: m }),
  setOverlay: (o) => {
    set({ overlay: o });
    playSfx('click');
  },
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleMute: () => {
    const next = !get().muted;
    audioSetMuted(next);
    set({ muted: next });
    if (!next) playSfx('click');
  },

  toast: (text, kind = 'info', hint = false) => {
    const t: Toast = { id: toastId++, text, kind, hint };
    set({ toasts: [...get().toasts.slice(-3), t] });
    setTimeout(() => {
      const st = get();
      if (st.toasts.some((x) => x.id === t.id)) set({ toasts: st.toasts.filter((x) => x.id !== t.id) });
    }, hint ? 9000 : 5200);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  focus: (x, y) => set({ focusRequest: { x, y, id: Date.now() } }),

  save: (slot = 'manual') => {
    const { game } = get();
    if (!game) return;
    saveGame(game, slot);
    get().toast('Game saved locally.', 'good');
  },

  loadSlot: (slot) => {
    const game = loadGame(slot);
    if (!game) {
      get().toast('Could not load that save.', 'bad');
      return;
    }
    const start = game.tiles.find((t) => t.owner === 0);
    set({
      ...refresh(game),
      screen: 'game',
      modal: 'none',
      selection: start ? { x: start.x, y: start.y } : null,
      focusRequest: start ? { x: start.x, y: start.y, id: Date.now(), zoom: window.innerWidth < 900 ? 1.05 : 1.55 } : null,
    });
    get().toast('Save loaded.', 'good');
  },

  deleteSlot: (slot) => {
    deleteSave(slot);
    set({});
  },

  optionsFor: (kind) => {
    const { game, selection } = get();
    if (!game) return null;
    const tile = selection ? game.tiles[selection.y * game.size + selection.x] : null;
    return buildOptions(game, 0, tile).find((o) => o.kind === kind) ?? null;
  },

  selectionInfo: () => {
    const { game, selection } = get();
    if (!game || !selection) return null;
    const tile = game.tiles[selection.y * game.size + selection.x];
    if (!tile) return null;
    const owned = tile.owner === 0;
    const adjacent = claimableTiles(game, 0).some((t) => t.x === tile.x && t.y === tile.y);
    const claimCheck = canClaim(game, 0, tile.x, tile.y);
    const upgradeCheck = canUpgrade(game, 0, tile);
    return {
      owned,
      claimable: adjacent,
      claimCost: claimCost(game, 0, tile),
      canClaimNow: claimCheck.ok,
      canBuildHere: owned && !tile.structure,
      structures: owned ? buildOptions(game, 0, tile) : [],
      canUpgradeNow: upgradeCheck.ok,
      upgradeCost: upgradeCheck.cost,
      upgradeReason: upgradeCheck.reason,
      reasonClaim: claimCheck.reason,
    };
  },
}));

function coord(x: number, y: number) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function labelOf(kind: StructureKind): string {
  return kind.replace('dc_', '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export { listSaves, ownedTiles, isUnlocked, structureCost };
export type { BuildOption, DispatchResult, GameState };
