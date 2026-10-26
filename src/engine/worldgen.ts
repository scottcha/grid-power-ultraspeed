import { fbm, makeRng, type Rng } from './rng.ts';
import type { Terrain, Tile } from './types.ts';

export interface WorldStart {
  x: number;
  y: number;
  dc: { x: number; y: number };
  gen: { x: number; y: number };
  sub: { x: number; y: number };
}

export interface World {
  tiles: Tile[];
  starts: WorldStart[];
  seed: number;
  size: number;
}

const idx = (size: number, x: number, y: number) => y * size + x;

function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function terrainElevation(t: Terrain): number {
  switch (t) {
    case 'mountain': return 3;
    case 'forest': return 1;
    case 'geothermal': return 1;
    case 'urban': return 1;
    case 'basin': return 0;
    default: return t === 'ocean' ? 0 : 0;
  }
}

export function generateWorld(seed: number, size: number, playerCount = 4): World {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const tiles: Tile[] = [];
  const oceanMask = new Array<boolean>(size * size).fill(false);
  const half = (size - 1) / 2;
  const idxOf = (x: number, y: number) => y * size + x;

  // --- 1. Coherent landmass: continental core with an irregular coast.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - half) / half;
      const ny = (y - half) / half;
      const d = Math.sqrt(nx * nx + ny * ny) * 0.7 + Math.max(Math.abs(nx), Math.abs(ny)) * 0.36;
      const n = fbm(x * 0.17 + 11, y * 0.17 + 7, seed, 4);
      const detail = fbm(x * 0.34 + 41, y * 0.34 + 29, seed + 3, 2);
      let landScore = n * 0.78 + detail * 0.12 + (1 - d) * 0.65;
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (edge === 0) landScore -= 0.5;
      oceanMask[idxOf(x, y)] = landScore < 0.38;
    }
  }
  for (let i = 0; i < size; i++) {
    oceanMask[idxOf(i, 0)] = true;
    oceanMask[idxOf(i, size - 1)] = true;
    oceanMask[idxOf(0, i)] = true;
    oceanMask[idxOf(size - 1, i)] = true;
  }

  // --- 2. Climate bands + noise.
  const terrain = new Array<Terrain>(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idxOf(x, y);
      if (oceanMask[i]) { terrain[i] = 'ocean'; continue; }
      const e = fbm(x * 0.15 + 31, y * 0.15 + 17, seed + 5, 3);
      const dry = fbm(x * 0.12 + 71, y * 0.12 + 53, seed + 13, 3) + (x / size) * 0.14;
      const wet = fbm(x * 0.14 + 101, y * 0.14 + 83, seed + 29, 3);
      if (e > 0.64) terrain[i] = 'mountain';
      else if (dry > 0.60) terrain[i] = 'desert';
      else if (wet > 0.55) terrain[i] = 'forest';
      else terrain[i] = 'plains';
    }
  }

  // --- 3. Rivers: descend from a random high point along falling elevation.
  const riverSources: number[] = [];
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const i = idxOf(x, y);
      if (terrain[i] === 'mountain') riverSources.push(i);
    }
  }
  let riversMade = 0;
  const riverTargets = Math.max(2, Math.round(size / 7));
  const shuffled = [...riverSources].sort((a, b) => hash01(a + seed) - hash01(b + seed));
  for (const src of shuffled) {
    if (riversMade >= riverTargets) break;
    let cx = src % size;
    let cy = Math.floor(src / size);
    const placed: number[] = [];
    for (let step = 0; step < 16; step++) {
      const ci = idxOf(cx, cy);
      if (step > 0) {
        if (oceanMask[ci]) break;
        if (terrain[ci] === 'plains' || terrain[ci] === 'forest' || terrain[ci] === 'desert') {
          terrain[ci] = 'river';
          placed.push(ci);
        }
        if (placed.length >= 2 && terrain[ci] === 'coast') break;
      }
      let bestX = cx;
      let bestY = cy;
      let bestE = Infinity;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = idxOf(nx, ny);
        if (oceanMask[ni]) {
          // Prefer to terminate at the sea.
          bestX = nx; bestY = ny; bestE = -1;
          break;
        }
        const h = fbm(nx * 0.15 + 31, ny * 0.15 + 17, seed + 5, 3) + rng.next() * 0.015;
        if (h < bestE) { bestE = h; bestX = nx; bestY = ny; }
      }
      if (bestX === cx && bestY === cy) break;
      cx = bestX; cy = bestY;
      if (oceanMask[idxOf(cx, cy)]) break;
    }
    if (placed.length >= 2) riversMade++;
  }

  // Guarantee a few waterways even when no mountain descent succeeds.
  let fallbackGuard = 0;
  while (riversMade < riverTargets && fallbackGuard++ < 40) {
    const seedTile = landTilesFallback(terrain, size);
    if (seedTile < 0) break;
    let cx = seedTile % size;
    let cy = Math.floor(seedTile / size);
    let placedTiles = 0;
    for (let step = 0; step < 5; step++) {
      const ci = idxOf(cx, cy);
      if (oceanMask[ci]) break;
      if (terrain[ci] === 'plains' || terrain[ci] === 'forest' || terrain[ci] === 'desert') {
        terrain[ci] = 'river';
        placedTiles++;
      }
      // Move one step toward the nearest sea tile.
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let y2 = 0; y2 < size; y2++) for (let x2 = 0; x2 < size; x2++) {
        if (!oceanMask[idxOf(x2, y2)]) continue;
        const dd = Math.hypot(x2 - cx, y2 - cy);
        if (dd < bestD) { bestD = dd; best = [x2, y2]; }
      }
      if (!best) break;
      const stepX = Math.sign(best[0] - cx);
      const stepY = Math.sign(best[1] - cy);
      if (stepX !== 0) cx += stepX; else if (stepY !== 0) cy += stepY;
    }
    if (placedTiles >= 2) riversMade++;
  }

  // --- 4. Coast: low land beside water.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idxOf(x, y);
      if (terrain[i] === 'ocean' || terrain[i] === 'mountain' || terrain[i] === 'river') continue;
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < size && ny < size && oceanMask[idxOf(nx, ny)];
      });
      if (nearWater && rng.chance(0.66)) terrain[i] = 'coast';
    }
  }

  // --- 5. Special features: geothermal vents, urban districts, gas basins.
  const landTiles: number[] = [];
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] !== 'ocean' && terrain[i] !== 'river') landTiles.push(i);
  }
  const placeSpread = (count: number, test: (i: number) => boolean, apply: (i: number) => void) => {
    const chosen: number[] = [];
    let guard = 0;
    while (chosen.length < count && guard++ < 900) {
      const i = landTiles[Math.floor(rng.next() * landTiles.length)];
      if (!test(i)) continue;
      const x = i % size;
      const y = Math.floor(i / size);
      if (chosen.some((c) => Math.hypot((c % size) - x, Math.floor(c / size) - y) < 2.5)) continue;
      chosen.push(i);
      apply(i);
    }
    return chosen;
  };
  placeSpread(Math.max(3, Math.round(size / 5)), (i) => terrain[i] === 'mountain' || terrain[i] === 'plains' || terrain[i] === 'desert' || terrain[i] === 'forest',
    (i) => { terrain[i] = 'geothermal'; });
  placeSpread(Math.max(2, Math.round(size / 8)), (i) => terrain[i] === 'plains' || terrain[i] === 'desert' || terrain[i] === 'coast',
    (i) => { terrain[i] = 'urban'; });
  placeSpread(Math.max(2, Math.round(size / 7)), (i) => terrain[i] === 'plains' || terrain[i] === 'desert' || terrain[i] === 'forest',
    (i) => { terrain[i] = 'basin'; });

  // --- 6. Starts: one per quadrant, with guaranteed buildable surroundings.
  const anchors = [
    { x: Math.floor(size * 0.26), y: Math.floor(size * 0.28) },
    { x: Math.floor(size * 0.74), y: Math.floor(size * 0.26) },
    { x: Math.floor(size * 0.25), y: Math.floor(size * 0.74) },
    { x: Math.floor(size * 0.75), y: Math.floor(size * 0.72) },
  ];
  const starts: WorldStart[] = [];
  for (let p = 0; p < playerCount; p++) {
    const anchor = anchors[p % anchors.length];
    let spot: WorldStart | null = null;
    for (let radius = 0; radius <= 5 && !spot; radius++) {
      const candidates: { x: number; y: number; score: number }[] = [];
      for (let y = anchor.y - radius; y <= anchor.y + radius; y++) {
        for (let x = anchor.x - radius; x <= anchor.x + radius; x++) {
          if (x < 3 || y < 3 || x >= size - 3 || y >= size - 3) continue;
          if (Math.abs(x - anchor.x) !== radius && Math.abs(y - anchor.y) !== radius) continue;
          const t = terrain[idxOf(x, y)];
          if (t === 'ocean' || t === 'mountain' || t === 'geothermal') continue;
          if (starts.some((s) => Math.hypot(s.x - x, s.y - y) < 4.5)) continue;
          if (!startBuildable(terrain, size, x, y)) continue;
          let open = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            if (terrain[idxOf(nx, ny)] !== 'ocean') open++;
          }
          candidates.push({ x, y, score: open + rng.next() });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      for (const c of candidates) {
        const carved = carveStart(terrain, size, c.x, c.y, rng);
        if (carved) { spot = carved; break; }
      }
    }
    if (!spot) {
      // Deterministic fallback: nearest land tile that can be carved.
      for (let i = 0; i < terrain.length && !spot; i++) {
        const x = i % size, y = Math.floor(i / size);
        if (starts.some((s) => Math.hypot(s.x - x, s.y - y) < 3.5)) continue;
        spot = carveStart(terrain, size, x, y, rng);
      }
    }
    if (spot) starts.push(spot);
  }

  // Guarantee each start can reach a geothermal vent and a mountain.
  for (const s of starts) {
    const has = (want: Terrain, rad: number) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (terrain[idxOf(x, y)] === want && Math.hypot(x - s.x, y - s.y) <= rad) return true;
      }
      return false;
    };
    if (!has('geothermal', 5.5)) {
      const near = freeNear(terrain, size, s.x, s.y, 4.2, (t) => t === 'plains' || t === 'desert' || t === 'forest' || t === 'coast');
      if (near >= 0) terrain[near] = 'geothermal';
    }
    if (!has('mountain', 4.5)) {
      const near = freeNear(terrain, size, s.x, s.y, 3.4, (t) => t === 'forest' || t === 'plains' || t === 'desert');
      if (near >= 0) terrain[near] = 'mountain';
    }
  }

  // --- 7. Materialise tiles with per-player fog.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = terrain[idxOf(x, y)];
      tiles.push({
        x, y, terrain: t,
        elevation: terrainElevation(t),
        owner: null,
        structure: null,
        explored: new Array(playerCount).fill(false),
        variant: Math.floor(rng.next() * 1e6),
      });
    }
  }

  return { tiles, starts, seed, size };
}

