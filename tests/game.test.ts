import { beforeEach, describe, expect, it } from 'vitest';
import {
  BAL, DCS, STRUCTURES, TECHNOLOGIES, WEATHERS, claimCost, createGame, endTurn, generateWorld,
  registerAIPlayer, takeAITurn, isDc, isGen, playerModifiers, pueWithWeather, evaluateVictory,
  claimTile, buildStructure, upgradeStructure, buyTech, setPolicy, scorePlayer, projectDispatch,
  dispatchPower, saveGame, loadGame, victoryProgress, canClaim, canBuild, canUpgrade, isUnlocked,
  buildOptions, claimableTiles, ownedTiles,
} from '../src/engine/index.ts';
import type { GameState, StructureKind, Tile } from '../src/engine/index.ts';
import { genOutput } from '../src/engine/grid.ts';

registerAIPlayer(takeAITurn);

const SIZE = 18;

function newGame(seed = 12345): GameState {
  return createGame({ seed, size: SIZE, maxTurns: 40, difficulty: 1 });
}

function startTile(game: GameState): Tile {
  return game.tiles.find((t) => t.owner === 0 && t.structure?.kind === 'dc_edge')!;
}

/** Replaces all structures/ownership with empty land except the given tiles. */
function clearMap(game: GameState) {
  for (const t of game.tiles) {
    t.owner = null;
    t.structure = null;
    t.terrain = 'plains';
    t.elevation = 0;
    t.explored = t.explored.map(() => true);
  }
}

function place(game: GameState, x: number, y: number, kind: StructureKind, owner = 0, terrain: Tile['terrain'] = 'plains'): Tile {
  const t = game.tiles[y * game.size + x];
  t.owner = owner;
  t.terrain = terrain;
  t.structure = { kind, policy: 'compute' };
  if (kind === 'battery') t.structure.soc = 0;
  return t;
}

beforeEach(() => {
  // Deterministic AI-independent assertions.
});

describe('deterministic RNG and world generation', () => {
  it('generates the same world for the same seed', () => {
    const a = generateWorld(777, SIZE, 4);
    const b = generateWorld(777, SIZE, 4);
    expect(JSON.stringify(a.tiles.map((t) => [t.terrain, t.x, t.y]))).toBe(JSON.stringify(b.tiles.map((t) => [t.terrain, t.x, t.y])));
    const c = generateWorld(778, SIZE, 4);
    expect(JSON.stringify(a.tiles.map((t) => t.terrain))).not.toBe(JSON.stringify(c.tiles.map((t) => t.terrain)));
  });

  it.each([12, 18, 24])('produces four fair, connected starting sites on %ix%i', (size) => {
    for (let s = 0; s < 6; s++) {
      const world = generateWorld(100 + s * 31, size, 4);
      expect(world.starts.length).toBe(4);
      for (const start of world.starts) {
        expect(start.x).toBeGreaterThanOrEqual(0);
        expect(start.y).toBeLessThan(size);
        const center = world.tiles[start.y * size + start.x];
        expect(center.terrain).not.toBe('ocean');
        // Distance between starts.
        const others = world.starts.filter((o) => o !== start);
        for (const o of others) expect(Math.hypot(o.x - start.x, o.y - start.y)).toBeGreaterThan(3);
        // Each start has land around it.
        let land = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = start.x + dx, ny = start.y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (world.tiles[ny * size + nx].terrain !== 'ocean') land++;
        }
        expect(land).toBeGreaterThan(12);
      }
    }
  });

  it('starts every player with a connected power chain', () => {
    const game = newGame();
    const me = game.players[0];
    const dispatch = projectDispatch(game, 0);
    expect(me.credits).toBe(BAL.startCredits);
    expect(dispatch.demand).toBeGreaterThan(0);
    expect(dispatch.delivered).toBeGreaterThan(dispatch.demand * 0.9);
    expect(dispatch.dc.length).toBe(1);
    expect(me.capacity).toBeGreaterThan(0);
  });
});

