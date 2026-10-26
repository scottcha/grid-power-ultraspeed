import { BAL, DCS, POLICY_INFO, STRUCTURES, TERRAIN_INFO, WEATHERS } from './config.ts';
import type { DcKind, GenKind, GameState, Player, Structure, Tile, Weather } from './types.ts';

export interface Modifiers {
  solar: number;
  wind: number;
  compute: number;
  pueDelta: number;
  lineCap: number;
  subCap: number;
  service: number;
  powerSale: number;
  importFraction: number;
  stability: number;
}

export function playerModifiers(player: Player): Modifiers {
  const has = (id: string) => player.techs.includes(id);
  return {
    solar: has('solar_boost') ? 1.25 : 1,
    wind: has('wind_boost') ? 1.25 : 1,
    compute: (has('efficient_gpus') ? 1.12 : 1) *
      (has('liquid_cooling') ? 1.06 : 1) *
      (has('ai_accelerators') ? 1.18 : 1) *
      (has('gigafactory') ? 1.12 : 1) *
      (has('gpu_power_mgmt') ? 1.08 : 1) *
      (has('workload_sched') ? 1.1 : 1) *
      (has('adaptive_inference') ? 1.12 : 1) *
      (has('autonomy') ? 1.2 : 1),
    pueDelta: (has('adv_cooling') ? -0.07 : 0) + (has('liquid_cooling') ? -0.09 : 0) + (has('workload_sched') ? -0.04 : 0),
    lineCap: has('hv_transmission') ? 1.3 : 1,
    subCap: has('modular_substations') ? 1.25 : 1,
    service: (has('gpu_power_mgmt') ? 1.15 : 1) * (has('demand_response') ? 1.5 : 1) * (has('adaptive_inference') ? 1.25 : 1) * (has('autonomy') ? 1.4 : 1),
    powerSale: has('adv_grid_ops') ? 1.1 : 1,
    importFraction: has('grid_interconnection') ? 0.25 : 0,
    stability: (has('smart_grid') ? 5 : 0) + (has('adv_grid_ops') ? 8 : 0),
  };
}

export const GRID_KINDS: Record<string, true> = {
  solar: true, wind: true, gas: true, hydro: true, geothermal: true, nuclear: true,
  substation: true, line: true, battery: true, dc_edge: true, dc_hyper: true, dc_giga: true, lab: true,
};

export function isGen(kind: string): kind is GenKind {
  return kind === 'solar' || kind === 'wind' || kind === 'gas' || kind === 'hydro' || kind === 'geothermal' || kind === 'nuclear';
}

export function isDc(kind: string): kind is DcKind {
  return kind === 'dc_edge' || kind === 'dc_hyper' || kind === 'dc_giga';
}

export function pueWithWeather(tile: Tile, mods: Modifiers, weather: Weather): number {
  if (!tile.structure || !isDc(tile.structure.kind)) return 1;
  const base = DCS[tile.structure.kind].pue;
  const terrain = TERRAIN_INFO[tile.terrain].cooling;
  return Math.max(1.02, base + terrain + mods.pueDelta + weather.cooling);
}

export interface GenOutput {
  x: number;
  y: number;
  kind: GenKind;
  available: number;
  nameplate: number;
}

export function genOutput(tile: Tile, player: Player, weather: Weather = WEATHERS.clear): GenOutput | null {
  if (!tile.structure || !isGen(tile.structure.kind)) return null;
  const kind = tile.structure.kind;
  const mods = playerModifiers(player);
  const cap = STRUCTURES[kind].capacity;
  let factor: number;
  switch (kind) {
    case 'solar': factor = TERRAIN_INFO[tile.terrain].solar * weather.solar * mods.solar; break;
    case 'wind': factor = TERRAIN_INFO[tile.terrain].wind * weather.wind * mods.wind; break;
    case 'hydro': factor = 0.92 * weather.hydro; break;
    case 'gas': factor = 0.96; break;
    case 'nuclear': factor = 0.98; break;
    case 'geothermal': factor = 0.95; break;
  }
  const available = cap * Math.min(1.05, Math.max(0, factor));
  return { x: tile.x, y: tile.y, kind, available: Math.round(available * 10) / 10, nameplate: cap };
}

