import type { GameState, Player, Tile } from '../engine/types.ts';
import { STRUCTURES, DCS, POLICY_INFO, TERRAIN_INFO } from '../engine/config.ts';
import { genOutput, isDc, isGen, pueWithWeather, playerModifiers } from '../engine/grid.ts';

export function money(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function num(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function signed(n: number, digits = 0, suffix = ''): string {
  const v = n >= 0 ? `+${num(n, digits)}` : num(n, digits);
  return `${v}${suffix}`;
}

export function coord(x: number, y: number): string {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function terrainName(t: Tile['terrain']): string {
  return TERRAIN_INFO[t].name;
}

export function ownerName(game: GameState, owner: number | null): string {
  if (owner === null) return 'Unclaimed';
  return game.players[owner]?.company ?? 'Unknown';
}

export function structureName(kind: string): string {
  return STRUCTURES[kind as keyof typeof STRUCTURES]?.name ?? kind;
}

export function structureBlurb(kind: string): string {
  return STRUCTURES[kind as keyof typeof STRUCTURES]?.blurb ?? '';
}

export function tileMetrics(game: GameState, tile: Tile, player: Player) {
  const s = tile.structure;
  if (!s) return null;
  const mods = playerModifiers(player);
  if (isGen(s.kind)) {
    const out = genOutput(tile, player, game.weather);
    return {
      kind: 'gen' as const,
      name: STRUCTURES[s.kind].name,
      capacity: STRUCTURES[s.kind].capacity,
      output: out?.available ?? 0,
      upkeep: STRUCTURES[s.kind].upkeep,
      note: `${TERRAIN_INFO[tile.terrain].name} × ${weatherLabel(game)}`,
    };
  }
  if (isDc(s.kind)) {
    const def = DCS[s.kind];
    const pue = pueWithWeather(tile, mods, game.weather);
    const policy = (s.policy ?? player.policy) as keyof typeof POLICY_INFO;
    const info = POLICY_INFO[policy];
    const eff = def.eff * mods.compute * info.compute;
    const demand = def.it * pue * info.demand;
    return {
      kind: 'dc' as const,
      name: def.name,
      it: def.it,
      pue,
      eff,
      policy,
      policyName: info.name,
      demand,
      compute: (demand / pue) * eff,
      upkeep: STRUCTURES[s.kind].upkeep,
      upgrade: DCS[s.kind].upgradeTo ? DCS[DCS[s.kind].upgradeTo!].name : null,
    };
  }
  return {
    kind: 'other' as const,
    name: STRUCTURES[s.kind].name,
    upkeep: STRUCTURES[s.kind].upkeep,
    capacity: STRUCTURES[s.kind].capacity,
    soc: s.soc ?? 0,
  };
}

function weatherLabel(game: GameState): string {
  return `${game.weather.name} (${Math.round(game.weather.solar * 100)}% solar · ${Math.round(game.weather.wind * 100)}% wind)`;
}

/** Projected per-turn operating result and research from the current board. */
export function projectIncome(game: GameState, playerId: number, preview: ReturnType<typeof import('../engine/simulation.ts').projectDispatch> | null) {
  const player = game.players[playerId];
  let upkeep = 0;
  for (const t of game.tiles) {
    if (t.owner !== playerId || !t.structure) continue;
    upkeep += STRUCTURES[t.structure.kind].upkeep;
  }
  if (!preview) return { revenue: 0, opex: upkeep, net: -upkeep, research: 0, service: 0 };
  const compute = preview.dc.reduce((a, d) => a + d.revenue, 0);
  const revenue = compute + preview.serviceRevenue + preview.surplusRevenue;
  const opex = upkeep + preview.fuelCost + preview.importCost;
  let research = 0;
  for (const t of game.tiles) {
    if (t.owner !== playerId || !t.structure) continue;
    if (t.structure.kind === 'lab') research += 12;
    else if (isDc(t.structure.kind)) {
      const d = preview.dc.find((x) => x.x === t.x && x.y === t.y);
      const frac = d ? Math.min(1, d.delivered / Math.max(d.demand, 0.01)) : 0;
      research += (game.players[playerId].techs.includes('workload_sched') ? 1.1 : 1) * (t.structure.kind === 'dc_edge' ? 4 : t.structure.kind === 'dc_hyper' ? 9 : 16) * frac;
    }
  }
  void player;
  return { revenue, opex, net: revenue - opex, research, service: preview.serviceRevenue };
}

export function countStructures(game: GameState, playerId: number) {
  const counts: Record<string, number> = {};
  for (const t of game.tiles) {
    if (t.owner !== playerId || !t.structure) continue;
    counts[t.structure.kind] = (counts[t.structure.kind] ?? 0) + 1;
  }
  return counts;
}
