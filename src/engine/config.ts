import type {
  DcKind,
  GenKind,
  Market,
  Policy,
  ResearchNode,
  StructureKind,
  Terrain,
  Weather,
  WeatherKind,
} from './types.ts';

/** Central balance table. All economy tuning lives here. */
export const BAL = {
  startCredits: 260,
  startResearch: 0,
  startClaimRadius: 1,
  claimBaseCost: 15,
  claimCostGrowth: 2.2,
  claimCostPerTile: 1.2,
  maxTurns: 40,
  scorePerCredit: 1,
  scorePerCompute: 6,
  scorePerCapacity: 3,
  scorePerTech: 40,
  dominanceShare: 0.6,
  dominanceTurns: 3,
  energyCapacity: 460,
  energyStability: 78,
  energyCredits: 2600,
  techComputeTarget: 450,
  techComputeTurns: 2,
  stabilityPenaltyBelow: 45,
  researchPerLab: 12,
  dcResearch: { dc_edge: 4, dc_hyper: 9, dc_giga: 16 } as Record<DcKind, number>,
  battery: { power: 40, energy: 130, eff: 0.88 },
  lineCapacity: 90,
  substationCapacity: 160,
  gridConnectionFactor: 0.85,
  islandedSellFactor: 0.32,
  marketBasePower: 44,
  marketBaseCompute: 2.6,
  marketBaseFuel: 19,
  marketBaseService: 8,
  powerRevenueScale: 0.008,
  serviceRevenueScale: 0.03,
  exportCapFraction: 0.55,
  aiBudgetReserve: 40,
  outageThreshold: 38,
} as const;

export interface StructureDef {
  kind: StructureKind;
  name: string;
  short: string;
  category: 'gen' | 'grid' | 'dc' | 'storage' | 'lab';
  cost: number;
  upkeep: number;
  capacity: number; // MW nameplate for generators
  terrain: Terrain[] | null; // buildable terrain; null = everywhere land
  requires: string | null;
  blurb: string;
  stats: string;
  gen?: GenKind;
  dc?: DcKind;
}

