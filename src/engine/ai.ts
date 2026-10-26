import { DCS, STRUCTURES, TERRAIN_INFO } from './config.ts';
import { BUILD_ORDER } from './config.ts';
import { isDc, isGen, GRID_KINDS } from './grid.ts';
import {
  buildStructure, buyTech, canBuild, canClaim, canUpgrade, claimCost, claimableTiles, projectDispatch,
  researchOptions, setPolicy, upgradeStructure, claimTile,
} from './simulation.ts';
import type { AIAction, GameState, Player, StructureKind, Terrain, Tile } from './types.ts';

interface Personality {
  genPref: StructureKind[];
  claimWeights: Partial<Record<Terrain, number>>;
  techWeight: Partial<Record<string, number>>;
  dcAggression: number;
  batteryUrge: number;
  labUrge: number;
  flexPolicy: boolean;
  reserve: number;
}

const PERSONALITIES: Record<string, Personality> = {
  helios: {
    genPref: ['solar', 'wind', 'geothermal', 'hydro', 'gas', 'nuclear'],
    claimWeights: { geothermal: 6, mountain: 4, coast: 3, desert: 5, river: 3, plains: 2 },
    techWeight: { solar_boost: 5, wind_boost: 5, batteries_hd: 4, smart_grid: 3, efficient_gpus: 2, adv_nuclear: 2 },
    dcAggression: 0.8, batteryUrge: 0.5, labUrge: 0.4, flexPolicy: false, reserve: 45,
  },
  titan: {
    genPref: ['gas', 'solar', 'wind', 'geothermal', 'nuclear', 'hydro'],
    claimWeights: { urban: 8, plains: 4, desert: 4, basin: 5, river: 3, geothermal: 3 },
    techWeight: { efficient_gpus: 6, ai_accelerators: 5, adv_cooling: 4, liquid_cooling: 4, gigafactory: 4, gpu_power_mgmt: 3, workload_sched: 3, adaptive_inference: 2, autonomy: 2 },
    dcAggression: 1.35, batteryUrge: 0.25, labUrge: 0.5, flexPolicy: false, reserve: 30,
  },
  volt: {
    genPref: ['wind', 'solar', 'geothermal', 'gas', 'hydro', 'nuclear'],
    claimWeights: { urban: 6, geothermal: 5, river: 5, mountain: 4, basin: 4, desert: 3 },
    techWeight: { batteries_hd: 6, smart_grid: 5, demand_response: 5, gpu_power_mgmt: 4, hv_transmission: 4, adaptive_inference: 3, autonomy: 3 },
    dcAggression: 1.0, batteryUrge: 1.0, labUrge: 0.7, flexPolicy: true, reserve: 55,
  },
};

const GEN_SCORE: Partial<Record<StructureKind, number>> = {
  solar: 1, wind: 1.1, gas: 0.95, hydro: 1.05, geothermal: 1.25, nuclear: 1.35,
};

/** Owned, empty tiles adjacent to one of the AI's own grid assets. */
export function connectionSlots(state: GameState, playerId: number): Tile[] {
  const size = state.size;
  const grid = new Set<number>();
  for (const t of state.tiles) {
    if (t.owner === playerId && t.structure && GRID_KINDS[t.structure.kind]) grid.add(t.y * size + t.x);
  }
  return state.tiles.filter((t) => {
    if (t.owner !== playerId || t.structure) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = t.x + dx, ny = t.y + dy;
      return nx >= 0 && ny >= 0 && nx < size && ny < size && grid.has(ny * size + nx);
    });
  });
}

function genValue(kind: StructureKind, tile: Tile, weatherMulSolar: number, weatherMulWind: number): number {
  const def = STRUCTURES[kind];
  if (def.terrain && !def.terrain.includes(tile.terrain)) return -1;
  const t = TERRAIN_INFO[tile.terrain];
  const cost = def.cost * (t.build ?? 1);
  let mw = 0;
  switch (kind) {
    case 'solar': mw = def.capacity * t.solar * weatherMulSolar; break;
    case 'wind': mw = def.capacity * t.wind * weatherMulWind; break;
    case 'hydro': mw = def.capacity * 0.92; break;
    case 'geothermal': mw = def.capacity * 0.95; break;
    case 'gas': mw = def.capacity * 0.96; break;
    case 'nuclear': mw = def.capacity * 0.98; break;
    default: mw = 0;
  }
  const reliability = kind === 'solar' || kind === 'wind' ? 0.82 : 1;
  return (mw * reliability) / Math.max(cost, 1);
}