describe('power grid and dispatch', () => {
  it('limits data center demand by IT capacity and PUE', () => {
    const game = newGame();
    clearMap(game);
    place(game, 4, 4, 'dc_edge');
    place(game, 5, 4, 'gas');
    place(game, 4, 5, 'substation');
    const d = dispatchPower(game, 0);
    const expectedPue = pueWithWeather(game.tiles[4 * SIZE + 4], playerModifiers(game.players[0]), game.weather);
    expect(d.dc[0].pue).toBeCloseTo(expectedPue, 5);
    expect(d.dc[0].demand).toBeCloseTo(DCS.dc_edge.it * expectedPue * 1.08, 4);
    expect(d.dc[0].delivered).toBeCloseTo(d.dc[0].demand, 4);
  });

  it('does not deliver power across a disconnected island', () => {
    const game = newGame();
    clearMap(game);
    place(game, 2, 2, 'dc_edge');
    place(game, 10, 10, 'gas');
    place(game, 10, 9, 'substation');
    const d = dispatchPower(game, 0);
    expect(d.dc[0].delivered).toBe(0);
    expect(d.islands.length).toBe(2);
    expect(d.dc[0].compute).toBe(0);
  });

  it('enforces transmission capacity between generation and load', () => {
    const game = newGame();
    clearMap(game);
    // Generator -> line -> DC. Substation boosts nothing; single line is the bottleneck.
    place(game, 3, 6, 'nuclear');
    place(game, 4, 6, 'line');
    place(game, 5, 6, 'dc_giga');
    // Giga demands 135*1.16*1.08 ≈ 169 MW > 90 MW line capacity.
    const d = dispatchPower(game, 0);
    expect(d.dc[0].demand).toBeGreaterThan(BAL.lineCapacity);
    expect(d.dc[0].delivered).toBeLessThanOrEqual(BAL.lineCapacity + 0.01);
    expect(d.dc[0].utilization).toBeLessThan(0.6);
    expect(d.nodes.find((n) => n.kind === 'line')!.util).toBeGreaterThan(0.98);
    expect(d.surplusSold).toBeGreaterThan(0); // excess cannot reach the load
  });

  it('increases line throughput with high-voltage transmission', () => {
    const game = newGame();
    clearMap(game);
    place(game, 3, 6, 'nuclear');
    place(game, 4, 6, 'line');
    place(game, 5, 6, 'dc_giga');
    const before = dispatchPower(game, 0).dc[0].delivered;
    game.players[0].techs.push('hv_transmission');
    const after = dispatchPower(game, 0).dc[0].delivered;
    expect(after).toBeGreaterThan(before);
  });

  it('conserves battery energy and improves shortfall coverage', () => {
    const game = newGame();
    clearMap(game);
    place(game, 4, 6, 'solar');
    place(game, 5, 6, 'battery');
    place(game, 5, 7, 'substation');
    const battery = game.tiles[6 * SIZE + 5].structure!;
    // Force solar to be strong so the battery has surplus to store.
    game.weather = WEATHERS.clear;
    const chargeTurn = dispatchPower(game, 0);
    expect(chargeTurn.islands[0].batteryIn).toBeGreaterThan(0);
    expect(battery.soc!).toBeGreaterThan(0);
    const stored = battery.soc!;
    expect(stored).toBeLessThanOrEqual(BAL.battery.energy + 0.01);
    // Now add a DC load and dark weather: the battery should discharge.
    place(game, 4, 7, 'dc_edge');
    place(game, 4, 8, 'dc_edge');
    game.weather = WEATHERS.overcast;
    const dischargeTurn = dispatchPower(game, 0);
    const after = game.tiles[6 * SIZE + 5].structure!.soc!;
    expect(dischargeTurn.islands[0].batteryOut).toBeGreaterThan(0);
    expect(after).toBeLessThan(stored);
    expect(after).toBeGreaterThanOrEqual(-0.0001);
  });

  it('applies cooling research to PUE and compute output', () => {
    const game = newGame();
    clearMap(game);
    place(game, 4, 4, 'dc_edge', 0, 'desert');
    place(game, 5, 4, 'nuclear');
    place(game, 4, 5, 'substation');
    const before = dispatchPower(game, 0);
    game.players[0].techs.push('adv_cooling', 'liquid_cooling');
    const after = dispatchPower(game, 0);
    expect(after.dc[0].pue).toBeLessThan(before.dc[0].pue);
    expect(after.dc[0].demand).toBeLessThan(before.dc[0].demand);
    expect(after.dc[0].compute).toBeGreaterThan(before.dc[0].compute * 0.9);
  });

  it('respects generator availability under weather', () => {
    const game = newGame();
    clearMap(game);
    place(game, 3, 3, 'solar', 0, 'desert');
    const sunny = genOutput(game.tiles[3 * SIZE + 3], game.players[0], WEATHERS.clear)!;
    const storm = genOutput(game.tiles[3 * SIZE + 3], game.players[0], WEATHERS.storm)!;
    expect(sunny.available).toBeGreaterThan(storm.available);
    expect(sunny.available).toBeLessThanOrEqual(STRUCTURES.solar.capacity * 1.15);
  });

  it('imports only with grid interconnection and pays a premium', () => {
    const game = newGame();
    clearMap(game);
    place(game, 5, 5, 'dc_giga');
    place(game, 6, 5, 'substation');
    game.players[0].credits = 10000;
    const without = dispatchPower(game, 0);
    expect(without.importMW).toBe(0);
    game.players[0].techs.push('grid_interconnection');
    const withTech = dispatchPower(game, 0);
    expect(withTech.importMW).toBeGreaterThan(0);
    expect(withTech.importCost).toBeGreaterThan(0);
    expect(withTech.importMW).toBeLessThanOrEqual(withTech.dc[0].demand * playerModifiers(game.players[0]).importFraction + 0.01);
  });
});