export const STRUCTURES: Record<StructureKind, StructureDef> = {
  solar: {
    kind: 'solar', name: 'Solar Farm', short: 'S', category: 'gen', cost: 72, upkeep: 2, capacity: 42,
    terrain: ['plains', 'desert', 'urban'], requires: null, gen: 'solar',
    blurb: 'Cheap daytime power. Output collapses under cloud and at night.',
    stats: '42 MW · weather-driven · low upkeep',
  },
  wind: {
    kind: 'wind', name: 'Wind Park', short: 'W', category: 'gen', cost: 86, upkeep: 3, capacity: 58,
    terrain: ['plains', 'forest', 'mountain', 'coast'], requires: null, gen: 'wind',
    blurb: 'Strong on ridges and coasts. Complements solar after dark.',
    stats: '58 MW · variable · no fuel',
  },
  gas: {
    kind: 'gas', name: 'Gas Turbine', short: 'G', category: 'gen', cost: 116, upkeep: 6, capacity: 92,
    terrain: ['plains', 'desert', 'basin', 'urban'], requires: null, gen: 'gas',
    blurb: 'Dispatchable on demand, but every MWh burns expensive fuel.',
    stats: '92 MW · reliable · fuel cost',
  },
  hydro: {
    kind: 'hydro', name: 'Hydro Station', short: 'H', category: 'gen', cost: 128, upkeep: 4, capacity: 74,
    terrain: ['river'], requires: null, gen: 'hydro',
    blurb: 'Steady baseload on rivers. Drought cuts output.',
    stats: '74 MW · steady · river only',
  },
  geothermal: {
    kind: 'geothermal', name: 'Geothermal Plant', short: 'T', category: 'gen', cost: 148, upkeep: 5, capacity: 82,
    terrain: ['geothermal'], requires: null, gen: 'geothermal',
    blurb: 'Reliable, weather-proof baseload. Rare vents decide the map.',
    stats: '82 MW · always on · vent only',
  },
  nuclear: {
    kind: 'nuclear', name: 'Nuclear Reactor', short: 'N', category: 'gen', cost: 300, upkeep: 11, capacity: 220,
    terrain: ['plains', 'coast', 'river'], requires: 'adv_nuclear', gen: 'nuclear',
    blurb: 'Massive stable output. Needs research and a deep treasury.',
    stats: '220 MW · baseload · costly',
  },
  substation: {
    kind: 'substation', name: 'Substation', short: 'U', category: 'grid', cost: 58, upkeep: 2, capacity: 160,
    terrain: null, requires: null,
    blurb: 'Anchors a grid island and moves up to 160 MW between assets.',
    stats: '160 MW throughput · grid anchor',
  },
  line: {
    kind: 'line', name: 'Transmission Line', short: 'L', category: 'grid', cost: 20, upkeep: 1, capacity: 90,
    terrain: null, requires: null,
    blurb: 'Bridges the gap between generation and compute. Capacity is limited.',
    stats: '90 MW throughput · links neighbours',
  },
  battery: {
    kind: 'battery', name: 'Battery Bank', short: 'B', category: 'storage', cost: 92, upkeep: 2, capacity: 0,
    terrain: null, requires: 'batteries_hd',
    blurb: 'Stores surplus power, discharges into shortfalls, earns grid-service fees.',
    stats: '40 MW power · 130 MWh · 88% round-trip',
  },
  dc_edge: {
    kind: 'dc_edge', name: 'Edge Data Center', short: 'E', category: 'dc', cost: 118, upkeep: 5, capacity: 0,
    terrain: null, requires: null, dc: 'dc_edge',
    blurb: 'Small, quick to deploy. Converts power into inference compute.',
    stats: '14 MW IT · PUE 1.38 · 1.0 CU/MW',
  },
  dc_hyper: {
    kind: 'dc_hyper', name: 'Hyperscale Campus', short: 'H', category: 'dc', cost: 400, upkeep: 18, capacity: 0,
    terrain: null, requires: 'ai_accelerators', dc: 'dc_hyper',
    blurb: 'Industrial-scale compute. Demands serious transmission.',
    stats: '46 MW IT · PUE 1.26 · 1.15 CU/MW',
  },
  dc_giga: {
    kind: 'dc_giga', name: 'AI Gigafactory', short: 'F', category: 'dc', cost: 1200, upkeep: 70, capacity: 0,
    terrain: null, requires: 'gigafactory', dc: 'dc_giga',
    blurb: 'A city-scale AI factory. The endgame engine of any compute empire.',
    stats: '135 MW IT · PUE 1.16 · 1.35 CU/MW',
  },
  lab: {
    kind: 'lab', name: 'Research Lab', short: 'R', category: 'lab', cost: 84, upkeep: 4, capacity: 0,
    terrain: null, requires: null,
    blurb: 'Turns a small amount of power into a steady research stream.',
    stats: '+11 RP/turn · 3 MW draw',
  },
};

export const BUILD_ORDER: StructureKind[] = [
  'dc_edge', 'dc_hyper', 'dc_giga',
  'solar', 'wind', 'gas', 'hydro', 'geothermal', 'nuclear',
  'substation', 'line', 'battery', 'lab',
];

export interface DcDef {
  kind: DcKind;
  name: string;
  it: number; // MW installed IT
  pue: number;
  eff: number; // CU per MW IT
  upgradeTo: DcKind | null;
  upgradeCost: number;
}

export const DCS: Record<DcKind, DcDef> = {
  dc_edge: { kind: 'dc_edge', name: 'Edge Data Center', it: 14, pue: 1.38, eff: 1.0, upgradeTo: 'dc_hyper', upgradeCost: 190 },
  dc_hyper: { kind: 'dc_hyper', name: 'Hyperscale Campus', it: 46, pue: 1.26, eff: 1.15, upgradeTo: 'dc_giga', upgradeCost: 620 },
  dc_giga: { kind: 'dc_giga', name: 'AI Gigafactory', it: 135, pue: 1.16, eff: 1.35, upgradeTo: null, upgradeCost: 0 },
};

