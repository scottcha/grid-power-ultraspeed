import {
  BAL, BUILD_ORDER, DCS, MARKET_EVENTS, STRUCTURES, TECHNOLOGIES, WEATHERS,
} from './config.ts';
import { advanceRng, rngFloat } from './rng.ts';
import { dispatchPower, isDc, isGen, type DispatchResult } from './grid.ts';
import { generateWorld, neighbors4, tileAt } from './worldgen.ts';
import type {
  BuildOption, GameState, LogEntry, Market, Player, Policy, StructureKind, Terrain,
  Tile, TurnReport, TurnStats, VictoryState, Weather, WeatherKind,
} from './types.ts';

export const PLAYER_COLORS = ['#43d9e8', '#ffc94a', '#ff6b6b', '#b388ff'];
const AI_COMPANIES: { name: string; company: string; personality: Player['personality'] }[] = [
  { name: 'Helios', company: 'Helios Energy', personality: 'helios' },
  { name: 'Titan', company: 'Titan Compute', personality: 'titan' },
  { name: 'Volt', company: 'Volt Dynamics', personality: 'volt' },
];

export interface NewGameOptions {
  seed: number;
  size?: number;
  maxTurns?: number;
  difficulty?: number;
  playerName?: string;
}

const tileIndex = (size: number, x: number, y: number) => y * size + x;

export function revealAround(state: GameState, playerId: number, cx: number, cy: number, radius: number) {
  for (let y = Math.max(0, cy - radius); y <= Math.min(state.size - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(state.size - 1, cx + radius); x++) {
      if (Math.hypot(x - cx, y - cy) > radius + 0.2) continue;
      state.tiles[tileIndex(state.size, x, y)].explored[playerId] = true;
    }
  }
}

function pickWeather(state: GameState): Weather {
  const roll = rngFloat(state.rngState);
  state.rngState = advanceRng(state.rngState);
  const kinds: WeatherKind[] = ['clear', 'clear', 'heatwave', 'storm', 'overcast', 'windy', 'cold', 'drought'];
  const kind = kinds[Math.floor(roll * kinds.length) % kinds.length];
  return WEATHERS[kind];
}

function makeMarket(state: GameState, turn: number): Market {
  const r1 = rngFloat(state.rngState); state.rngState = advanceRng(state.rngState);
  const r2 = rngFloat(state.rngState); state.rngState = advanceRng(state.rngState);
  const r3 = rngFloat(state.rngState); state.rngState = advanceRng(state.rngState);
  const r4 = rngFloat(state.rngState); state.rngState = advanceRng(state.rngState);
  const r5 = rngFloat(state.rngState); state.rngState = advanceRng(state.rngState);
  const roll = rngFloat(state.rngState); state.rngState = advanceRng(state.rngState);
  const eventRoll = rngFloat(state.rngState); state.rngState = advanceRng(state.rngState);
  const events = MARKET_EVENTS.filter((e) => e !== null);
  const event = roll < 0.55 ? null : events[Math.floor(eventRoll * events.length)];
  const cycle = 1 + 0.16 * Math.sin((turn / 6) * Math.PI);
  const power = BAL.marketBasePower * (0.72 + r1 * 0.6) * cycle * (event?.powerPriceMul ?? 1);
  const compute = BAL.marketBaseCompute * (0.82 + r2 * 0.36) * (event?.computePriceMul ?? 1);
  const fuel = BAL.marketBaseFuel * (0.8 + r3 * 0.5);
  const demand = 0.92 + r4 * 0.24;
  const service = BAL.marketBaseService * (0.8 + r5 * 0.5) * (event?.servicePriceMul ?? 1);
  return {
    powerPrice: Math.round(power * 10) / 10,
    computePrice: Math.round(compute * 100) / 100,
    fuelPrice: Math.round(fuel * 10) / 10,
    computeDemand: Math.round(demand * 100) / 100,
    servicePrice: Math.round(service * 10) / 10,
    event: event ?? null,
  };
}

