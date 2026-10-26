import type { GameState } from './types.ts';

const SAVE_KEY = 'gridpower.save.v1';
const SLOT_PREFIX = 'gridpower.slot.';

export interface SaveMeta {
  savedAt: number;
  turn: number;
  company: string;
  size: number;
  seed: number;
}

export interface SaveSlot extends SaveMeta {
  id: string;
}

export function saveGame(state: GameState, slot = 'auto'): void {
  if (typeof localStorage === 'undefined') return;
  const payload = JSON.stringify({ meta: metaOf(state), state });
  localStorage.setItem(SLOT_PREFIX + slot, payload);
}

export function loadGame(slot = 'auto'): GameState | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(SLOT_PREFIX + slot);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state: GameState };
    if (!parsed.state || parsed.state.version !== 1) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function listSaves(): SaveSlot[] {
  if (typeof localStorage === 'undefined') return [];
  const out: SaveSlot[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(SLOT_PREFIX)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '') as { meta: SaveMeta };
      out.push({ id: key.slice(SLOT_PREFIX.length), ...parsed.meta });
    } catch {
      // ignore corrupt slot
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function deleteSave(slot: string) {
  localStorage.removeItem(SLOT_PREFIX + slot);
}

function metaOf(state: GameState): SaveMeta {
  return {
    savedAt: Date.now(),
    turn: state.turn,
    company: state.players[0]?.company ?? 'Lumen Grid',
    size: state.size,
    seed: state.seed,
  };
}

/** Older builds wrote a single key; retained for migration if present. */
export function migrateLegacySave() {
  if (typeof localStorage === 'undefined') return;
  const legacy = localStorage.getItem(SAVE_KEY);
  if (legacy && !localStorage.getItem(SLOT_PREFIX + 'auto')) {
    localStorage.setItem(SLOT_PREFIX + 'auto', legacy);
    localStorage.removeItem(SAVE_KEY);
  }
}
