# GRIDPOWER — Game Design

## 1. Vision

GRIDPOWER is a turn-based 4X strategy game in the lineage of accessible tile-strategy games, but with an original subject: the physical economics of AI compute. The player is the CEO of **Lumen Grid**, one of four infrastructure companies competing on a shared continent.

The core promise: *electricity is geographically constrained; compute is the product; transmission is the bottleneck; efficiency is the multiplier.* Every strategic decision maps onto that chain.

**Tagline:** Build the grid. Control the compute. Dominate the future.

## 2. Experience targets

- A new player understands the power → compute → credits loop within five minutes.
- A meaningful strategic choice appears by turn 3 (expand toward a resource, build generation, or build compute).
- Early turns take 30–60 seconds; midgame turns 1–2 minutes.
- A standard 18×18 game lasts 25–40 minutes and ends by victory condition or turn-40 score.
- Rival strategies are readable: yellow Helios builds renewables, red Titan floods compute, violet Volt plays storage and flexibility.

## 3. The world

18×18 tiles by default (12×12 / 24×24 options). Ten terrains:

| Terrain | Solar | Wind | Cooling (PUE delta) | Claim | Build | Role |
|---|---|---|---|---|---|---|
| Plains | ×1.00 | ×1.00 | 0 | ×1.00 | ×1.00 | Flexible workhorse |
| Forest | ×0.78 | ×1.05 | −0.02 | ×1.15 | ×1.12 | Wind/biomass, slower build |
| Desert | ×1.42 | ×0.90 | +0.15 | ×0.92 | ×0.95 | Solar gold, cooling pain |
| Mountain | ×0.72 | ×1.38 | −0.07 | ×1.30 | ×1.22 | Best wind, best cooling |
| River | ×0.85 | ×0.92 | −0.06 | ×1.25 | ×1.05 | Hydro + water cooling |
| Coast | ×1.06 | ×1.24 | −0.04 | ×1.20 | ×1.05 | Offshore wind, sea cooling |
| Geothermal | ×0.85 | ×0.95 | −0.03 | ×1.60 | ×1.15 | Geothermal plant site |
| Urban | ×1.10 | ×0.80 | +0.05 | ×1.45 | ×0.90 | Cheap build, premium claims |
| Gas basin | ×0.95 | ×1.00 | +0.02 | ×1.15 | ×0.95 | Cheap gas plants |
| Sea | — | — | — | — | — | Unbuildable, coastal cooling |

**Generation:** seeded value-noise continents (~25–35 % sea), winding rivers from high ground to the sea, coastal beaches, 3–5 geothermal vents, 2–4 urban districts, 2–4 gas basins, 2–3 neutral substations placed away from capitals.

**Fair starts:** one capital per quadrant. Each capital is a 3-tile cluster (edge data center + solar farm + substation), converted to buildable plains, with a revealed radius of 3, and guaranteed mountain and geothermal access within reach. The generator rejects starts without two buildable neighbours on retry rings, then falls back to a nearby carvable tile.

**Fog of war:** per-player exploration. Claiming reveals radius 2; capitals start with radius 3. Unexplored terrain is drawn as a dim silhouette, never as a hole, so the continent remains readable. Rival structures and cables are hidden until the tile is explored.

## 4. Resource economy

| Resource | Nature | Earned | Spent |
|---|---|---|---|
| **Credits ($)** | Stock | Compute sales, grid-service payments, surplus power | Construction, claims, upgrades, upkeep, fuel, imports |
| **Power (MW)** | Per-turn flow | Generation (weather-dependent) | Data-center draw, labs, charging |
| **Compute (CU)** | Per-turn flow | IT power × efficiency | — (sells automatically) |
| **Research (RP)** | Stock | Labs and powered data centers | Technologies |
| **Grid stability** | 0–100 state | Reserve margin, policies, tech | Under-supply, storms, heatwaves |

### Compute formula

```
facilityDemand = IT_MW × PUE × policyDemand
IT_power        = deliveredMW / PUE
compute         = IT_power × baseEfficiency × techMultiplier × policyCompute
revenue         = compute × computePrice
```

PUE = base PUE + terrain cooling + weather cooling + research PUE delta (floor 1.02).

### Power economics

```
surplus sale value = min(surplus, supply × 0.55) × powerPrice × 0.008 × connectionFactor
fuel cost          = gasOutput × fuelPrice × 0.008 × 0.85
service revenue    = IT_MW × servicePrice × 0.03 × policyService × techService
```