export function createGame(opts: NewGameOptions): GameState {
  const size = opts.size ?? 18;
  const maxTurns = opts.maxTurns ?? BAL.maxTurns;
  const difficulty = opts.difficulty ?? 1;
  const seed = opts.seed >>> 0;
  const world = generateWorld(seed, size, 4);
  const state: GameState = {
    version: 1,
    seed,
    rngState: advanceRng(seed ^ 0x5bd1e995),
    turn: 1,
    maxTurns,
    size,
    difficulty,
    tiles: world.tiles,
    players: [],
    weather: WEATHERS.clear,
    forecast: WEATHERS.overcast,
    market: {
      powerPrice: BAL.marketBasePower, computePrice: BAL.marketBaseCompute,
      fuelPrice: BAL.marketBaseFuel, computeDemand: 1, servicePrice: BAL.marketBaseService, event: null,
    },
    nextMarket: {
      powerPrice: BAL.marketBasePower, computePrice: BAL.marketBaseCompute,
      fuelPrice: BAL.marketBaseFuel, computeDemand: 1, servicePrice: BAL.marketBaseService, event: null,
    },
    log: [],
    phase: 'player',
    victory: { winner: null, condition: null, title: '', detail: '' },
    summary: null,
    lastResolvedTurn: 0,
  };

  // Players.
  const names: { name: string; company: string; personality: Player['personality']; ai: boolean }[] = [
    { name: opts.playerName ?? 'You', company: 'Lumen Grid', personality: 'human', ai: false },
    ...AI_COMPANIES.map((c) => ({ ...c, ai: true })),
  ];
  names.forEach((n, i) => {
    state.players.push({
      id: i,
      name: n.name,
      company: n.company,
      color: PLAYER_COLORS[i],
      isAI: n.ai,
      personality: n.personality,
      credits: i === 0 ? BAL.startCredits : Math.round(BAL.startCredits * (0.94 + difficulty * 0.08)),
      research: 0,
      researchSpent: 0,
      techs: [],
      policy: n.personality === 'volt' ? 'flexible' : n.personality === 'helios' ? 'profit' : 'compute',
      stability: 60,
      compute: 0,
      computeShare: 0,
      capacity: 0,
      history: [],
      dominanceStreak: 0,
      efficientStreak: 0,
      claimsBought: 0,
      alive: true,
    });
  });

  // Starting assets.
  world.starts.forEach((start, pid) => {
    const mine = [
      { x: start.dc.x, y: start.dc.y, structure: { kind: 'dc_edge' as StructureKind, policy: 'compute' as Policy } },
      { x: start.gen.x, y: start.gen.y, structure: { kind: 'solar' as StructureKind, policy: 'compute' as Policy } },
      { x: start.sub.x, y: start.sub.y, structure: { kind: 'substation' as StructureKind, policy: 'compute' as Policy } },
    ];
    for (const m of mine) {
      const tile = tileAt(state.tiles, size, m.x, m.y)!;
      tile.owner = pid;
      tile.structure = { ...m.structure };
      tile.explored[pid] = true;
    }
    revealAround(state, pid, start.x, start.y, 3);
    state.players[pid].claimsBought = 3;
  });

  // Neutral transmission assets: contested strategic substations.
  const neutralSpots: { x: number; y: number }[] = [];
  const candidates = state.tiles.filter((t) => {
    if (t.terrain === 'ocean' || t.structure) return false;
    return world.starts.every((s) => Math.hypot(s.x - t.x, s.y - t.y) > 4.2);
  });
  for (const t of candidates) {
    if (neutralSpots.length >= (size <= 14 ? 2 : 3)) break;
    if (neutralSpots.some((s) => Math.hypot(s.x - t.x, s.y - t.y) < 4)) continue;
    if (t.terrain === 'mountain' || t.terrain === 'geothermal') continue;
    neutralSpots.push({ x: t.x, y: t.y });
  }
  for (const s of neutralSpots) {
    const t = tileAt(state.tiles, size, s.x, s.y)!;
    t.structure = { kind: 'substation', policy: 'compute' };
    t.elevation = Math.max(t.elevation, 0);
  }

  for (const p of state.players) {
    p.capacity = state.tiles
      .filter((t) => t.owner === p.id && t.structure && isGen(t.structure.kind))
      .reduce((a, t) => a + STRUCTURES[t.structure!.kind].capacity, 0);
  }

  state.weather = pickWeather(state);
  state.forecast = pickWeather(state);
  state.market = makeMarket(state, 1);
  state.nextMarket = makeMarket(state, 2);

  // Seed the HUD with a real projection so turn-1 numbers are meaningful.
  const projections = state.players.map((p) => dispatchPower(state, p.id));
  const initialCompute = projections.reduce((a, d) => a + d.dc.reduce((x, y) => x + y.compute, 0), 0);
  state.players.forEach((p, i) => {
    p.compute = Math.round(projections[i].dc.reduce((a, d) => a + d.compute, 0) * 10) / 10;
    p.computeShare = initialCompute > 0 ? p.compute / initialCompute : 0;
    p.stability = projections[i].stability;
  });

  state.log.push({ turn: 1, kind: 'info', text: `Grid synchronized. Welcome to ${state.players[0].company}.` });
  state.log.push({ turn: 1, kind: 'info', text: `Weather: ${state.weather.name}. ${state.weather.blurb}` });
  state.log.push({ turn: 1, kind: 'market', text: `Compute sells at $${state.market.computePrice.toFixed(2)}/CU. Power at $${state.market.powerPrice.toFixed(1)}/MWh.` });
  return state;
}