export const POLICY_INFO: Record<Policy, { name: string; blurb: string; demand: number; compute: number; service: number; stability: number }> = {
  compute: { name: 'Maximize Compute', blurb: 'Overclock racks: more output, more draw, less headroom.', demand: 1.08, compute: 1.14, service: 0, stability: -4 },
  profit: { name: 'Maximize Profit', blurb: 'Trim draw slightly and sell the headroom.', demand: 0.94, compute: 0.96, service: 0.35, stability: 0 },
  energy: { name: 'Minimize Energy Cost', blurb: 'Underclock for efficiency; leave surplus for the market.', demand: 0.82, compute: 0.84, service: 0.1, stability: 2 },
  flexible: { name: 'Grid Flexible', blurb: 'Curtail on demand for grid-service payments.', demand: 0.74, compute: 0.74, service: 1.35, stability: 8 },
  reliability: { name: 'Reliability First', blurb: 'Reserve capacity to protect stability and uptime.', demand: 0.95, compute: 0.93, service: 0.15, stability: 12 },
};

export const TERRAIN_INFO: Record<Terrain, {
  name: string;
  blurb: string;
  solar: number;
  wind: number;
  cooling: number; // PUE delta
  claim: number; // claim cost multiplier
  build: number; // construction cost multiplier
  color: string;
  high: string;
  side: string;
}> = {
  ocean: { name: 'Sea', blurb: 'Unbuildable water. Cooling asset for coastal sites.', solar: 0, wind: 0, cooling: 0, claim: 0, build: 1, color: '#145570', high: '#1c6c8c', side: '#0b3a4f' },
  plains: { name: 'Plains', blurb: 'Cheap construction, decent solar. The workhorse tile.', solar: 1.0, wind: 1.0, cooling: 0, claim: 1, build: 1, color: '#5f9d54', high: '#74b064', side: '#3e7040' },
  forest: { name: 'Forest', blurb: 'Biomass and wind potential; slower, costlier construction.', solar: 0.78, wind: 1.05, cooling: -0.02, claim: 1.15, build: 1.12, color: '#356b46', high: '#417e52', side: '#234a32' },
  desert: { name: 'Desert', blurb: 'Excellent solar; brutal cooling penalties for data centers.', solar: 1.42, wind: 0.9, cooling: 0.15, claim: 0.9, build: 0.95, color: '#d8b26a', high: '#e7c887', side: '#a8843f' },
  mountain: { name: 'Mountain', blurb: 'Best wind and cooling, but transmission is expensive.', solar: 0.72, wind: 1.38, cooling: -0.07, claim: 1.3, build: 1.22, color: '#7c7f88', high: '#93969f', side: '#565860' },
  river: { name: 'River', blurb: 'Hydro power and free water cooling.', solar: 0.85, wind: 0.92, cooling: -0.06, claim: 1.25, build: 1.05, color: '#4f8a5a', high: '#5f9d66', side: '#326b42' },
  coast: { name: 'Coast', blurb: 'Offshore wind and seawater cooling; exposed to storms.', solar: 1.06, wind: 1.24, cooling: -0.04, claim: 1.2, build: 1.05, color: '#c9c07a', high: '#dbd28d', side: '#9d9658' },
  geothermal: { name: 'Geothermal Field', blurb: 'Vented heat: the only place geothermal plants can be built.', solar: 0.85, wind: 0.95, cooling: -0.03, claim: 1.6, build: 1.15, color: '#8a6a55', high: '#a07d63', side: '#5f4839' },
  urban: { name: 'Urban District', blurb: 'Strong demand and cheap connections; prime compute land.', solar: 1.1, wind: 0.8, cooling: 0.05, claim: 1.45, build: 0.9, color: '#9a9086', high: '#b0a598', side: '#6d655d' },
  basin: { name: 'Gas Basin', blurb: 'Cheap fuel and gas construction; otherwise unremarkable.', solar: 0.95, wind: 1.0, cooling: 0.02, claim: 1.15, build: 0.95, color: '#a68a5c', high: '#bd9f6d', side: '#7b633e' },
};

