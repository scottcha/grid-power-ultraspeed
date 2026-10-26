/** Public engine surface used by UI, tests and headless simulations. */
export * from './types.ts';
export * from './config.ts';
export * from './simulation.ts';
export * from './grid.ts';
export * from './worldgen.ts';
export { makeRng, advanceRng, fbm, valueNoise } from './rng.ts';
export { takeAITurn } from './ai.ts';
export { saveGame, loadGame, listSaves } from './save.ts';
