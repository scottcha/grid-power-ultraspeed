# GRIDPOWER — Balance Report

All numbers come from `src/engine/config.ts` and headless matches produced by `scripts/simulate.ts`. The league replaces the human seat with the same AI (Titan personality) so all four companies are driven by the utility AI, standard map 18×18, 40-turn limit, difficulty 1.0, seeds 1000 + i·7919.

## 1. Core parameters

| Parameter | Value |
|---|---|
| Starting credits / research | $260 / 0 RP |
| Starting assets | Edge data center + solar farm + substation (3 tiles) |
| Starting reveal radius | 3 tiles |
| Claim cost | `(15 + 3.4 × claimsBought) × terrain × neutralPremium` |
| Max turns | 40 |
| Market base compute price | $2.60 / CU (demand-curve adjusted) |
| Market base power price | $44 / MWh (near-zero export factor) |
| Market base fuel price | $19 / MWh |
| Market base grid-service price | $8 / MW |
| Export conversion factor | 0.008 per MWh → ~$0.35/MW-turn |
| Service conversion factor | 0.03 per MW → ~$0.24/MW-turn |
| Battery reserve service | 35% of the service conversion while charged |
| Surplus export cap | 55 % of island supply |
| Grid value factor | 0.85 connected / 0.32 islanded |
| Stability base | 60 + reserve term − weather/policy, clamped 0–100 |
| Low-stability penalty | below 45: revenue ×0.75–1.00, brownout chance |
| Line / substation throughput | 90 / 160 MW |
| Battery | 40 MW, 130 MWh, 88 % round-trip |
| Compute demand curve | `demandRef/(demandRef + totalCompute)`, ref = 900 + 25·turn, floor 0.28 |

## 2. Data-center economics

Formula: facility demand = IT × PUE × policy demand; compute = delivered/PUE × base eff × tech × policy; revenue = compute × price.

At base compute price ($2.60) and neutral policies:

| Tier | Cost | IT MW | PUE | CU/MW IT | Demand MW | Gross CU | Gross revenue | Upkeep | Simple payback* |
|---|---|---|---|---|---|---|---|---|---|
| Edge | 118 | 14 | 1.38 | 1.00 | 20.9 | 14.0 | $36 | 5 | ~3.8 turns |
| Hyperscale | 400 | 46 | 1.26 | 1.15 | 62.6 | 52.9 | $138 | 18 | ~3.4 turns |
| Gigafactory | 1200 | 135 | 1.16 | 1.35 | 169.1 | 182.3 | $474 | 70 | ~3.0 turns |

\*Ignoring the generation that must feed the facility. A solar farm (72) supplies roughly one edge DC in clear weather; the combined 190 cost pays back in ~6 turns at base prices. Efficiency techs shorten this; the demand curve and weather lengthen it.

### Generation economics (at base prices, before compute conversion)

| Plant | Cost | Upkeep | Effective MW (typical) | Export value/turn | Note |
|---|---|---|---|---|---|
| Solar | 72 | 2 | 17–60 (terrain/weather) | ~$6–20 | best on desert |
| Wind | 86 | 3 | 25–80 | ~$8–26 | best on mountain/coast |
| Gas | 116 | 6 | 88 | ~$30 minus ~$19 fuel | dispatchable |
| Hydro | 128 | 4 | 68 | ~$22 | drought risk |
| Geothermal | 148 | 5 | 78 | ~$26 | weather-proof |
| Nuclear | 300 | 11 | 216 | ~$72 | needs research |

Raw exports are deliberately worth far less than compute. One MW sold earns ~$0.35/turn; one MW of IT capacity earns ~$1.90 of compute revenue at base price. Players are pushed toward data centers and efficiency rather than merchant generation.

### Claim escalation

With the starting 3 claims, the first expansion costs ~$25 on plains. The tenth claim costs ~$49, the twentieth ~$83. Terrain multipliers (geothermal ×1.55, urban ×1.40, mountain ×1.30) and the +$55 neutral-substation premium create contested chokepoints without hard expansion caps.

## 3. Headless league results

Eight complete AI-only matches, 18×18, 40 turns:

| Seed | End | Winner | Condition | Compute share % (P0/P1/P2/P3) | Credits (k) | Capacity MW | Techs |
|---|---|---|---|---|---|---|---|
| 1000 | T37 | Lumen Grid | Energy | 33/20/33/14 | 7.8/4.3/6.2/2.9 | 488/384/506/376 | 14/13/13/13 |
| 8919 | T40 | Lumen Grid | Tech | 41/7/47/5 | 8.9/3.5/13.5/3.2 | 900/366/1196/332 | 16/13/17/14 |
| 16838 | T32 | Titan Compute | Energy | 44/15/31/10 | 6.0/3.3/7.5/2.2 | 492/368/534/316 | 12/11/13/11 |
| 24757 | T31 | Lumen Grid | Energy | 39/14/35/13 | 4.8/1.8/4.2/1.6 | 510/360/440/282 | 12/9/11/10 |
| 32676 | T28 | Lumen Grid | Energy | 34/21/34/12 | 4.6/2.7/4.0/0.6 | 460/326/424/234 | 10/9/10/8 |
| 40595 | T33 | Titan Compute | Energy | 35/17/37/11 | 6.5/3.0/6.8/2.2 | 476/368/508/308 | 13/11/13/11 |
| 48514 | T34 | Lumen Grid | Energy | 29/15/47/9 | 6.3/3.7/6.8/2.3 | 526/376/618/310 | 13/12/13/11 |
| 56433 | T33 | Lumen Grid | Energy | 31/19/38/12 | 2.8/3.3/5.8/2.0 | 474/416/458/310 | 10/11/12/11 |