// ---------------------------------------------------------------------------
// Queries / legality
// ---------------------------------------------------------------------------

export function ownedTiles(state: GameState, playerId: number): Tile[] {
  return state.tiles.filter((t) => t.owner === playerId);
}

export function claimableTiles(state: GameState, playerId: number): Tile[] {
  const owned = new Set<number>();
  for (const t of state.tiles) if (t.owner === playerId) owned.add(tileIndex(state.size, t.x, t.y));
  return state.tiles.filter((t) => {
    if (t.owner !== null || t.terrain === 'ocean') return false;
    return neighbors4(t.x, t.y).some(([nx, ny]) => {
      const n = tileAt(state.tiles, state.size, nx, ny);
      return !!n && owned.has(tileIndex(state.size, nx, ny));
    });
  });
}

export function claimCost(state: GameState, playerId: number, tile: Tile): number {
  const player = state.players[playerId];
  const base = BAL.claimBaseCost + BAL.claimCostGrowth * player.claimsBought + BAL.claimCostPerTile * player.claimsBought;
  const terrainMul = TERRAIN_CLAIM[tile.terrain] ?? 1;
  const neutralPremium = tile.structure ? 55 : 0;
  return Math.round((base * terrainMul + neutralPremium) / 5) * 5;
}

const TERRAIN_CLAIM: Partial<Record<Terrain, number>> = {
  plains: 1, forest: 1.15, desert: 0.92, mountain: 1.3, river: 1.2, coast: 1.1,
  geothermal: 1.55, urban: 1.4, basin: 1.1,
};

export function canClaim(state: GameState, playerId: number, x: number, y: number): { ok: boolean; reason?: string; cost: number } {
  const tile = tileAt(state.tiles, state.size, x, y);
  if (!tile) return { ok: false, reason: 'Out of bounds', cost: 0 };
  if (tile.terrain === 'ocean') return { ok: false, reason: 'Cannot claim open water', cost: 0 };
  if (tile.owner !== null) return { ok: false, reason: tile.owner === playerId ? 'Already yours' : 'Claimed by a rival', cost: 0 };
  if (!claimableTiles(state, playerId).some((t) => t.x === x && t.y === y)) {
    return { ok: false, reason: 'Must border your territory', cost: 0 };
  }
  const cost = claimCost(state, playerId, tile);
  if (state.players[playerId].credits < cost) return { ok: false, reason: 'Not enough credits', cost };
  return { ok: true, cost };
}