The `0.008`/`0.03` factors convert displayed $/MWh and $/MW into per-turn operating values. Raw electricity sales are intentionally a minor income stream: **compute is roughly four times more valuable per MW than exporting power**. This keeps the game about building data centers, not merchant generation.

### Upkeep

Every structure charges a fixed per-turn upkeep. Gas adds fuel, imports add a premium. Upkeep is the main brake on uncontrolled expansion; the economy has no debt (credits floor at 0) but low stability causes brownout losses.

## 5. Power grid model

### Graph

Nodes are grid assets on owned tiles: generators, substations, transmission lines, batteries, data centers and labs. Edges connect orthogonally adjacent assets. Assets that are not connected form separate **grid islands**.

### Capacity and dispatch

Each substation moves up to **160 MW**; each line **90 MW** (research raises both). Generators are limited by weather-adjusted output; data centers by facility demand. Dispatch runs a **Dinic max-flow** with node splitting:

```
source → generator nodes (available MW)
       → battery discharge (island decision)
node_in → node_out (throughput cap: line/substation = capacity, others = unlimited)
adjacency edges (unlimited capacity)
data center / lab / battery-charge → sink (demand)
```

Results per data center: delivered MW, utilization, compute, revenue. Per node: flow and utilization, used for congestion overlays. Per island: supply, demand, delivered, surplus, imports, battery flows.

### Batteries

Per island, before flow: if supply exceeds demand, charge up to the power rating, headroom and efficiency; if demand exceeds supply, discharge up to rating and state of charge. State of charge persists across turns (AC-equivalent MWh). Round-trip efficiency is 88 % (92 % with High-Density Batteries). Batteries therefore:
- capture otherwise-curtailed renewable power,
- cover shortfalls and improve stability,
- let flexible sites ride through events,
- earn small grid-service payments while charged (reserve capacity),
- and are worth building where transmission is constrained.

### Congestion and islands

A disconnected generator can still sell surplus, but at 32 % of market value instead of 85 %. A disconnected data center gets no power at all. Congestion appears as amber cables and saturated node rings; the tile panel shows throughput/utilisation and whether the island is anchored by a substation.

`Grid Interconnection` research permits importing up to 25 % of a data center's demand at 1.6× the power price, but only on islands with a substation.

## 6. Structures

| Structure | Cost | Upkeep | Capacity | Terrain | Notes |
|---|---|---|---|---|---|
| Solar farm | 72 | 2 | 42 MW | plains/desert/urban | ×terrain ×weather output |
| Wind park | 86 | 3 | 58 MW | plains/forest/mountain/coast | complementary profile |
| Gas turbine | 116 | 6 | 92 MW | plains/desert/basin/urban | dispatchable, fuel cost |
| Hydro station | 128 | 4 | 74 MW | river | drought-sensitive |
| Geothermal plant | 148 | 5 | 82 MW | geothermal | weather-proof baseload |
| Nuclear reactor | 300 | 11 | 220 MW | plains/coast/river | requires Advanced Nuclear |
| Substation | 58 | 2 | 160 MW throughput | any land | anchors an island |
| Transmission line | 20 | 1 | 90 MW throughput | any land | extends the network |
| Battery bank | 92 | 2 | 40 MW / 130 MWh | any land | requires High-Density Batteries |
| Edge data center | 118 | 5 | 14 MW IT | any land | PUE 1.38, 1.0 CU/MW |
| Hyperscale campus | 400 | 18 | 46 MW IT | any land | PUE 1.26, 1.15 CU/MW, needs AI Accelerators |
| AI gigafactory | 1200 | 70 | 135 MW IT | any land | PUE 1.16, 1.35 CU/MW, needs Gigafactory Design |
| Research lab | 84 | 4 | 3 MW draw | any land | +12 RP/turn |

Costs scale by terrain build multiplier (mountain ×1.22, urban ×0.90, etc.). Sub-station cost drops 20 % with Modular Substations.

### Data centers and policies

| Policy | Demand | Compute | Service | Stability |
|---|---|---|---|---|
| Maximize Compute | ×1.08 | ×1.14 | 0 | −4 |
| Maximize Profit | ×0.94 | ×0.96 | 0.35 | 0 |
| Minimize Energy Cost | ×0.82 | ×0.84 | 0.10 | +2 |
| Grid Flexible | ×0.74 | ×0.74 | 1.35 | +8 |
| Reliability First | ×0.95 | ×0.93 | 0.15 | +12 |