/** Picks a random land tile that is not already water for river fallback carving. */
function landTilesFallback(terrain: Terrain[], size: number): number {
  const options: number[] = [];
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const i = y * size + x;
      if (terrain[i] === 'plains' || terrain[i] === 'forest' || terrain[i] === 'desert') options.push(i);
    }
  }
  if (!options.length) return -1;
  return options[Math.floor(hash01(options.length + terrain.length) * options.length)];
}

/** A start needs an empty centre plus one generator and one substation neighbour. */
function startBuildable(terrain: Terrain[], size: number, x: number, y: number): boolean {
  let gens = 0;
  let subs = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    const t = terrain[ny * size + nx];
    if (t === 'plains' || t === 'desert' || t === 'forest') gens++;
    if (t !== 'ocean') subs++;
  }
  return gens >= 1 && subs >= 2;
}

/** Finds a land tile in a ring around (cx,cy) matching a terrain test. */
function freeNear(terrain: Terrain[], size: number, cx: number, cy: number, radius: number, test: (t: Terrain) => boolean): number {
  const hits: { i: number; d: number }[] = [];
  for (let y = Math.max(0, cy - Math.ceil(radius)); y <= Math.min(size - 1, cy + Math.ceil(radius)); y++) {
    for (let x = Math.max(0, cx - Math.ceil(radius)); x <= Math.min(size - 1, cx + Math.ceil(radius)); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < 2.4 || d > radius) continue;
      const i = y * size + x;
      if (test(terrain[i])) hits.push({ i, d });
    }
  }
  hits.sort((a, b) => a.d - b.d);
  return hits.length ? hits[0].i : -1;
}