export const WEATHERS: Record<WeatherKind, Weather> = {
  clear: { kind: 'clear', name: 'Clear Skies', solar: 1.1, wind: 1.0, cooling: 0, hydro: 1.0, demand: 1.0, blurb: 'Calm weather. Solar performs above nameplate.' },
  heatwave: { kind: 'heatwave', name: 'Heatwave', solar: 1.15, wind: 0.8, cooling: 0.16, hydro: 0.88, demand: 1.1, blurb: 'Cooling costs spike and AC demand strains the grid.' },
  storm: { kind: 'storm', name: 'Storm Front', solar: 0.55, wind: 1.3, cooling: -0.02, hydro: 1.15, demand: 0.98, blurb: 'Solar collapses, wind surges, lines lose headroom.' },
  overcast: { kind: 'overcast', name: 'Overcast', solar: 0.5, wind: 0.95, cooling: -0.04, hydro: 1.02, demand: 1.0, blurb: 'Dense cloud. Cheap power hours for gas and storage.' },
  windy: { kind: 'windy', name: 'Gale Winds', solar: 1.0, wind: 1.55, cooling: -0.05, hydro: 1.05, demand: 0.99, blurb: 'Wind parks run hot; negative prices are common.' },
  cold: { kind: 'cold', name: 'Cold Snap', solar: 0.92, wind: 1.05, cooling: -0.1, hydro: 0.95, demand: 1.06, blurb: 'Best cooling weather. Data centers love it.' },
  drought: { kind: 'drought', name: 'Drought', solar: 1.2, wind: 0.9, cooling: 0.06, hydro: 0.55, demand: 1.0, blurb: 'Hydro reservoirs shrink; solar peaks.' },
};

export const MARKET_EVENTS: Market['event'][] = [
  null,
  null,
  null,
  { id: 'ai-boom', name: 'AI Demand Boom', blurb: 'Enterprise inference contracts surge — compute sells at a premium.', powerPriceMul: 1.05, computePriceMul: 1.5, servicePriceMul: 1.0, demandMul: 1.15 },
  { id: 'solar-glut', name: 'Solar Oversupply', blurb: 'Midday renewable flooding: power is nearly free, storage pays.', powerPriceMul: 0.45, computePriceMul: 1.0, servicePriceMul: 1.4, demandMul: 1.0 },
  { id: 'grid-emergency', name: 'Grid Emergency', blurb: 'Reserve margin collapsed. Flexibility pays triple.', powerPriceMul: 2.3, computePriceMul: 0.92, servicePriceMul: 3.2, demandMul: 0.95 },
  { id: 'fuel-spike', name: 'Fuel Price Spike', blurb: 'Gas is expensive. Renewables and storage shine.', powerPriceMul: 1.5, computePriceMul: 1.0, servicePriceMul: 1.2, demandMul: 1.0 },
  { id: 'compute-glut', name: 'Compute Glut', blurb: 'Rivals dumped capacity; compute margins compress.', powerPriceMul: 0.95, computePriceMul: 0.68, servicePriceMul: 1.0, demandMul: 0.9 },
  { id: 'contract', name: 'Sovereign AI Contract', blurb: 'A national lab needs compute — and will pay for reliability.', powerPriceMul: 1.1, computePriceMul: 1.35, servicePriceMul: 1.6, demandMul: 1.2 },
];