Policies are set per site from the tile panel and for the whole fleet from the Empire screen. The Empire screen also lists each electrical island with its supply, load and congestion status. Flexible sites earn grid-service income, which triples during a Grid Emergency market event; compute sites maximise CU but leave thinner reserves.

## 7. Markets and weather

Each turn has a power price (~$20–$70/MWh), compute price (base $2.60/CU, demand-curve adjusted), fuel price, service price, demand index and a 55 % chance of no event.

Events: AI Demand Boom, Solar Oversupply, Grid Emergency, Fuel Price Spike, Compute Glut, Sovereign AI Contract. Weather: clear, heatwave, storm, overcast, windy, cold, drought. Weather modifies solar/wind/hydro output, PUE and demand; the next turn's weather and market are shown as a forecast.

**Compute demand curve:** after each resolution the next compute price is scaled by `demandRef / (demandRef + totalWorldCompute)`, `demandRef = 900 + turn × 25`, floored at 0.28×. Building more compute therefore compresses prices, making efficiency research and market timing key. This is the main anti-runaway mechanism.

## 8. Research

18 technologies, four branches, hard prerequisites, no partial progress (you buy with accumulated RP).

**Compute:** Efficient GPUs (+12 % compute) → Advanced Cooling (−0.07 PUE) → Liquid Cooling (−0.09 PUE, +6 %) → AI Accelerators (+18 %, unlocks Hyperscale) → Gigafactory Design (+12 %, unlocks Gigafactory).

**Energy:** Improved Solar Cells (+25 % solar), Advanced Turbines (+25 % wind), High-Density Batteries (unlock, +50 % storage, +4 % efficiency), Smart Grid Dispatch (+20 % line throughput, +5 stability), Advanced Nuclear (unlock reactor).

**Optimization (AI agent branch):** GPU Power Management (+8 % compute, +15 % service) → Workload-Aware Scheduling (+10 %, −0.04 PUE) / Demand Response (+50 % service) → Adaptive Inference (+12 %, +25 % service) → Autonomous Fleet Optimization (+20 %, +40 % service). This branch is a genuine alternative strategy: it multiplies the same megawatts rather than adding capacity.

**Infrastructure:** High-Voltage Transmission (+30 % lines) → Modular Substations (+25 % substation, −20 % cost) → Grid Interconnection (imports) → Advanced Grid Operations (+8 stability, +10 % power sales).

Research is income-limited: a typical 40-turn game affords 8–16 of the 18 nodes, so choices matter.

## 9. Competitors

Three AI companies use a deterministic utility loop with personality weights:

- **Helios Energy** — renewables-first: cheaper solar/wind, profit policy, low aggression, moderate reserves.
- **Titan Compute** — compute-maximalist: builds ahead of demand, aggressively upgrades data centers, runs overclocking policies.
- **Volt Dynamics** — grid operator: prioritises batteries, flexible policy, service income and storage/grid research.

Each AI turn:
1. buys the best weighted affordable technology,
2. closes power shortfalls (or builds proactive headroom),
3. upgrades a data center when power and cash allow,
4. builds compute if headroom exists,
5. adds batteries/labs according to personality,
6. extends lines when no connected build slot exists,
7. claims new territory toward its target size.

All actions go through the same legality checks as the human player, so AI construction can never create illegal or negative-credit states (verified by tests). Rival competence scales starting capital and the number of actions per turn.

**Conflict** is economic and territorial: rival claims block yours, neutral substations are contested, compute market share is zero-sum, and high-value sites (geothermal, urban, rivers, mountains) are finite. There is no combat, by design.

## 10. Victory

1. **Compute Dominance** — ≥60 % of world compute for 3 consecutive turns.
2. **Energy Empire** — 460 MW of generation, stability ≥78 and $2,600 treasury.
3. **Technology Leadership** — Autonomous Fleet Optimization + 450 CU/turn sustained 2 turns.
4. **Score** — after turn 40, highest score (credits + 6×compute + 3×capacity + 40×techs + market share).

Progress for all paths is always visible in the left rail and the Objectives screen. The game ends immediately when a condition is met.

## 11. Onboarding

- Two contextual toasts on game start explain the loop.
- The first claim and first construction trigger further hints about territory and grid adjacency.
- The capital is preselected and its panel explains IT capacity, PUE, throughput, compute, revenue and power draw.
- Tooltips on every tile show terrain multipliers, cooling, upkeep and claim status.
- The Help screen (H) is a compact manual; the main menu embeds a short version.
- Every failed action reports a specific reason (terrain, tech, credits, adjacency, occupancy) rather than silently failing.
