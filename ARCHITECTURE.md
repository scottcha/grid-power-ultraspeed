# GRIDPOWER — Architecture

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite 7 + TypeScript (strict) | Fast dev loop, tiny production bundle, no backend |
| UI | React 19 | Declarative HUD/modals; complex panels without canvas UI |
| State | Zustand 5 | Minimal store, direct engine calls, no boilerplate |
| World rendering | Canvas 2D, custom isometric painter | Full art control, procedural visuals, no asset pipeline |
| Audio | WebAudio oscillators | Zero assets, offline, generated ambience/SFX |
| Tests | Vitest | Fast Node-side simulation tests + browser E2E via Playwright |
| Persistence | `localStorage` | Offline save/load, no account |

No runtime network calls, external services, paid APIs, or remote assets. Everything is generated at runtime.

## 2. Module map

```
src/engine/          ← pure simulation, no DOM imports
  types.ts           Domain vocabulary: Terrain, Structure, Tile, Player, GameState, TurnReport, ...
  config.ts          Single balance table: BAL + STRUCTURES + DCS + TECHNOLOGIES + WEATHERS + MARKET_EVENTS + TERRAIN_INFO
  rng.ts             mulberry32 PRNG + value noise / fBm
  worldgen.ts        generateWorld(seed, size, players) → tiles + fair starts
  grid.ts            playerModifiers, genOutput, pueWithWeather, dispatchPower (islands + batteries + Dinic max-flow)
  simulation.ts      createGame, legality, actions, endTurn, victory, score, projectDispatch
  ai.ts              takeAITurn, connectionSlots, bestGenerator/bestClaim/bestResearch
  save.ts            saveGame/loadGame/listSaves with schema version
  index.ts           public surface

src/render/
  renderer.ts        IsoRenderer: camera, input, tile painter, art, cables, weather, overlays
  palette.ts         player accents, UI palette, terrain re-exports

src/state/store.ts   Zustand store: screen, game, preview, selection, hover, overlay, modal, toasts
src/ui/              React components (TopBar, TilePanel, LeftRail, RightRail, Minimap, Modals, GameView, MainMenu)
src/audio/audio.ts   AudioContext graph, ambience, SFX, mute
src/styles.css       Design system (dark glass panels, responsive layout)
tests/game.test.ts   Vitest suite
scripts/             simulate.ts (league), e2e.mjs (browser assertions), screenshot.mjs (deliverable shots)
```

**Dependency rule:** engine → nothing; renderer → engine types/config; UI → store + engine queries; store → engine. Rendering never mutates simulation state.

## 3. Authoritative state

`GameState` is a single serialisable object:

```ts
{
  version, seed, rngState, turn, maxTurns, size, difficulty,
  tiles: Tile[],              // terrain, elevation, owner, structure, explored[player], variant
  players: Player[],          // credits, research, techs, policy, stability, history[], streaks
  weather, forecast,
  market, nextMarket,
  log: LogEntry[],
  phase: 'player' | 'resolve' | 'gameover',
  victory, summary, lastResolvedTurn
}
```

Everything the simulation needs is inside. The store keeps one reference and replaces it (`{...game}`) after actions so React re-renders; the engine mutates the object in place for speed and simplicity. `projectDispatch` performs a structural clone before running dispatch so UI previews never mutate battery state.

### Determinism

- World generation uses `mulberry32` seeded by the world seed.
- All event/market/weather randomness draws from `state.rngState` via `advanceRng`, so a restored save continues identically.
- The AI has no `Math.random` dependency; ties are broken by insertion order.
- `endTurn` is the only place that advances the RNG and resolves the world.
- Tests assert identical credit/compute/research sequences for identical seeds and actions, including after a save/load.

## 4. Turn pipeline (`endTurn`)

```
phase = 'resolve'
for each AI player:         takeAITurn(state, id)        // build/claim/research/policy
for each player:            dispatchPower(state, id)     // snapshot results
for each player:
    revenue  = Σ dcRevenue + serviceRevenue + surplusRevenue
    opex     = Σ upkeep + fuel + importCost
    credits += revenue - opex
    research += labs + powered DC research
    capacity, compute, stability, history updated
    low-stability brownout roll (state RNG)
shares + dominance/efficiency streaks computed
market: next compute price follows the demand curve
turn += 1
weather = forecast; forecast = roll; market = nextMarket; nextMarket = roll
log entry for the new day
victory check → phase 'gameover' if won
else phase 'player'
fog revealed radius 2 around all owned tiles
build TurnReport for the human player
```

AI actions happen before dispatch so their construction counts in the same turn. All companies are then resolved against the same weather and market snapshot.

**Why this order:** it keeps turns simultaneous and fair (no first-mover dispatch advantage), makes rival spending visible immediately, and keeps resolution deterministic regardless of which player ended the turn.

## 5. Power flow

`dispatchPower(state, playerId)`:

1. Collect owned tiles with grid structures; build a 4-neighbour adjacency index.
2. Connected components = **grid islands** (BFS).
3. Compute supply (`genOutput` × terrain × weather × research), DC demand (`IT × PUE × policy`), lab load.
4. Battery decisions per island (charge from surplus, discharge into deficit), mutating SOC and recording island flows.
5. Build a **Dinic max-flow** network with node capacities:
   - split each asset into in/out nodes with capacity (line 90×research, substation 160×research, others ∞),
   - source → generators (available MW) and discharging batteries,
   - DC/lab/charging → sink (demand).
6. Solve. Read per-edge flows to recover per-DC delivery, per-node utilisation, generator usage.
7. Optional grid imports (Grid Interconnection) fill part of any remaining shortfall on anchored islands at 1.6× price.
8. Convert delivered MW to compute and revenue; add data-center and battery reserve service income; apply policy and stability penalties.
9. Sell island surplus at the market price (capped at 55 % of island supply; 85 % value if anchored, 32 % if islanded).
10. Return a rich `DispatchResult` used by the economy, the HUD and the overlays.

The graph is tiny (≤ 324 tiles), so max-flow is effectively free and runs every frame only through `projectDispatch` on state changes (not on every animation frame). The preview is cached in the store.

## 6. Rendering

`IsoRenderer` paints at device-pixel ratio with a 2:1 isometric projection (104×52 px tiles, 9 px elevation steps).

- **Camera:** pan by drag, zoom 0.42–2.1 with cursor anchoring, keyboard pan, smooth focus requests from the minimap.
- **Painter's order:** tiles sorted by `x+y` then `x`; tall structures are occluded correctly by nearer tiles.
- **Terrain:** gradient diamonds with per-tile variant textures (grass tufts, pine clusters, dunes, snow-capped rock, urban windows, gas wells, geothermal cracks) plus connected river ribbons.
- **Structures:** procedural isometric boxes and details — solar arrays with glints, rotating turbines, gas plant with steam/flare, hydro reservoir, nuclear cooling towers, geothermal vents, substation pylon/transformers, battery racks with SOC LEDs, three data-center silhouettes, lab dome with blinking antenna.
- **Power network:** sagging dual cables with a dark sheath, player-coloured energised core, glow for the human player, congestion amber, and animated flow dots.
- **Fog:** dim terrain silhouettes + soft cloud puffs; rival structures and cables are not drawn.
- **Weather:** screen-space rain, snow, wind streaks, heat shimmer, cloud bands and tinting.
- **Overlays:** power (node rings + cables), compute (utilization bars), territory (stronger ownership), economy (terrain-value tint).
- **Selection / ghost:** pulsing diamond, hover outline, translucent building ghost on hovered build cards.

HUD, panels and modals are React with CSS variables and no external UI kit. Layout is responsive: side rails hide under 1180 px; modal grids collapse under 900 px.

## 7. UI state & data flow

```
user click / key
   → store action
      → engine function (mutates GameState)
      → saveGame('auto')
      → set({ game: {...game}, preview: projectDispatch(game, 0) })
         → React re-renders HUD/panels
         → renderer reads store via bridge every frame
```

The renderer receives a `RendererBridge` with getters and callbacks, avoiding React re-renders for continuous input except when the hovered tile changes. The minimap redraws from state; clicking it requests a camera focus.

## 8. Persistence

`save.ts` stores `{meta, state}` under `gridpower.slot.<id>`. Autosave (`auto`) runs after every mutation and at turn end; manual slots are created from the pause menu. `version` gates loading; corrupt JSON returns `null` rather than throwing. Save/load round-trips are covered by tests, including deterministic continuation.

## 9. Testing strategy

- **Unit:** RNG/world reproducibility and start fairness across sizes; generation limits by weather; PUE and cooling; disconnected islands; transmission bottleneck; research line capacity; battery conservation; imports; claim legality and escalating cost; terrain/tech construction gates; upgrade tiers; policy dispatch differences; fuel; demand curve.
- **Integration:** deterministic turn resolution across two identical games; save/load and continuation; AI action legality and budgets over 12 turns; victory conditions; score victory; complete AI-only 40-turn matches.
- **Browser:** Playwright drives real clicks for selection, claiming, building, modals, end turn and save, asserting DOM text and store state, and failing on console errors.
- **Headless league:** `scripts/simulate.ts` runs complete AI matches and reports turns, winners, shares, credits, capacity and tech counts, used for balance.

## 10. Extending

- Add a structure: extend `StructureKind`, add `STRUCTURES` (and `DCS` for data centers), a build branch in `renderer.drawStructure`, and any special dispatch rule.
- Add a technology: append to `TECHNOLOGIES`, consume the id in `playerModifiers`/`isUnlocked`.
- Add an event/weather: append to `MARKET_EVENTS` / `WEATHERS`; no code changes needed in the pipeline.
- Add a victory: extend `evaluateVictory` and `victoryProgress`.
- Tune balance: edit `src/engine/config.ts` only; tests and AI use it automatically.