export interface DcDispatch {
  x: number;
  y: number;
  kind: DcKind;
  it: number;
  pue: number;
  eff: number;
  policy: string;
  demand: number;
  delivered: number;
  compute: number;
  utilization: number;
  revenue: number;
  service: number;
  importMW: number;
  importCost: number;
}

export interface GridNode {
  x: number;
  y: number;
  kind: string;
  cap: number;
  flow: number;
  util: number;
  island: number;
}

export interface Island {
  id: number;
  tiles: { x: number; y: number }[];
  supply: number;
  demand: number;
  delivered: number;
  hasSubstation: boolean;
  batteryIn: number;
  batteryOut: number;
  labLoad: number;
  surplus: number;
  importMW: number;
}

export interface DispatchResult {
  generation: number;
  demand: number;
  delivered: number;
  surplusSold: number;
  surplusRevenue: number;
  importMW: number;
  importCost: number;
  fuelCost: number;
  serviceRevenue: number;
  serviceCapacity: number;
  stability: number;
  dc: DcDispatch[];
  nodes: GridNode[];
  islands: Island[];
  curtailed: number;
}

interface FlowEdge { to: number; cap: number; orig: number; rev: number }
interface FlowGraph {
  adj: FlowEdge[][];
  level: number[];
  it: number[];
}

function graph(n: number): FlowGraph {
  return { adj: Array.from({ length: n }, () => [] as FlowEdge[]), level: new Array(n).fill(0), it: new Array(n).fill(0) };
}

function addEdge(g: FlowGraph, u: number, v: number, cap: number): FlowEdge {
  const a: FlowEdge = { to: v, cap, orig: cap, rev: g.adj[v].length };
  const b: FlowEdge = { to: u, cap: 0, orig: 0, rev: g.adj[u].length };
  g.adj[u].push(a);
  g.adj[v].push(b);
  return a;
}

function bfs(g: FlowGraph, s: number, t: number): boolean {
  g.level.fill(-1);
  g.level[s] = 0;
  const q = [s];
  for (let qi = 0; qi < q.length; qi++) {
    const u = q[qi];
    for (const e of g.adj[u]) {
      if (e.cap > 1e-6 && g.level[e.to] < 0) {
        g.level[e.to] = g.level[u] + 1;
        q.push(e.to);
      }
    }
  }
  return g.level[t] >= 0;
}

function dfs(g: FlowGraph, u: number, t: number, f: number): number {
  if (u === t) return f;
  for (; g.it[u] < g.adj[u].length; g.it[u]++) {
    const e = g.adj[u][g.it[u]];
    if (e.cap > 1e-6 && g.level[e.to] === g.level[u] + 1) {
      const d = dfs(g, e.to, t, Math.min(f, e.cap));
      if (d > 1e-6) {
        e.cap -= d;
        g.adj[e.to][e.rev].cap += d;
        return d;
      }
    }
  }
  return 0;
}

function maxFlow(g: FlowGraph, s: number, t: number): number {
  let flow = 0;
  while (bfs(g, s, t)) {
    g.it.fill(0);
    let f = 0;
    while ((f = dfs(g, s, t, Infinity)) > 1e-6) flow += f;
  }
  return flow;
}