Aggregates:

- **Match length:** 28–40 turns, mean 33.5. Median resolution time 0.05 s headless.
- **Winners:** Lumen (Titan heuristic) 5, Titan Compute 3, Helios 0, Volt 0.
- **Victory types:** Energy 7, Technology 1. No score or compute-dominance finishes in AI-only play.
- **Techs researched:** 8–17 of 18; the tree is not fully affordable in a normal match, as intended.
- **Capacity:** 234–1,196 MW; the 1,196 MW outlier is the tech-victory match that overbuilt.
- **Compute share:** 29–47 % for the leader. 60 % is rarely reached when four companies are alive and all build compute — dominance is a deliberate, hard path rather than the default.
- **Treasuries:** $0.6k–13.5k at the end. Cash accumulates once an AI exhausts its territory/action targets; it is a known AI-side inefficiency, not an economic loop (see §5).

### Invariants checked in every match

- No NaN/Infinity in credits, compute, capacity or stability.
- No negative treasury.
- Every player resolves at least one turn of history, builds structures and researches tech.
- AI actions are legal (tile owned, structure present, no duplicate build, costs paid).
- Total structures > 10; matches always reach a game-over state.

## 4. Tuning history

| Iteration | Observation | Change |
|---|---|---|
| v0.1 | Treasuries hit $78k by turn 40; energy victory at ~turn 10 | Surplus exports were worth hundreds per turn. Introduced power/service conversion factors, export caps. |
| v0.2 | AI built only 1–2 data centers and 100–400 MW | AI required a 14 MW power surplus before building; it never produced headroom. Added proactive generation, lowered DC headroom threshold, added grid-extension lines. |
| v0.3 | Compute prices were static, so revenue compounded without limit | Added the world-compute demand curve to the next-turn price. |
| v0.4 | Matches ended around turn 45 with $8k hoards; data centers paid back in ~1 turn | Raised DC costs/efficiencies, lowered compute base price, introduced PUE/cooling and policy demand multipliers. |
| v0.5 | Only ~2–7 techs per game | Raised data-center/lab RP, reduced tech costs to 50–340. |
| v0.6 | Energy victory in 7/8 matches at T28–37; market events every turn | Reduced event frequency (55 % no event), energy threshold set to 460 MW / $2,600 / 78 stability. |
| v1.0 | Stable 28–40 turn games, 8–17 techs, all victory paths implemented | Final values in `config.ts`. |

## 5. Known balance observations and limitations

1. **Compute dominance is rare in AI-vs-AI.** Four viable companies split the market; a 60 % share needs deliberate overbuilding and efficiency stacking by a human. The condition and streak logic are implemented and tested; the AI league simply never concentrates enough. A human player can pursue it.
2. **AI treasuries accumulate late.** Once the AI hits its claim target and has built all affordable compute/generation, it leaves the rest in cash. A human player can convert that into gigafactories, batteries and score, so this is not a health issue for the player experience, but it makes final scores credit-heavy. The score weights compute and capacity above cash per unit, yet credits still dominate raw score by volume.
3. **Compute prices compress sharply in long games.** By turn 35 the demand curve can cut prices by ~60 %, which rewards efficiency research and punishes late capacity rushes. This is intentional, but it makes the last 5 turns less lucrative for a pure-expansion strategy.
4. **Start fairness is structural, not perfect.** Each capital gets a 3-tile power chain and guaranteed nearby mountain + geothermal, but terrain quality (desert vs forest, river access, coast) still varies. The league shows no single start-seed runaway, but a weaker capital can cost a few turns of tempo.
5. **Energy victory is the default AI finish.** Because the condition only requires stockpiles and capacity (not compute share), it fires before the 40-turn score check in most AI matches. Human games that focus compute or tech will see different endings; the tech path is reachable by turn 40 in the league.
6. **Transmission is a real constraint.** The max-flow solver frequently binds on lines and substations in dense fleets; AI line counts grow with turn. This is the intended source of the "should I build a line or a battery?" decision.
7. **Difficulty** scales AI starting credits and actions per turn, not its strategic depth. Frontier AI simply acts more per turn.

## 6. Validation commands

```bash
npm test                                  # 36 tests
npm run sim                               # 8 complete matches
node scripts/simulate.ts seeds=20          # wider sweep
node scripts/e2e.mjs                      # browser interactions + screenshots
```

The league is the fastest balance probe: change `config.ts`, rerun, and compare winners, end turns, tech counts and shares.