/** Picks the best legal generator tile+kind for the AI. */
export function bestGenerator(state: GameState, player: Player): { tile: Tile; kind: StructureKind } | null {
  const pers = PERSONALITIES[player.personality] ?? PERSONALITIES.titan;
  const slots = connectionSlots(state, player.id);
  let best: { tile: Tile; kind: StructureKind; score: number } | null = null;
  for (const tile of slots) {
    for (const kind of pers.genPref) {
      if (!canBuild(state, player.id, tile.x, tile.y, kind).ok) continue;
      const value = genValue(kind, tile, state.weather.solar, state.weather.wind) * (GEN_SCORE[kind] ?? 1);
      const pref = pers.genPref.indexOf(kind);
      const score = value * 100 - pref * 3;
      if (!best || score > best.score) best = { tile, kind, score };
    }
  }
  return best ? { tile: best.tile, kind: best.kind } : null;
}

function claimScore(state: GameState, player: Player, tile: Tile): number {
  const pers = PERSONALITIES[player.personality] ?? PERSONALITIES.titan;
  const terrain = TERRAIN_INFO[tile.terrain];
  let score = pers.claimWeights[tile.terrain] ?? 2;
  score += terrain.solar * 2 + terrain.wind * 1.5 - terrain.cooling * 6;
  const size = state.size;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = tile.x + dx, ny = tile.y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    const n = state.tiles[ny * size + nx];
    if (n.owner === player.id) score += 2.5;
    else if (n.owner !== null) score -= 3.5;
    if (n.structure && n.structure.kind === 'substation' && n.owner === null) score += 6;
  }
  if (tile.structure) score += 6;
  return score;
}

function bestClaim(state: GameState, player: Player): Tile | null {
  const reserved = (PERSONALITIES[player.personality] ?? PERSONALITIES.titan).reserve;
  const options = claimableTiles(state, player.id)
    .filter((t) => state.players[player.id].credits >= claimCost(state, player.id, t) + reserved)
    .filter((t) => canClaim(state, player.id, t.x, t.y).ok);
  if (!options.length) return null;
  options.sort((a, b) => claimScore(state, player, b) - claimScore(state, player, a));
  return options[0];
}

function bestResearch(state: GameState, player: Player): string | null {
  const pers = PERSONALITIES[player.personality] ?? PERSONALITIES.titan;
  const options = researchOptions(state, player.id)
    .filter((o) => o.available && o.affordable)
    .sort((a, b) => {
      const wa = (pers.techWeight[a.node.id] ?? 1) / a.node.cost;
      const wb = (pers.techWeight[b.node.id] ?? 1) / b.node.cost;
      return wb - wa;
    });
  return options.length ? options[0].node.id : null;
}

function bestDcSlot(state: GameState, player: Player): { tile: Tile; kind: StructureKind } | null {
  const slots = connectionSlots(state, player.id);
  if (!slots.length) return null;
  const kinds = BUILD_ORDER.filter((k) => STRUCTURES[k].category === 'dc' && canBuildAny(player, k));
  if (!kinds.length) return null;
  // Prefer the biggest affordable option, sited on the coolest tile.
  for (const kind of [...kinds].reverse()) {
    const options = slots
      .filter((t) => canBuild(state, player.id, t.x, t.y, kind).ok)
      .sort((a, b) => TERRAIN_INFO[a.terrain].cooling - TERRAIN_INFO[b.terrain].cooling);
    if (options.length) return { tile: options[0], kind };
  }
  return null;
}

function canBuildAny(player: Player, kind: StructureKind): boolean {
  const def = STRUCTURES[kind];
  if (def.requires && !player.techs.includes(def.requires)) return false;
  return player.credits >= def.cost * 1.15;
}