/** Builds the electrical network for one player and dispatches power for the current turn. */
export function dispatchPower(state: GameState, playerId: number): DispatchResult {
  const player = state.players[playerId];
  const mods = playerModifiers(player);
  const size = state.size;
  const gridTiles = state.tiles.filter((t) => t.owner === playerId && t.structure && GRID_KINDS[t.structure.kind]);
  const key = (x: number, y: number) => y * size + x;
  const nodeIndex = new Map<number, number>();
  gridTiles.forEach((t, i) => nodeIndex.set(key(t.x, t.y), i));

  // --- Connected components (grid islands).
  const islandOf = new Array(gridTiles.length).fill(-1);
  const islands: Island[] = [];
  for (let i = 0; i < gridTiles.length; i++) {
    if (islandOf[i] >= 0) continue;
    const id = islands.length;
    const stack = [i];
    islandOf[i] = id;
    const members: number[] = [];
    let hasSub = false;
    while (stack.length) {
      const cur = stack.pop()!;
      members.push(cur);
      const t = gridTiles[cur];
      if (t.structure!.kind === 'substation') hasSub = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = nodeIndex.get(key(t.x + dx, t.y + dy));
        if (ni !== undefined && islandOf[ni] < 0) {
          islandOf[ni] = id;
          stack.push(ni);
        }
      }
    }
    islands.push({
      id, tiles: members.map((m) => ({ x: gridTiles[m].x, y: gridTiles[m].y })),
      supply: 0, demand: 0, delivered: 0, hasSubstation: hasSub,
      batteryIn: 0, batteryOut: 0, labLoad: 0, surplus: 0, importMW: 0,
    });
  }

  // --- Supply, demand, storage, labs.
  const gens: GenOutput[] = [];
  const dcEntries: { tile: Tile; it: number; pue: number; eff: number; demand: number; policy: string }[] = [];
  const batteries: { tile: Tile; island: number }[] = [];
  const labCountByIsland = new Map<number, number>();
  for (const t of gridTiles) {
    const s = t.structure!;
    const island = islandOf[nodeIndex.get(key(t.x, t.y))!];
    if (isGen(s.kind)) {
      const out = genOutput(t, player, state.weather);
      if (out) {
        gens.push(out);
        islands[island].supply += out.available;
      }
    } else if (isDc(s.kind)) {
      const policy = effectivePolicy(s, player);
      const info = POLICY_INFO[policy as keyof typeof POLICY_INFO];
      const pue = pueWithWeather(t, mods, state.weather);
      const it = DCS[s.kind].it;
      const demand = it * pue * info.demand;
      dcEntries.push({ tile: t, it, pue, eff: DCS[s.kind].eff * mods.compute * info.compute, demand, policy });
      islands[island].demand += demand;
    } else if (s.kind === 'battery') {
      batteries.push({ tile: t, island });
    } else if (s.kind === 'lab') {
      labCountByIsland.set(island, (labCountByIsland.get(island) ?? 0) + 1);
      islands[island].demand += 3;
    }
  }
  for (const [isl, n] of labCountByIsland) islands[isl].labLoad = n * 3;

  // --- Battery dispatch (charge from island surplus, discharge into shortfall).
  const battPower = BAL.battery.power * (player.techs.includes('batteries_hd') ? 1.5 : 1);
  const battCap = BAL.battery.energy * (player.techs.includes('batteries_hd') ? 1.5 : 1);
  const battEff = BAL.battery.eff + (player.techs.includes('batteries_hd') ? 0.04 : 0);
  for (const b of batteries) {
    const isl = islands[b.island];
    const s = b.tile.structure!;
    const stored = Math.min(battCap, s.soc ?? 0);
    const net = isl.supply + isl.batteryOut - isl.demand - isl.batteryIn;
    if (net > 0.5 && stored < battCap - 0.5) {
      const charge = Math.min(net * 0.9, battPower, (battCap - stored) / battEff);
      s.soc = stored + charge * battEff;
      isl.batteryIn += charge;
    } else if (net < -0.5 && stored > 0.5) {
      const discharge = Math.min(-net, battPower, stored);
      s.soc = stored - discharge;
      isl.batteryOut += discharge;
    } else {
      s.soc = stored;
    }
  }

  // --- Flow network with node capacities.
  const nodeCap = (kind: string): number => {
    if (kind === 'line') return BAL.lineCapacity * mods.lineCap;
    if (kind === 'substation') return BAL.substationCapacity * mods.subCap;
    return 1e6;
  };
  const N = gridTiles.length;
  const S = N * 2;
  const T = N * 2 + 1;
  const g = graph(N * 2 + 2);
  const nodeIn = (i: number) => i * 2;
  const nodeOut = (i: number) => i * 2 + 1;

  for (let i = 0; i < N; i++) addEdge(g, nodeIn(i), nodeOut(i), nodeCap(gridTiles[i].structure!.kind));
  for (let i = 0; i < N; i++) {
    const t = gridTiles[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = nodeIndex.get(key(t.x + dx, t.y + dy));
      if (ni !== undefined && ni > i) {
        addEdge(g, nodeOut(i), nodeIn(ni), 1e6);
        addEdge(g, nodeOut(ni), nodeIn(i), 1e6);
      }
    }
  }

  interface Handle { edge: FlowEdge; cap: number; kind: 'gen' | 'dc' | 'lab' | 'charge'; gen?: GenOutput; dc?: DcDispatch }
  const handles: Handle[] = [];
  for (const gen of gens) {
    const ni = nodeIndex.get(key(gen.x, gen.y))!;
    const e = addEdge(g, S, nodeIn(ni), gen.available);
    handles.push({ edge: e, cap: gen.available, kind: 'gen', gen });
  }
  for (const b of batteries) {
    const isl = islands[b.island];
    if (isl.batteryOut > 0.01) {
      const ni = nodeIndex.get(key(b.tile.x, b.tile.y))!;
      addEdge(g, S, nodeIn(ni), isl.batteryOut);
    }
  }

  const dcResults: DcDispatch[] = dcEntries.map((d) => ({
    x: d.tile.x, y: d.tile.y, kind: d.tile.structure!.kind as DcKind,
    it: d.it, pue: d.pue, eff: d.eff, policy: d.policy,
    demand: d.demand, delivered: 0, compute: 0, utilization: 0,
    revenue: 0, service: 0, importMW: 0, importCost: 0,
  }));
  for (const d of dcResults) {
    const ni = nodeIndex.get(key(d.x, d.y))!;
    const e = addEdge(g, nodeOut(ni), T, d.demand);
    handles.push({ edge: e, cap: d.demand, kind: 'dc', dc: d });
  }
  for (const t of gridTiles) {
    if (t.structure!.kind !== 'lab') continue;
    const ni = nodeIndex.get(key(t.x, t.y))!;
    const e = addEdge(g, nodeOut(ni), T, 3);
    handles.push({ edge: e, cap: 3, kind: 'lab' });
  }
  for (const b of batteries) {
    const isl = islands[b.island];
    if (isl.batteryIn > 0.01) {
      const ni = nodeIndex.get(key(b.tile.x, b.tile.y))!;
      const e = addEdge(g, nodeOut(ni), T, isl.batteryIn);
      handles.push({ edge: e, cap: isl.batteryIn, kind: 'charge' });
    }
  }

  maxFlow(g, S, T);
  const flowOf = (h: Handle) => h.cap - h.edge.cap;
  let genUsed = 0;
  let labDelivered = 0;
  for (const h of handles) {
    const f = flowOf(h);
    if (h.kind === 'gen') genUsed += f;
    else if (h.kind === 'dc' && h.dc) h.dc.delivered = f;
    else if (h.kind === 'lab') labDelivered += f;
  }

  // --- Grid imports (Grid Interconnection tech) close part of a shortfall at a premium.
  const market = state.market;
  let importMW = 0;
  let importCost = 0;
  if (mods.importFraction > 0) {
    for (const d of dcResults) {
      if (d.delivered >= d.demand - 0.01) continue;
      const ni = nodeIndex.get(key(d.x, d.y))!;
      const isl = islands[islandOf[ni]];
      if (!isl.hasSubstation) continue;
      const gap = d.demand - d.delivered;
      const cap = Math.min(gap, d.demand * mods.importFraction, 45);
      d.importMW = cap;
      d.delivered += cap;
      d.importCost = cap * market.powerPrice * 1.6 * BAL.powerRevenueScale;
      importMW += cap;
      importCost += d.importCost;
      isl.importMW += cap;
    }
  }

  // --- Compute + revenue per DC.
  let computeRevenue = 0;
  let serviceRevenue = 0;
  let serviceCapacity = 0;
  let deliveredToDc = 0;
  for (const d of dcResults) {
    d.utilization = Math.max(0, Math.min(1, d.delivered / Math.max(d.demand, 0.001)));
    const itPower = d.delivered / d.pue;
    d.compute = itPower * d.eff;
    d.revenue = d.compute * market.computePrice;
    const info = POLICY_INFO[d.policy as keyof typeof POLICY_INFO];
    const svcMW = d.delivered > 0.5 ? d.it * info.service : 0;
    d.service = svcMW * market.servicePrice * BAL.serviceRevenueScale * mods.service;
    serviceCapacity += svcMW;
    deliveredToDc += d.delivered;
    computeRevenue += d.revenue;
    serviceRevenue += d.service;
  }
  for (let i = 0; i < gridTiles.length; i++) {
    if (!isDc(gridTiles[i].structure!.kind)) continue;
    const d = dcResults.find((r) => r.x === gridTiles[i].x && r.y === gridTiles[i].y);
    if (d) islands[islandOf[i]].delivered += d.delivered;
  }

  // Batteries provide reserve capacity for grid services while they hold charge.
  for (const b of batteries) {
    const stored = b.tile.structure!.soc ?? 0;
    if (stored <= 2) continue;
    const power = BAL.battery.power * (player.techs.includes('batteries_hd') ? 1.5 : 1);
    serviceRevenue += power * market.servicePrice * BAL.serviceRevenueScale * 0.35 * mods.service;
    serviceCapacity += power;
  }

  // --- Surplus power sales.
  let surplusSold = 0;
  let surplusRevenue = 0;
  for (const isl of islands) {
    isl.surplus = Math.max(0, isl.supply + isl.batteryOut - isl.delivered - isl.batteryIn - isl.labLoad);
    const exportLimit = isl.supply * BAL.exportCapFraction;
    const value = Math.min(isl.surplus, exportLimit) * market.powerPrice * (isl.hasSubstation ? BAL.gridConnectionFactor : BAL.islandedSellFactor) * BAL.powerRevenueScale * mods.powerSale;
    surplusSold += isl.surplus;
    surplusRevenue += value;
  }

  // --- Gas fuel costs on the share of output actually used.
  const gasAvailable = gens.filter((x) => x.kind === 'gas').reduce((a, x) => a + x.available, 0);
  const totalAvailable = gens.reduce((a, x) => a + x.available, 0);
  const usedFraction = totalAvailable > 0 ? Math.min(1, genUsed / totalAvailable) : 0;
  const fuelCost = gasAvailable * usedFraction * market.fuelPrice * BAL.powerRevenueScale * 0.85;

  // --- Node utilisation for overlays.
  const nodes: GridNode[] = [];
  for (let i = 0; i < N; i++) {
    const cap = nodeCap(gridTiles[i].structure!.kind);
    const flows = g.adj[nodeIn(i)].filter((e) => e.to === nodeOut(i) && e.orig > 0);
    const flow = flows.length ? flows[0].orig - flows[0].cap : 0;
    nodes.push({
      x: gridTiles[i].x, y: gridTiles[i].y,
      kind: gridTiles[i].structure!.kind,
      cap, flow,
      util: cap >= 1e5 ? 0 : Math.min(1, flow / cap),
      island: islandOf[i],
    });
  }

  // --- Grid stability.
  const supply = gens.reduce((a, x) => a + x.available, 0) + islands.reduce((a, x) => a + x.batteryOut, 0);
  const labLoad = gridTiles.filter((t) => t.structure!.kind === 'lab').length * 3;
  const demand = dcResults.reduce((a, x) => a + x.demand, 0) + labLoad;
  const reserve = (supply - demand) / Math.max(demand, 1);
  const avgPolicyStability = dcResults.length
    ? dcResults.reduce((a, d) => a + POLICY_INFO[d.policy as keyof typeof POLICY_INFO].stability, 0) / dcResults.length
    : 0;
  const weatherStress = state.weather.kind === 'storm' ? -6 : state.weather.kind === 'heatwave' ? -4 : 0;
  let stability = 60 + Math.max(-14, Math.min(26, reserve * 90)) + mods.stability + avgPolicyStability + weatherStress;
  if (demand > 0 && deliveredToDc / demand < 0.8) stability -= 12;
  stability = Math.max(0, Math.min(100, Math.round(stability)));

  if (stability < BAL.stabilityPenaltyBelow) {
    const penalty = 0.75 + 0.25 * (stability / BAL.stabilityPenaltyBelow);
    computeRevenue *= penalty;
    serviceRevenue *= penalty;
  }

  return {
    generation: supply,
    demand,
    delivered: deliveredToDc + labDelivered,
    surplusSold,
    surplusRevenue,
    importMW,
    importCost,
    fuelCost,
    serviceRevenue,
    serviceCapacity,
    stability,
    dc: dcResults,
    nodes,
    islands,
    curtailed: Math.max(0, supply - deliveredToDc - labDelivered - islands.reduce((a, x) => a + x.batteryIn, 0)),
  };
}

/** Default policy for a structure (player-level policy when unset). */
export function effectivePolicy(s: Structure, player: Player) {
  return s.policy ?? player.policy;
}
