/**
 * Headless AI-only match runner.
 * Usage: npm run sim [-- seeds=8 turns=40 size=18]
 */
import { createGame, endTurn, registerAIPlayer } from '../src/engine/index.ts';
import { takeAITurn } from '../src/engine/ai.ts';
import type { GameState } from '../src/engine/types.ts';

registerAIPlayer(takeAITurn);

function runMatch(seed: number, size: number, maxTurns: number): {
  state: GameState;
  ms: number;
  turns: number;
  winner: string;
  condition: string;
  shares: number[];
  credits: number[];
  capacity: number[];
  techs: number[];
  nan: boolean;
} {
  const t0 = performance.now();
  const state = createGame({ seed, size, maxTurns, difficulty: 1 });
  // Human player is driven by the same AI heuristic in headless matches.
  state.players[0].isAI = true;
  state.players[0].personality = 'titan';
  let guard = 0;
  while (state.phase !== 'gameover' && guard++ < maxTurns + 5) {
    endTurn(state);
  }
  const ms = performance.now() - t0;
  return {
    state,
    ms,
    turns: state.turn,
    winner: state.victory.winner !== null ? state.players[state.victory.winner].company : 'none',
    condition: state.victory.condition ?? 'none',
    shares: state.players.map((p) => Math.round(p.computeShare * 100)),
    credits: state.players.map((p) => Math.round(p.credits)),
    capacity: state.players.map((p) => Math.round(p.capacity)),
    techs: state.players.map((p) => p.techs.length),
    nan: state.players.some((p) => !Number.isFinite(p.credits + p.compute + p.capacity + p.stability)),
  };
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=') as [string, string]));
const seeds = Number(args.seeds ?? 6);
const size = Number(args.size ?? 18);
const turns = Number(args.turns ?? 40);

console.log(`GRIDPOWER headless league — ${seeds} matches, ${size}x${size}, ${turns} turns\n`);
console.log('seed  time   winner            cond      share%        credits          MW          techs');
for (let i = 0; i < seeds; i++) {
  const seed = 1000 + i * 7919;
  const r = runMatch(seed, size, turns);
  console.log(
    `${String(seed).padEnd(5)} ${(r.ms / 1000).toFixed(2)}s  T${String(r.turns).padStart(2)} ${r.winner.padEnd(18)}${r.condition.padEnd(9)} ` +
    `${r.shares.join('/').padEnd(14)} ${r.credits.join('/').padEnd(17)} ${r.capacity.join('/').padEnd(13)} ${r.techs.join('/')}` +
    (r.nan ? '  !! NaN' : ''),
  );
  const bad = r.state.players.some((p) => p.history.length > 0 && p.history.at(-1)!.credits < 0)
    || r.state.tiles.some((t) => t.structure && t.owner === null && t.structure.kind !== 'substation');
  if (bad) console.log('  !! invariant violation');
}