describe('territory and construction', () => {
  it('claims only adjacent land at escalating cost', () => {
    const game = newGame();
    const before = ownedTiles(game, 0).length;
    const options = claimableTiles(game, 0);
    expect(options.length).toBeGreaterThan(0);
    const target = options[0];
    const cost1 = claimCost(game, 0, target);
    expect(canClaim(game, 0, target.x, target.y).ok).toBe(true);
    expect(claimTile(game, 0, target.x, target.y)).toBe(true);
    expect(ownedTiles(game, 0).length).toBe(before + 1);
    const target2 = claimableTiles(game, 0).find((t) => t.owner === null)!;
    expect(claimCost(game, 0, target2)).toBeGreaterThan(cost1);
  });

  it('rejects claims that do not border territory, water, and rival land', () => {
    const game = newGame();
    const far = game.tiles.find((t) => t.owner === null && t.terrain === 'plains' && claimableTiles(game, 0).every((c) => c.x !== t.x || c.y !== t.y))!;
    expect(canClaim(game, 0, far.x, far.y).ok).toBe(false);
    const ocean = game.tiles.find((t) => t.terrain === 'ocean')!;
    expect(canClaim(game, 0, ocean.x, ocean.y).ok).toBe(false);
    const rivalStart = game.tiles.find((t) => t.owner === 1)!;
    expect(canClaim(game, 0, rivalStart.x, rivalStart.y).ok).toBe(false);
  });

  it('enforces terrain restrictions and technology gates on construction', () => {
    const game = newGame();
    clearMap(game);
    place(game, 6, 6, 'substation');
    game.tiles[7 * SIZE + 6].owner = 0;
    game.players[0].credits = 5000;
    expect(canBuild(game, 0, 6, 7, 'hydro').ok).toBe(false);
    expect(canBuild(game, 0, 6, 7, 'geothermal').ok).toBe(false);
    // Nuclear needs research.
    expect(isUnlocked(game, 0, 'nuclear')).toBe(false);
    expect(canBuild(game, 0, 6, 7, 'nuclear').ok).toBe(false);
    game.players[0].techs.push('adv_nuclear');
    expect(canBuild(game, 0, 6, 7, 'nuclear').ok).toBe(true);
  });

  it('charges construction costs and blocks duplicate structures', () => {
    const game = newGame();
    clearMap(game);
    const empty = place(game, 8, 8, 'substation');
    empty.structure = null;
    empty.terrain = 'plains';
    const credits = game.players[0].credits;
    const option = buildOptions(game, 0, empty).find((o) => o.kind === 'solar')!;
    expect(buildStructure(game, 0, empty.x, empty.y, 'solar')).toBe(true);
    expect(game.players[0].credits).toBe(credits - option.cost);
    expect(canBuild(game, 0, empty.x, empty.y, 'wind').ok).toBe(false);
  });

  it('upgrades data centers through tiers with real stat changes', () => {
    const game = newGame();
    clearMap(game);
    const t = place(game, 5, 5, 'dc_edge');
    t.owner = 0;
    game.tiles[5 * SIZE + 4].owner = 0;
    game.tiles[5 * SIZE + 4].structure = { kind: 'nuclear', policy: 'compute' };
    game.tiles[5 * SIZE + 4].terrain = 'plains';
    game.players[0].credits = 5000;
    game.players[0].techs.push('ai_accelerators');
    expect(canUpgrade(game, 0, t).ok).toBe(true);
    const before = DCS.dc_edge.it;
    expect(upgradeStructure(game, 0, 5, 5)).toBe(true);
    expect(t.structure!.kind).toBe('dc_hyper');
    expect(DCS.dc_hyper.it).toBeGreaterThan(before);
    const d = dispatchPower(game, 0);
    expect(d.dc[0].kind).toBe('dc_hyper');
  });
});