export const TECHNOLOGIES: ResearchNode[] = [
  { id: 'efficient_gpus', name: 'Efficient GPU Clusters', branch: 'compute', cost: 60, requires: [], blurb: 'Better perf-per-watt silicon across the fleet.', effect: '+12% compute per MW' },
  { id: 'adv_cooling', name: 'Advanced Cooling', branch: 'compute', cost: 90, requires: ['efficient_gpus'], blurb: 'Rear-door heat exchangers and free cooling.', effect: '-0.07 PUE on every data center' },
  { id: 'liquid_cooling', name: 'Liquid Cooling', branch: 'compute', cost: 150, requires: ['adv_cooling'], blurb: 'Direct-to-chip loops wash away waste heat.', effect: '-0.09 PUE, +6% compute' },
  { id: 'ai_accelerators', name: 'AI Accelerators', branch: 'compute', cost: 240, requires: ['liquid_cooling'], blurb: 'Next-gen tensor engines; unlocks hyperscale campuses.', effect: '+18% compute, unlocks Hyperscale' },
  { id: 'gigafactory', name: 'Gigafactory Design', branch: 'compute', cost: 340, requires: ['ai_accelerators'], blurb: 'Standardized gigawatt-class AI factory blueprints.', effect: '+12% compute, unlocks AI Gigafactory' },

  { id: 'solar_boost', name: 'Improved Solar Cells', branch: 'energy', cost: 50, requires: [], blurb: 'Tandem perovskite cells raise yield per panel.', effect: '+25% solar output' },
  { id: 'wind_boost', name: 'Advanced Turbines', branch: 'energy', cost: 70, requires: [], blurb: 'Longer blades, taller towers, better low-wind capture.', effect: '+25% wind output' },
  { id: 'batteries_hd', name: 'High-Density Batteries', branch: 'energy', cost: 110, requires: [], blurb: 'Grid-scale LFP packs. Unlocks battery banks.', effect: 'Unlocks batteries, +50% capacity, +4% eff', unlocks: ['battery'] },
  { id: 'smart_grid', name: 'Smart Grid Dispatch', branch: 'energy', cost: 170, requires: ['batteries_hd'], blurb: 'Automated congestion management across the island.', effect: '+20% line throughput, +5 stability' },
  { id: 'adv_nuclear', name: 'Advanced Nuclear', branch: 'energy', cost: 300, requires: ['smart_grid'], blurb: 'Small modular reactors with passive safety.', effect: 'Unlocks Nuclear Reactor', unlocks: ['nuclear'] },

  { id: 'gpu_power_mgmt', name: 'GPU Power Management', branch: 'optimization', cost: 55, requires: [], blurb: 'Cap and steer each accelerator\'s power envelope.', effect: '+8% compute, +15% grid-service income' },
  { id: 'workload_sched', name: 'Workload-Aware Scheduling', branch: 'optimization', cost: 100, requires: ['gpu_power_mgmt'], blurb: 'Shift batch training into cheap, cool hours.', effect: '+10% compute, -0.04 PUE' },
  { id: 'demand_response', name: 'Demand Response', branch: 'optimization', cost: 140, requires: ['gpu_power_mgmt'], blurb: 'Sell curtailment into system-reserve markets.', effect: '+50% grid-service income' },
  { id: 'adaptive_inference', name: 'Adaptive Inference', branch: 'optimization', cost: 190, requires: ['workload_sched'], blurb: 'Batch size and precision self-tune to conditions.', effect: '+12% compute, +25% service income' },
  { id: 'autonomy', name: 'Autonomous Fleet Optimization', branch: 'optimization', cost: 330, requires: ['adaptive_inference', 'demand_response'], blurb: 'The AI runs its own power plant. The ultimate optimization.', effect: '+20% compute, +40% service income' },

  { id: 'hv_transmission', name: 'High-Voltage Transmission', branch: 'infrastructure', cost: 90, requires: [], blurb: 'Higher voltage lines carry more power per span.', effect: '+30% transmission line capacity' },
  { id: 'modular_substations', name: 'Modular Substations', branch: 'infrastructure', cost: 130, requires: ['hv_transmission'], blurb: 'Prefabricated switchyards deploy faster and cheaper.', effect: '+25% substation capacity, -20% substation cost' },
  { id: 'grid_interconnection', name: 'Grid Interconnection', branch: 'infrastructure', cost: 200, requires: ['modular_substations'], blurb: 'Tie into the regional grid to import scarce power.', effect: 'Imports up to 25% of island shortfall at 1.6× price' },
  { id: 'adv_grid_ops', name: 'Advanced Grid Operations', branch: 'infrastructure', cost: 280, requires: ['grid_interconnection'], blurb: 'Forecasting and reserve orchestration at fleet scale.', effect: '+8 stability, +10% power sales' },
];

export const TECH_BRANCH_COLORS: Record<ResearchNode['branch'], string> = {
  compute: '#6ee7ff',
  energy: '#ffd166',
  optimization: '#b388ff',
  infrastructure: '#7ef0a7',
};