/** Executes one AI company's turn. Returns the actions taken (useful for tests). */
export function takeAITurn(state: GameState, playerId: number): AIAction[] {
  const player = state.players[playerId];
  if (!player || !player.isAI) return [];
  const pers = PERSONALITIES[player.personality] ?? PERSONALITIES.titan;
  const actions: AIAction[] = [];

  if (pers.flexPolicy && player.policy !== 'flexible') {
    setPolicy(state, playerId, 'flexible');
    actions.push({ type: 'policy', policy: 'flexible' });
  }

  const budgetActions = 4 + Math.round(state.difficulty * 2);

  for (let step = 0; step < budgetActions; step++) {
    // 1. Research.
    if (player.research > 0) {
      const tech = bestResearch(state, player);
      if (tech && buyTech(state, playerId, tech)) {
        actions.push({ type: 'research', id: tech });
        continue;
      }
    }

    const dispatch = projectDispatch(state, playerId);
    const demand = dispatch.demand;
    const headroom = dispatch.generation - demand;
    const credits = player.credits;
    const dcCount = dispatch.dc.length;
    const genCount = state.tiles.filter((t) => t.owner === playerId && t.structure && isGen(t.structure.kind)).length;
    const lineCount = state.tiles.filter((t) => t.owner === playerId && t.structure?.kind === 'line').length;

    // 2. Power shortfall: generation first, always.
    const short = demand > 0 && headroom < demand * 0.06;
    if (short) {
      const gen = bestGenerator(state, player);
      if (gen && canBuild(state, playerId, gen.tile.x, gen.tile.y, gen.kind).ok) {
        if (buildStructure(state, playerId, gen.tile.x, gen.tile.y, gen.kind)) {
          actions.push({ type: 'build', x: gen.tile.x, y: gen.tile.y, kind: gen.kind });
          continue;
        }
      }
    }

    // 3. Growth headroom: keep building generation ahead of compute demand.
    const wantsGrowth = credits > 180 && headroom < 34 && genCount < 3 + state.turn * 0.55;
    if (wantsGrowth) {
      const gen = bestGenerator(state, player);
      if (gen && canBuild(state, playerId, gen.tile.x, gen.tile.y, gen.kind).ok) {
        if (buildStructure(state, playerId, gen.tile.x, gen.tile.y, gen.kind)) {
          actions.push({ type: 'build', x: gen.tile.x, y: gen.tile.y, kind: gen.kind });
          continue;
        }
      }
    }

    // 4. Upgrade a data center when there is power and cash.
    if (headroom > 20) {
      const upgradable = state.tiles
        .filter((t) => t.owner === playerId && t.structure && isDc(t.structure.kind) && canUpgrade(state, playerId, t).ok)
        .sort((a, b) => upgradeCostSafe(a) - upgradeCostSafe(b))[0];
      if (upgradable && credits > upgradeCostSafe(upgradable) + pers.reserve) {
        if (upgradeStructure(state, playerId, upgradable.x, upgradable.y)) {
          actions.push({ type: 'upgrade', x: upgradable.x, y: upgradable.y });
          continue;
        }
      }
    }

    // 5. Build compute — the core growth loop.
    if (headroom > 3 && dcCount < 3 + state.turn * 0.75) {
      const pick = bestDcSlot(state, player);
      if (pick && canBuild(state, playerId, pick.tile.x, pick.tile.y, pick.kind).ok) {
        if (buildStructure(state, playerId, pick.tile.x, pick.tile.y, pick.kind)) {
          actions.push({ type: 'build', x: pick.tile.x, y: pick.tile.y, kind: pick.kind });
          continue;
        }
      }
    }

    // 6. Batteries for flexibility-minded companies.
    if (pers.batteryUrge > 0.4 && player.techs.includes('batteries_hd') && credits > 200) {
      const batteries = state.tiles.filter((t) => t.owner === playerId && t.structure?.kind === 'battery').length;
      const slot = connectionSlots(state, playerId).find((t) => canBuild(state, playerId, t.x, t.y, 'battery').ok);
      if (slot && batteries < 3) {
        if (buildStructure(state, playerId, slot.x, slot.y, 'battery')) {
          actions.push({ type: 'build', x: slot.x, y: slot.y, kind: 'battery' });
          continue;
        }
      }
    }

    // 7. Research labs when research income is thin.
    if (credits > 260 && pers.labUrge > 0.3) {
      const labs = state.tiles.filter((t) => t.owner === playerId && t.structure?.kind === 'lab').length;
      const slot = connectionSlots(state, playerId).find((t) => canBuild(state, playerId, t.x, t.y, 'lab').ok);
      const rp = player.history.at(-1)?.research ?? 0;
      if (slot && labs < 3 && rp < 30) {
        if (buildStructure(state, playerId, slot.x, slot.y, 'lab')) {
          actions.push({ type: 'build', x: slot.x, y: slot.y, kind: 'lab' });
          continue;
        }
      }
    }

    // 8. Extend the electrical grid to open new build slots.
    if (lineCount < 2 + state.turn * 0.35 && credits > 120) {
      const slots = connectionSlots(state, playerId);
      const emptyOwned = state.tiles.filter((t) => t.owner === playerId && !t.structure);
      if (slots.length <= 1 && emptyOwned.length > 0) {
        const lineTile = emptyOwned.find((t) => canBuild(state, playerId, t.x, t.y, 'line').ok);
        if (lineTile && buildStructure(state, playerId, lineTile.x, lineTile.y, 'line')) {
          actions.push({ type: 'build', x: lineTile.x, y: lineTile.y, kind: 'line' });
          continue;
        }
      }
    }

    // 9. Expand territory.
    const targetClaims = 4 + state.turn * (player.personality === 'titan' ? 0.85 : 0.65);
    const owned = state.tiles.filter((t) => t.owner === playerId).length;
    if (owned < targetClaims) {
      const claim = bestClaim(state, player);
      if (claim && claimTile(state, playerId, claim.x, claim.y)) {
        actions.push({ type: 'claim', x: claim.x, y: claim.y });
        continue;
      }
    }
    break;
  }

  // Keep policies aligned with personality + market.
  if (!pers.flexPolicy) {
    const desired = player.personality === 'titan' ? 'compute' : player.personality === 'helios' ? 'profit' : player.policy;
    if (desired !== player.policy) setPolicy(state, playerId, desired);
  }

  return actions;
}

function upgradeCostSafe(tile: Tile): number {
  return tile.structure && isDc(tile.structure.kind) ? DCS[tile.structure.kind].upgradeCost : 0;
}