describe('research and policies', () => {
  it('enforces prerequisites and research point costs', () => {
    const game = newGame();
    game.players[0].research = 10;
    expect(buyTech(game, 0, 'efficient_gpus')).toBe(false);
    game.players[0].research = 500;
    expect(buyTech(game, 0, 'efficient_gpus')).toBe(true);
    expect(buyTech(game, 0, 'efficient_gpus')).toBe(false);
    expect(buyTech(game, 0, 'liquid_cooling')).toBe(false); // missing adv_cooling
    expect(buyTech(game, 0, 'adv_cooling')).toBe(true);
    expect(buyTech(game, 0, 'liquid_cooling')).toBe(true);
    expect(game.players[0].research).toBeLessThan(500);
    expect(playerModifiers(game.players[0]).compute).toBeGreaterThan(1.1);
  });

  it('unlocks structures through research', () => {
    const game = newGame();
    game.players[0].research = 5000;
    for (const id of ['batteries_hd', 'gpu_power_mgmt', 'workload_sched', 'adaptive_inference', 'demand_response', 'autonomy']) {
      buyTech(game, 0, id);
    }
    expect(game.players[0].techs).toContain('autonomy');
    expect(isUnlocked(game, 0, 'battery')).toBe(true);
  });

  it('changes dispatch behaviour by operating policy', () => {
    const game = newGame();
    const tile = startTile(game);
    setPolicy(game, 0, 'compute', tile.x, tile.y);
    const aggressive = dispatchPower(game, 0);
    const stable = game.tiles.map((t) => ({ ...t, structure: t.structure ? { ...t.structure } : null }));
    game.tiles = stable;
    setPolicy(game, 0, 'flexible', tile.x, tile.y);
    const flexible = dispatchPower(game, 0);
    expect(flexible.dc[0].demand).toBeLessThan(aggressive.dc[0].demand);
    expect(flexible.dc[0].compute).toBeLessThan(aggressive.dc[0].compute);
    expect(flexible.serviceRevenue).toBeGreaterThanOrEqual(aggressive.serviceRevenue);
  });
});

