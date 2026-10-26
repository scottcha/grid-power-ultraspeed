/** Core domain types for GRIDPOWER. Single authoritative simulation state lives here. */

export type Terrain =
  | 'ocean'
  | 'plains'
  | 'forest'
  | 'desert'
  | 'mountain'
  | 'river'
  | 'coast'
  | 'geothermal'
  | 'urban'
  | 'basin';

export type GenKind = 'solar' | 'wind' | 'gas' | 'hydro' | 'nuclear' | 'geothermal';
export type GridKind = 'substation' | 'line';
export type DcKind = 'dc_edge' | 'dc_hyper' | 'dc_giga';
export type StructureKind = GenKind | GridKind | DcKind | 'battery' | 'lab';

export type Policy = 'compute' | 'profit' | 'energy' | 'flexible' | 'reliability';

export type WeatherKind = 'clear' | 'heatwave' | 'storm' | 'overcast' | 'windy' | 'cold' | 'drought';

export interface Weather {
  kind: WeatherKind;
  name: string;
  solar: number; // multiplier on solar output
  wind: number; // multiplier on wind output
  cooling: number; // added to PUE (positive = hotter/less efficient)
  hydro: number; // multiplier on hydro output (drought)
  demand: number; // multiplier on compute demand
  blurb: string;
}

export interface Market {
  powerPrice: number; // $/MWh
  computePrice: number; // $/CU
  fuelPrice: number; // $/MWh for gas
  computeDemand: number; // global demand index
  servicePrice: number; // $/MW of flexible capacity
  event: MarketEvent | null;
}

export interface MarketEvent {
  id: string;
  name: string;
  blurb: string;
  powerPriceMul: number;
  computePriceMul: number;
  servicePriceMul: number;
  demandMul: number;
}

export interface Structure {
  kind: StructureKind;
  policy: Policy; // for data centers
  soc?: number; // battery state of charge, in MWh
  level?: number; // data center upgrade level (1..3)
}

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  elevation: number; // 0..3 visual height steps
  owner: number | null; // player id
  structure: Structure | null;
  explored: boolean[]; // per player
  variant: number; // visual variation seed
}

export interface ResearchNode {
  id: string;
  name: string;
  branch: 'compute' | 'energy' | 'optimization' | 'infrastructure';
  cost: number;
  requires: string[];
  blurb: string;
  effect: string;
  unlocks?: StructureKind[];
}

export interface LogEntry {
  turn: number;
  kind: 'info' | 'good' | 'bad' | 'rival' | 'market' | 'milestone';
  text: string;
  player?: number;
}

export interface TurnStats {
  turn: number;
  generation: number; // MWh available
  demand: number; // MWh requested
  delivered: number; // MWh delivered to loads
  compute: number; // CU
  revenue: number;
  opex: number;
  research: number;
  stability: number;
  net: number;
  credits: number;
  dcCount: number;
  capacity: number;
}

export interface Player {
  id: number;
  name: string;
  company: string;
  color: string;
  isAI: boolean;
  personality: 'helios' | 'titan' | 'volt' | 'human';
  credits: number;
  research: number;
  researchSpent: number;
  techs: string[];
  policy: Policy;
  stability: number;
  compute: number; // last turn compute
  computeShare: number;
  capacity: number; // MW nameplate
  history: TurnStats[];
  dominanceStreak: number;
  efficientStreak: number;
  claimsBought: number;
  alive: boolean;
}

export interface VictoryState {
  winner: number | null;
  condition: 'compute' | 'energy' | 'tech' | 'score' | null;
  title: string;
  detail: string;
}

export type Phase = 'player' | 'resolve' | 'gameover';

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  turn: number;
  maxTurns: number;
  size: number;
  difficulty: number;
  tiles: Tile[];
  players: Player[];
  weather: Weather;
  forecast: Weather;
  market: Market;
  nextMarket: Market;
  log: LogEntry[];
  phase: Phase;
  victory: VictoryState;
  summary: TurnReport | null;
  lastResolvedTurn: number;
}

/** Report produced at end of each resolution (shown as a turn summary). */
export interface TurnReport {
  turn: number;
  playerId: number;
  generation: number;
  demand: number;
  delivered: number;
  compute: number;
  computeRevenue: number;
  powerRevenue: number;
  serviceRevenue: number;
  opex: number;
  research: number;
  stability: number;
  creditsStart: number;
  creditsEnd: number;
  notes: string[];
  rivalHighlights: string[];
}

/** Serializable AI action for tests + replay. */
export type AIAction =
  | { type: 'claim'; x: number; y: number }
  | { type: 'build'; x: number; y: number; kind: StructureKind }
  | { type: 'upgrade'; x: number; y: number }
  | { type: 'research'; id: string }
  | { type: 'policy'; policy: Policy };

export interface BuildOption {
  kind: StructureKind;
  name: string;
  cost: number;
  category: 'gen' | 'grid' | 'dc' | 'storage' | 'lab';
  blurb: string;
  stats: string;
  unlocked: boolean;
  reason?: string;
}