export function structureCost(kind: StructureKind, tile: Tile, playerId: number, state: GameState): number {
  const def = STRUCTURES[kind];
  const buildMul = TERRAIN_BUILD[tile.terrain] ?? 1;
  let cost = def.cost * buildMul;
  if (kind === 'substation' && state.players[playerId].techs.includes('modular_substations')) cost *= 0.8;
  return Math.round(cost / 5) * 5;
}

const TERRAIN_BUILD: Partial<Record<Terrain, number>> = {
  plains: 1, forest: 1.12, desert: 0.95, mountain: 1.22, river: 1.05, coast: 1.05,
  geothermal: 1.15, urban: 0.9, basin: 0.95,
};

export function isUnlocked(state: GameState, playerId: number, kind: StructureKind): boolean {
  const def = STRUCTURES[kind];
  return !def.requires || state.players[playerId].techs.includes(def.requires);
}

export function canBuild(state: GameState, playerId: number, x: number, y: number, kind: StructureKind): { ok: boolean; reason?: string; cost: number } {
  const tile = tileAt(state.tiles, state.size, x, y);
  const def = STRUCTURES[kind];
  const cost = tile ? structureCost(kind, tile, playerId, state) : 0;
  if (!tile) return { ok: false, reason: 'Out of bounds', cost };
  if (tile.owner !== playerId) return { ok: false, reason: 'Not your territory', cost };
  if (tile.structure) return { ok: false, reason: 'Tile is occupied', cost };
  if (!isUnlocked(state, playerId, kind)) {
    const req = TECHNOLOGIES.find((t) => t.id === def.requires);
    return { ok: false, reason: `Requires ${req?.name ?? def.requires}`, cost };
  }
  if (def.terrain && !def.terrain.includes(tile.terrain)) {
    return { ok: false, reason: `Needs ${def.terrain.map((t) => TERRAIN_NAME[t]).join(' or ')}`, cost };
  }
  if (state.players[playerId].credits < cost) return { ok: false, reason: 'Not enough credits', cost };
  return { ok: true, cost };
}

const TERRAIN_NAME: Record<Terrain, string> = {
  ocean: 'sea', plains: 'plains', forest: 'forest', desert: 'desert', mountain: 'mountain',
  river: 'river', coast: 'coast', geothermal: 'geothermal', urban: 'urban', basin: 'gas basin',
};

export function upgradeCostFor(tile: Tile): number {
  if (!tile.structure || !isDc(tile.structure.kind)) return 0;
  const dc = DCS[tile.structure.kind];
  return dc.upgradeCost;
}

export function canUpgrade(state: GameState, playerId: number, tile: Tile): { ok: boolean; reason?: string; cost: number } {
  if (!tile.structure || !isDc(tile.structure.kind)) return { ok: false, reason: 'Not a data center', cost: 0 };
  if (tile.owner !== playerId) return { ok: false, reason: 'Not your territory', cost: 0 };
  const dc = DCS[tile.structure.kind];
  if (!dc.upgradeTo) return { ok: false, reason: 'Already top tier', cost: 0 };
  if (!isUnlocked(state, playerId, dc.upgradeTo)) {
    const req = TECHNOLOGIES.find((t) => t.id === STRUCTURES[dc.upgradeTo!].requires);
    return { ok: false, reason: `Requires ${req?.name}`, cost: dc.upgradeCost };
  }
  if (state.players[playerId].credits < dc.upgradeCost) return { ok: false, reason: 'Not enough credits', cost: dc.upgradeCost };
  return { ok: true, cost: dc.upgradeCost };
}