describe('turn resolution and economy', () => {
  it('resolves a turn and advances weather and markets deterministically', () => {
    const a = newGame(4242);
    const b = newGame(4242);
    const ra = endTurn(a);
    const rb = endTurn(b);
    expect(ra.turn).toBe(1);
    expect(rb.turn).toBe(1);
    expect(a.turn).toBe(2);
    expect(JSON.stringify(a.market)).toBe(JSON.stringify(b.market));
    expect(a.weather.kind).toBe(b.weather.kind);
    expect(a.players.map((p) => p.credits)).toEqual(b.players.map((p) => p.credits));
    expect(Number.isFinite(a.players[0].credits)).toBe(true);
    expect(a.players[0].credits).toBeGreaterThanOrEqual(0);
    expect(a.players[0].history.length).toBe(1);
  });

  it('keeps the same result for identical actions across runs', () => {
    const play = () => {
      const game = newGame(909);
      const options = claimableTiles(game, 0);
      claimTile(game, 0, options[0].x, options[0].y);
      const empty = ownedTiles(game, 0).find((t) => !t.structure)!;
      empty.terrain = 'plains';
      buildStructure(game, 0, empty.x, empty.y, 'wind');
      for (let i = 0; i < 3; i++) endTurn(game);
      return game;
    };
    const g1 = play();
    const g2 = play();
    expect(g1.players.map((p) => [p.credits, p.compute, p.research])).toEqual(g2.players.map((p) => [p.credits, p.compute, p.research]));
    expect(g1.tiles.map((t) => [t.owner, t.structure?.kind ?? null])).toEqual(g2.tiles.map((t) => [t.owner, t.structure?.kind ?? null]));
  });

  it('pays compute revenue and charges upkeep', () => {
    const game = newGame();
    const start = game.players[0].credits;
    const dc = startTile(game);
    const before = projectDispatch(game, 0);
    endTurn(game);
    const stat = game.players[0].history[0];
    expect(stat.compute).toBeGreaterThan(0);
    expect(stat.revenue).toBeGreaterThan(0);
    expect(stat.opex).toBeGreaterThan(0);
    expect(game.players[0].credits).toBeCloseTo(start + stat.net, 0);
    void dc;
    void before;
  });

  it('charges fuel for gas generation', () => {
    const game = newGame();
    clearMap(game);
    place(game, 4, 4, 'gas');
    place(game, 5, 4, 'dc_edge');
    place(game, 4, 5, 'substation');
    const d = dispatchPower(game, 0);
    expect(d.fuelCost).toBeGreaterThan(0);
  });

  it('applies a compute demand curve as world compute grows', () => {
    const game = newGame();
    clearMap(game);
    place(game, 4, 4, 'nuclear');
    place(game, 5, 4, 'dc_giga');
    place(game, 4, 5, 'substation');
    place(game, 5, 5, 'dc_giga');
    place(game, 4, 6, 'substation');
    place(game, 6, 4, 'nuclear');
    // Fill every player with a huge compute fleet to saturate the world market.
    for (let p = 1; p < 4; p++) {
      for (let i = 0; i < 4; i++) {
        place(game, 8 + i * 2, 2 + p, 'dc_giga', p);
        place(game, 9 + i * 2, 2 + p, 'nuclear', p);
      }
    }
    game.players.forEach((p) => { p.credits = 500; });
    const priceBefore = game.market.computePrice;
    for (let i = 0; i < 2 && game.phase === 'player'; i++) endTurn(game);
    const priced = game.players[1].history.at(-1)!.compute;
    expect(priced).toBeGreaterThan(0);
    expect(game.market.computePrice).toBeLessThan(priceBefore);
  });
});