function carveStart(terrain: Terrain[], size: number, x: number, y: number, rng: Rng): WorldStart | null {
  const at = (dx: number, dy: number) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return -1;
    return idx(size, nx, ny);
  };
  const center = at(0, 0);
  if (center < 0) return null;
  const centerT = terrain[center];
  if (centerT === 'ocean' || centerT === 'mountain' || centerT === 'geothermal') return null;

  // Choose a generator neighbour on buildable terrain and a substation neighbour.
  const options: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let gen: { x: number; y: number } | null = null;
  let sub: { x: number; y: number } | null = null;
  for (const [dx, dy] of options) {
    const i = at(dx, dy);
    if (i < 0) continue;
    const t = terrain[i];
    if (!gen && (t === 'plains' || t === 'desert' || t === 'forest')) gen = { x: x + dx, y: y + dy };
    else if (!sub && (t === 'plains' || t === 'urban' || t === 'coast' || t === 'basin' || t === 'desert')) sub = { x: x + dx, y: y + dy };
  }
  if (!gen || !sub) return null;

  // Clear the start cluster to fertile, buildable ground.
  if (terrain[center] !== 'urban') terrain[center] = 'plains';
  terrain[idx(size, gen.x, gen.y)] = 'plains';
  terrain[idx(size, sub.x, sub.y)] = 'plains';

  // Make sure at least a couple of neighbours offer expansion.
  const ring: [number, number][] = [...options, [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const [dx, dy] of ring) {
    const i = at(dx, dy);
    if (i >= 0 && terrain[i] === 'ocean') terrain[i] = rng.chance(0.5) ? 'coast' : 'plains';
  }

  return { x, y, dc: { x, y }, gen: { x: gen.x, y: gen.y }, sub: { x: sub.x, y: sub.y } };
}

export function tileAt(tiles: Tile[], size: number, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= size || y >= size) return undefined;
  return tiles[idx(size, x, y)];
}

export const neighbors4 = (x: number, y: number): [number, number][] => [
  [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
];