export function buildOptions(state: GameState, playerId: number, tile: Tile | null): BuildOption[] {
  return BUILD_ORDER.map((kind) => {
    const def = STRUCTURES[kind];
    const cost = tile ? structureCost(kind, tile, playerId, state) : def.cost;
    const unlocked = isUnlocked(state, playerId, kind);
    let reason: string | undefined;
    if (!unlocked) {
      reason = `Research ${TECHNOLOGIES.find((t) => t.id === def.requires)?.name ?? ''}`;
    } else if (tile) {
      const check = canBuild(state, playerId, tile.x, tile.y, kind);
      if (!check.ok) reason = check.reason;
    }
    return {
      kind, name: def.name, cost, category: def.category, blurb: def.blurb,
      stats: def.stats, unlocked, reason,
    };
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function claimTile(state: GameState, playerId: number, x: number, y: number): boolean {
  const check = canClaim(state, playerId, x, y);
  if (!check.ok) return false;
  const tile = tileAt(state.tiles, state.size, x, y)!;
  state.players[playerId].credits -= check.cost;
  state.players[playerId].claimsBought += 1;
  tile.owner = playerId;
  revealAround(state, playerId, x, y, 2);
  if (tile.structure) {
    pushLog(state, playerId, 'good', `${state.players[playerId].company} seized a neutral substation at ${coord(x, y)}.`);
  }
  return true;
}

export function buildStructure(state: GameState, playerId: number, x: number, y: number, kind: StructureKind): boolean {
  const check = canBuild(state, playerId, x, y, kind);
  if (!check.ok) return false;
  const tile = tileAt(state.tiles, state.size, x, y)!;
  state.players[playerId].credits -= check.cost;
  tile.structure = { kind, policy: state.players[playerId].policy };
  if (kind === 'battery') tile.structure.soc = 0;
  revealAround(state, playerId, x, y, 2);
  pushLog(state, playerId, 'info', `${state.players[playerId].company} built a ${STRUCTURES[kind].name}.`);
  return true;
}

export function upgradeStructure(state: GameState, playerId: number, x: number, y: number): boolean {
  const tile = tileAt(state.tiles, state.size, x, y);
  if (!tile) return false;
  const check = canUpgrade(state, playerId, tile);
  if (!check.ok || !tile.structure || !isDc(tile.structure.kind)) return false;
  const next = DCS[tile.structure.kind].upgradeTo!;
  state.players[playerId].credits -= check.cost;
  tile.structure.kind = next;
  tile.structure.policy = state.players[playerId].policy;
  pushLog(state, playerId, 'good', `${state.players[playerId].company} upgraded a data center to ${DCS[next].name}.`);
  return true;
}

export function setPolicy(state: GameState, playerId: number, policy: Policy, x?: number, y?: number) {
  if (x !== undefined && y !== undefined) {
    const tile = tileAt(state.tiles, state.size, x, y);
    if (tile?.structure && isDc(tile.structure.kind) && tile.owner === playerId) {
      tile.structure.policy = policy;
    }
    return;
  }
  state.players[playerId].policy = policy;
  for (const t of state.tiles) {
    if (t.owner === playerId && t.structure && isDc(t.structure.kind)) t.structure.policy = policy;
  }
}

export function researchOptions(state: GameState, playerId: number) {
  const player = state.players[playerId];
  return TECHNOLOGIES.filter((t) => !player.techs.includes(t.id)).map((t) => ({
    node: t,
    available: t.requires.every((r) => player.techs.includes(r)),
    affordable: player.research >= t.cost,
  }));
}

export function buyTech(state: GameState, playerId: number, techId: string): boolean {
  const player = state.players[playerId];
  const node = TECHNOLOGIES.find((t) => t.id === techId);
  if (!node || player.techs.includes(techId)) return false;
  if (!node.requires.every((r) => player.techs.includes(r))) return false;
  if (player.research < node.cost) return false;
  player.research -= node.cost;
  player.researchSpent += node.cost;
  player.techs.push(techId);
  pushLog(state, playerId, 'good', `${player.company} researched ${node.name}.`);
  return true;
}

export function avgUpkeep(state: GameState, playerId: number): number {
  let sum = 0;
  for (const t of state.tiles) {
    if (t.owner === playerId && t.structure) sum += STRUCTURES[t.structure.kind].upkeep;
  }
  return sum;
}

function coord(x: number, y: number) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function pushLog(state: GameState, playerId: number | null, kind: LogEntry['kind'], text: string) {
  state.log.unshift({ turn: state.turn, kind, text, player: playerId ?? undefined });
  if (state.log.length > 160) state.log.length = 160;
}

// ---------------------------------------------------------------------------
// Turn resolution
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** Skips AI turns (used by tests/simulations that drive AI separately). */
  skipAI?: boolean;
}

let aiHook: ((state: GameState, playerId: number) => void) | null = null;

/** Wired by the AI module to avoid a circular import in the simulation core. */
export function registerAIPlayer(fn: (state: GameState, playerId: number) => void) {
  aiHook = fn;
}

export function endTurn(state: GameState): TurnReport {
  if (state.phase !== 'player') throw new Error('Cannot end turn outside the player phase');
  state.phase = 'resolve';
  const human = state.players[0];
  const creditsStart = human.credits;

  // 1. Rival planning + construction.
  for (const p of state.players) {
    if (!p.isAI) continue;
    aiHook?.(state, p.id);
  }

  // 2. Resolve every player's dispatch and economy against the same market snapshot.
  const dispatches: DispatchResult[] = [];
  for (const p of state.players) {
    dispatches.push(dispatchPower(state, p.id));
  }

  const notes: string[] = [];
  const rivalHighlights: string[] = [];

  state.players.forEach((p, i) => {
    const d = dispatches[i];
    const revenue = d.dc.reduce((a, x) => a + x.revenue, 0);
    const service = d.serviceRevenue;
    const powerSale = d.surplusRevenue;
    const upkeep = avgUpkeep(state, p.id);
    const opex = upkeep + d.fuelCost + d.importCost;
    const net = revenue + service + powerSale - opex;
    p.credits = Math.max(0, p.credits + net);

    // Research output (labs + proportionally powered data centers).
    let rp = 0;
    for (const t of state.tiles) {
      if (t.owner !== p.id || !t.structure) continue;
      if (t.structure.kind === 'lab') {
        rp += BAL.researchPerLab;
      } else if (isDc(t.structure.kind)) {
        const delivery = d.dc.find((x) => x.x === t.x && x.y === t.y);
        const frac = delivery ? Math.min(1, delivery.delivered / Math.max(delivery.demand, 0.01)) : 0;
        rp += BAL.dcResearch[t.structure.kind] * frac;
      }
    }
    p.research += Math.round(rp * 10) / 10;
    p.compute = Math.round(d.dc.reduce((a, x) => a + x.compute, 0) * 10) / 10;
    p.capacity = state.tiles
      .filter((t) => t.owner === p.id && t.structure && isGen(t.structure.kind))
      .reduce((a, t) => a + STRUCTURES[t.structure!.kind].capacity, 0);
    p.stability = d.stability;

    const stats: TurnStats = {
      turn: state.turn,
      generation: Math.round(d.generation * 10) / 10,
      demand: Math.round(d.demand * 10) / 10,
      delivered: Math.round(d.delivered * 10) / 10,
      compute: p.compute,
      revenue: Math.round((revenue + service + powerSale) * 10) / 10,
      opex: Math.round(opex * 10) / 10,
      research: Math.round(rp * 10) / 10,
      stability: d.stability,
      net: Math.round(net * 10) / 10,
      credits: Math.round(p.credits * 10) / 10,
      dcCount: state.tiles.filter((t) => t.owner === p.id && t.structure && isDc(t.structure.kind)).length,
      capacity: Math.round(p.capacity),
    };
    p.history.push(stats);

    // Low-stability incident.
    if (d.stability < BAL.outageThreshold && state.tiles.some((t) => t.owner === p.id && t.structure && isDc(t.structure.kind))) {
      const roll = rngFloat(state.rngState);
      state.rngState = advanceRng(state.rngState);
      if (roll < (BAL.outageThreshold - d.stability) / 100 + 0.15) {
        const loss = Math.round(p.credits * 0.08);
        p.credits = Math.max(0, p.credits - loss);
        if (p.id === 0) notes.push(`Brownout! Grid instability cost you $${loss}.`);
        else rivalHighlights.push(`${p.company} suffered a brownout.`);
      }
    }

    if (p.id === 0) {
      if (d.demand > 0 && d.delivered < d.demand * 0.985) {
        notes.push(`${Math.round(d.demand - d.delivered)} MW of data-center demand went unserved — check transmission or add generation.`);
      }
      const congested = d.nodes.filter((n) => n.util > 0.92 && (n.kind === 'line' || n.kind === 'substation'));
      if (congested.length) notes.push(`Congestion on ${congested.length} grid asset${congested.length > 1 ? 's' : ''}: power cannot reach some loads.`);
      if (d.surplusSold > 5) notes.push(`Sold ${Math.round(d.surplusSold)} MWh of surplus power for $${Math.round(d.surplusRevenue)}.`);
      if (d.importMW > 1) notes.push(`Imported ${Math.round(d.importMW)} MW at premium prices ($${Math.round(d.importCost)}).`);
    }
  });

  // 3. Market shares.
  const totalCompute = state.players.reduce((a, p) => a + p.compute, 0);
  for (const p of state.players) {
    p.computeShare = totalCompute > 0 ? p.compute / totalCompute : 0;
    p.dominanceStreak = p.computeShare >= BAL.dominanceShare ? p.dominanceStreak + 1 : 0;
    p.efficientStreak = p.compute >= BAL.techComputeTarget ? p.efficientStreak + 1 : 0;
  }

  // 4. Market / weather progression + forecast. Compute prices follow a demand curve:
  //    as the world's installed compute grows, per-CU prices compress.
  const demandRef = 900 + state.turn * 25;
  const priceCurve = Math.max(0.28, demandRef / (demandRef + totalCompute));
  state.nextMarket = { ...state.nextMarket, computePrice: Math.round(state.nextMarket.computePrice * priceCurve * 100) / 100 };
  state.turn += 1;
  state.lastResolvedTurn = state.turn - 1;
  state.weather = state.forecast;
  state.forecast = pickWeather(state);
  state.market = state.nextMarket;
  state.nextMarket = makeMarket(state, state.turn + 1);

  state.log.unshift({
    turn: state.turn, kind: 'market',
    text: `${state.weather.name}: ${state.weather.blurb} Power $${state.market.powerPrice.toFixed(1)}/MWh · Compute $${state.market.computePrice.toFixed(2)}/CU${state.market.event ? ` · ${state.market.event.name}` : ''}.`,
  });

  // 5. Victory.
  const victory = evaluateVictory(state);
  const report: TurnReport = {
    turn: state.turn - 1,
    playerId: 0,
    generation: Math.round(dispatches[0].generation),
    demand: Math.round(dispatches[0].demand),
    delivered: Math.round(dispatches[0].delivered),
    compute: round1(human.compute),
    computeRevenue: Math.round(dispatches[0].dc.reduce((a, x) => a + x.revenue, 0)),
    powerRevenue: Math.round(dispatches[0].surplusRevenue),
    serviceRevenue: Math.round(dispatches[0].serviceRevenue),
    opex: Math.round(avgUpkeep(state, 0) + dispatches[0].fuelCost + dispatches[0].importCost),
    research: human.history.at(-1)?.research ?? 0,
    stability: dispatches[0].stability,
    creditsStart: Math.round(creditsStart),
    creditsEnd: Math.round(human.credits),
    notes,
    rivalHighlights,
  };
  state.summary = report;

  if (victory.winner !== null) {
    state.victory = victory;
    state.phase = 'gameover';
    state.log.unshift({ turn: state.turn, kind: 'milestone', text: `${state.players[victory.winner].company} wins — ${victory.title}.` });
  } else if (state.turn > state.maxTurns) {
    const winner = state.players.reduce((best, p) => (scorePlayer(p) > scorePlayer(best) ? p : best), state.players[0]);
    state.victory = {
      winner: winner.id, condition: 'score',
      title: 'Final Score Victory',
      detail: `${winner.company} finishes with the highest empire score after ${state.maxTurns} turns.`,
    };
    state.phase = 'gameover';
    state.log.unshift({ turn: state.turn, kind: 'milestone', text: `${winner.company} wins on score.` });
  } else {
    state.phase = 'player';
  }

  // 6. Fog of war around all owned territory.
  for (const p of state.players) {
    for (const t of state.tiles) {
      if (t.owner === p.id) revealAround(state, p.id, t.x, t.y, 2);
    }
  }
  return report;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function scorePlayer(p: Player): number {
  return Math.round(
    p.credits * BAL.scorePerCredit +
    p.compute * BAL.scorePerCompute +
    p.capacity * BAL.scorePerCapacity +
    p.techs.length * BAL.scorePerTech +
    p.computeShare * 250,
  );
}

export function evaluateVictory(state: GameState): VictoryState {
  const none: VictoryState = { winner: null, condition: null, title: '', detail: '' };
  for (const p of state.players) {
    if (p.dominanceStreak >= BAL.dominanceTurns) {
      return {
        winner: p.id, condition: 'compute', title: 'Compute Dominance',
        detail: `${p.company} controlled ${Math.round(p.computeShare * 100)}% of the global compute market for ${BAL.dominanceTurns} turns.`,
      };
    }
  }
  for (const p of state.players) {
    if (p.capacity >= BAL.energyCapacity && p.stability >= BAL.energyStability && p.credits >= BAL.energyCredits) {
      return {
        winner: p.id, condition: 'energy', title: 'Energy Empire',
        detail: `${p.company} built ${Math.round(p.capacity)} MW of reliable generation, kept the grid at ${p.stability} stability and banked $${Math.round(p.credits)}.`,
      };
    }
  }
  for (const p of state.players) {
    if (p.techs.includes('autonomy') && p.efficientStreak >= BAL.techComputeTurns) {
      return {
        winner: p.id, condition: 'tech', title: 'Technology Leadership',
        detail: `${p.company} achieved autonomous fleet optimization and sustained ${Math.round(p.compute)} CU/turn of efficient compute.`,
      };
    }
  }
  return none;
}

/** What the player still needs for each victory path, for the UI. */
export function victoryProgress(state: GameState, playerId: number) {
  const p = state.players[playerId];
  const totalCompute = state.players.reduce((a, x) => a + x.compute, 0);
  const share = totalCompute > 0 ? p.compute / totalCompute : 0;
  return {
    compute: { progress: Math.min(1, share / BAL.dominanceShare), label: `${Math.round(share * 100)}% / ${Math.round(BAL.dominanceShare * 100)}% share`, streak: p.dominanceStreak },
    energy: {
      progress: Math.min(1, Math.min(p.capacity / BAL.energyCapacity, p.stability / BAL.energyStability, p.credits / BAL.energyCredits)),
      label: `${Math.round(p.capacity)}/${BAL.energyCapacity} MW · ${p.stability}/${BAL.energyStability} stab · $${Math.round(p.credits)}/${BAL.energyCredits}`,
    },
    tech: {
      progress: Math.min(1, (p.techs.includes('autonomy') ? 0.5 : 0.15 + p.techs.length / 15 * 0.35) + Math.min(1, p.efficientStreak / BAL.techComputeTurns) * 0.5),
      label: `${p.techs.includes('autonomy') ? 'AI autonomy online' : 'Autonomy not researched'} · ${Math.round(p.compute)}/${BAL.techComputeTarget} CU`,
    },
    score: scorePlayer(p),
  };
}

/** Quick projection of this turn's dispatch for the human player (used by UI panels). */
export function projectDispatch(state: GameState, playerId: number): DispatchResult {
  // Dispatch mutates battery SOC; run on a structural clone to keep previews pure.
  const clone: GameState = {
    ...state,
    players: state.players.map((p) => ({ ...p, techs: [...p.techs] })),
    tiles: state.tiles.map((t) => ({
      ...t,
      structure: t.structure ? { ...t.structure } : null,
      explored: [...t.explored],
    })),
  };
  return dispatchPower(clone, playerId);
}

export const AI_PERSONALITY_LABEL: Record<string, string> = {
  helios: 'Renewable energy specialist',
  titan: 'Aggressive compute expansion',
  volt: 'Grid control and flexibility',
  human: 'Your company',
};