describe('AI opponents', () => {
  it('take legal actions and never overspend', () => {
    for (const seed of [11, 222, 3333, 44444]) {
      const game = newGame(seed);
      for (let turn = 0; turn < 12; turn++) {
        for (let p = 1; p < 4; p++) {
          const creditsBefore = game.players[p].credits;
          const actions = takeAITurn(game, p);
          expect(game.players[p].credits).toBeLessThanOrEqual(creditsBefore + 0.001);
          for (const a of actions) {
            if (a.type === 'build') {
              const tile = game.tiles[a.y * game.size + a.x];
              expect(tile.owner).toBe(p);
              expect(tile.structure?.kind).toBe(a.kind);
            }
            if (a.type === 'claim') {
              expect(game.tiles[a.y * game.size + a.x].owner).toBe(p);
            }
          }
        }
        endTurn(game);
      }
      const ai = game.players.slice(1);
      expect(ai.every((p) => p.history.length === 12)).toBe(true);
      expect(ai.every((p) => p.credits >= 0)).toBe(true);
      expect(ai.some((p) => p.techs.length > 0)).toBe(true);
      expect(ai.some((p) => p.capacity > 0)).toBe(true);
    }
  });

  it('expands territory and builds data centers over a match', () => {
    const game = newGame(2024);
    for (let i = 0; i < 20; i++) endTurn(game);
    for (const p of game.players.slice(1)) {
      expect(ownedTiles(game, p.id).length).toBeGreaterThan(5);
      expect(ownedTiles(game, p.id).filter((t) => t.structure && isDc(t.structure.kind)).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('victory conditions', () => {
  it('declares compute dominance after a sustained share', () => {
    const game = newGame();
    game.players[0].compute = 1000;
    game.players[1].compute = 10;
    game.players[2].compute = 10;
    game.players[3].compute = 10;
    game.players[0].dominanceStreak = BAL.dominanceTurns - 1;
    for (let i = 0; i < 1; i++) {
      // Evaluated inside endTurn after recomputing shares; simulate by direct evaluation.
      game.players[0].dominanceStreak = BAL.dominanceTurns;
    }
    const v = evaluateVictory(game);
    expect(v.winner).toBe(0);
    expect(v.condition).toBe('compute');
  });

  it('declares energy empire and technology leadership', () => {
    const game = newGame();
    const me = game.players[0];
    me.capacity = BAL.energyCapacity;
    me.stability = BAL.energyStability;
    me.credits = BAL.energyCredits;
    expect(evaluateVictory(game).condition).toBe('energy');
    me.capacity = 0;
    me.techs.push('autonomy');
    me.efficientStreak = BAL.techComputeTurns;
    me.compute = BAL.techComputeTarget;
    const v = evaluateVictory(game);
    expect(v.condition).toBe('tech');
    expect(v.winner).toBe(0);
  });

  it('ends a match on score at the turn limit', () => {
    const game = createGame({ seed: 5, size: 12, maxTurns: 3, difficulty: 1 });
    game.players[0].credits = 5000;
    for (let i = 0; i < 3; i++) endTurn(game);
    expect(game.phase).toBe('gameover');
    expect(game.victory.winner).not.toBeNull();
    expect(['score', 'compute', 'energy', 'tech']).toContain(game.victory.condition);
    expect(scorePlayer(game.players[game.victory.winner!])).toBeGreaterThan(0);
  });

  it('reports victory progress for the UI', () => {
    const game = newGame();
    const vp = victoryProgress(game, 0);
    expect(vp.compute.progress).toBeGreaterThanOrEqual(0);
    expect(vp.energy.progress).toBeGreaterThanOrEqual(0);
    expect(vp.tech.progress).toBeGreaterThanOrEqual(0);
    expect(vp.score).toBeGreaterThan(0);
  });
});

describe('save / load', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    } as Storage;
  });

  it('round-trips a game through localStorage', () => {
    const game = newGame(31);
    claimTile(game, 0, claimableTiles(game, 0)[0].x, claimableTiles(game, 0)[0].y);
    endTurn(game);
    saveGame(game, 'test');
    const loaded = loadGame('test')!;
    expect(loaded.players[0].credits).toBe(game.players[0].credits);
    expect(loaded.turn).toBe(game.turn);
    expect(loaded.tiles.map((t) => [t.owner, t.structure?.kind ?? null])).toEqual(game.tiles.map((t) => [t.owner, t.structure?.kind ?? null]));
    // The loaded state must continue to resolve identically.
    const a = JSON.parse(JSON.stringify(game)) as GameState;
    const b = JSON.parse(JSON.stringify(loaded)) as GameState;
    registerAIPlayer(takeAITurn);
    endTurn(a);
    endTurn(b);
    expect(a.players.map((p) => p.credits)).toEqual(b.players.map((p) => p.credits));
  });

  it('rejects corrupt saves', () => {
    globalThis.localStorage.setItem('gridpower.slot.bad', '{oops');
    expect(loadGame('bad')).toBeNull();
  });
});

describe('full headless matches', () => {
  it('finish without errors and keep invariants', () => {
    for (const seed of [1000, 8919, 16838]) {
      const game = createGame({ seed, size: 18, maxTurns: 40, difficulty: 1 });
      game.players.forEach((p) => { p.isAI = true; p.personality = p.personality === 'human' ? 'titan' : p.personality; });
      let guard = 0;
      while (game.phase !== 'gameover' && guard++ < 45) endTurn(game);
      expect(game.phase).toBe('gameover');
      expect(game.victory.winner).not.toBeNull();
      for (const p of game.players) {
        expect(Number.isFinite(p.credits)).toBe(true);
        expect(p.credits).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(p.compute)).toBe(true);
        expect(p.history.length).toBeGreaterThan(0);
        expect(p.techs.length).toBeGreaterThan(0);
      }
      const structuresPlaced = game.tiles.filter((t) => t.structure && t.owner !== null).length;
      expect(structuresPlaced).toBeGreaterThan(10);
    }
  }, 30000);

  it('resolves AI turns quickly', () => {
    const game = newGame(77);
    for (let i = 0; i < 15; i++) endTurn(game);
    const t0 = performance.now();
    for (let p = 1; p < 4; p++) takeAITurn(game, p);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(300);
  });
});

// Guards against test-only misuse of unused imports.
void TERRAIN_PLACEHOLDER;
function TERRAIN_PLACEHOLDER() { return WEATHERS; }
void TECHNOLOGIES;
void isGen;
void STRUCTURES;
