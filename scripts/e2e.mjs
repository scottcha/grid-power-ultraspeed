/** Browser validation: real clicks, state assertions, PNG screenshots. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const exe = process.env.CHROME_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const OUT = 'screenshots';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath: exe, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png`, type: 'png' });

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('main menu renders', (await page.locator('.menu-title').count()) === 1);
check('new game controls present', (await page.getByRole('button', { name: /Initialise grid/i }).count()) === 1);
await shot('01-main-menu');

await page.getByRole('button', { name: /Initialise grid/i }).click();
await page.waitForTimeout(1500);
check('game canvas mounted', (await page.locator('canvas.game-canvas').count()) === 1);
const gameState = await page.evaluate(() => {
  const raw = localStorage.getItem('gridpower.slot.auto');
  return raw ? JSON.parse(raw).state : null;
});
check('autosave created', !!gameState);
check('four companies in play', gameState?.players.length === 4, gameState?.players.map((p) => p.company).join(', '));
const resourcePills = await page.locator('.res-pill').allInnerTexts();
check('resource pills show numbers', resourcePills.length >= 5 && resourcePills.every((t) => /\d/.test(t)), resourcePills.join(' | ').replace(/\n/g, ' '));
await shot('02-game-start');

const debug = await page.evaluate(() => {
  const d = window.__gpDebug;
  if (!d) return null;
  const st = d.state();
  const game = st.game;
  const owned = game.tiles.filter((t) => t.owner === 0);
  const dc = owned.find((t) => t.structure?.kind === 'dc_edge');
  const emptyOwned = owned.find((t) => !t.structure);
  return { cam: d.camera(), dc: { x: dc.x, y: dc.y }, ownedCount: owned.length, hasEmpty: !!emptyOwned };
});
check('debug seam available', !!debug);
// The starter data center is pre-selected on new game; clicking it toggles the panel.
const panelText = await page.locator('.tile-panel').innerText();
check('starter data center is preselected', /Data Center/i.test(panelText), panelText.split('\n')[0]);
check('tile panel exposes operating policy', /Maximize Compute/i.test(panelText));
await shot('03-tile-panel');
const dcScreen = await page.evaluate(([x, y]) => {
  const s = window.__gpDebug.screenOf(x, y);
  const rect = document.querySelector('canvas.game-canvas').getBoundingClientRect();
  return { x: rect.left + s.x, y: rect.top + s.y };
}, [debug.dc.x, debug.dc.y]);
await page.mouse.click(dcScreen.x, dcScreen.y);
await page.waitForTimeout(300);
check('clicking the selected tile closes the panel', (await page.locator('.tile-panel').innerText()).includes('Select a tile to operate'));
await page.mouse.click(dcScreen.x, dcScreen.y);
await page.waitForTimeout(300);
check('re-clicking selects the data center again', /Data Center/i.test(await page.locator('.tile-panel').innerText()));

// Claim an adjacent tile through the UI.
const claimTarget = await page.evaluate(() => {
  const st = window.__gpDebug.state();
  const game = st.game;
  const owned = new Set(game.tiles.filter((t) => t.owner === 0).map((t) => t.y * game.size + t.x));
  const adjacent = game.tiles.filter((t) => t.owner === null && t.terrain !== 'ocean' && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => owned.has((t.y+dy)*game.size + (t.x+dx))));
  // Prefer a tile where a solar farm is legal, so the build step is exercised.
  const tile = adjacent.find((t) => ['plains', 'desert', 'urban'].includes(t.terrain) && !t.structure) ?? adjacent.find((t) => !t.structure) ?? adjacent[0];
  return tile ? { x: tile.x, y: tile.y } : null;
});
const claimScreen = await page.evaluate(([x, y]) => {
  const s = window.__gpDebug.screenOf(x, y);
  const rect = document.querySelector('canvas.game-canvas').getBoundingClientRect();
  return { x: rect.left + s.x, y: rect.top + s.y };
}, [claimTarget.x, claimTarget.y]);
await page.mouse.click(claimScreen.x, claimScreen.y);
await page.waitForTimeout(350);
const claimButton = page.getByRole('button', { name: /Claim territory/i });
check('claim action offered on adjacent tile', (await claimButton.count()) === 1);
const creditsBefore = await page.evaluate(() => window.__gpDebug.state().game.players[0].credits);
await claimButton.click();
await page.waitForTimeout(450);
const afterClaim = await page.evaluate(([x, y]) => {
  const g = window.__gpDebug.state().game;
  return { credits: g.players[0].credits, owner: g.tiles[y * g.size + x].owner, turn: g.turn };
}, [claimTarget.x, claimTarget.y]);
check('claim deducts credits', afterClaim.credits < creditsBefore, `${creditsBefore} -> ${afterClaim.credits}`);
check('claimed tile is owned by player', afterClaim.owner === 0);

// Build a solar farm on a newly claimed empty tile.
const emptyScreen = await page.evaluate(([x, y]) => {
  const s = window.__gpDebug.screenOf(x, y);
  const rect = document.querySelector('canvas.game-canvas').getBoundingClientRect();
  return { x: rect.left + s.x, y: rect.top + s.y };
}, [claimTarget.x, claimTarget.y]);
await page.mouse.click(emptyScreen.x, emptyScreen.y);
await page.waitForTimeout(350);
const emptyPanel = await page.locator('.tile-panel').innerText();
check('build menu opens on owned empty tile', /Solar Farm/i.test(emptyPanel) || /Not enough credits/i.test(emptyPanel));
await shot('04-build-menu');
const solarCard = page.locator('.build-card', { hasText: 'Solar Farm' }).first();
if (await solarCard.count()) {
  const beforeBuild = await page.evaluate(() => window.__gpDebug.state().game.players[0].credits);
  await solarCard.click();
  await page.waitForTimeout(500);
  const built = await page.evaluate(([x, y]) => {
    const g = window.__gpDebug.state().game;
    return { kind: g.tiles[y * g.size + x].structure?.kind ?? null, credits: g.players[0].credits };
  }, [claimTarget.x, claimTarget.y]);
  check('constructing a solar farm updates state', built.kind === 'solar', `credits ${beforeBuild} -> ${built.credits}`);
}

// Tech + market modals content.
await page.keyboard.press('t');
await page.waitForTimeout(400);
const techText = await page.locator('.modal').innerText();
check('tech tree lists all branches', ['COMPUTE', 'ENERGY', 'OPTIMIZATION', 'INFRASTRUCTURE'].every((b) => techText.toUpperCase().includes(b)));
check('tech tree has researchable nodes', (await page.locator('.tech-node').count()) >= 19);
await shot('05-tech-tree');
await page.keyboard.press('Escape');
await page.keyboard.press('m');
await page.waitForTimeout(400);
const marketText = await page.locator('.modal').innerText();
check('market shows prices and forecast', /\$\d/.test(marketText) && /forecast/i.test(marketText));
await shot('06-market');
await page.keyboard.press('Escape');

// End turn cycle.
const turnBefore = await page.evaluate(() => window.__gpDebug.state().game.turn);
await page.keyboard.press('Space');
await page.waitForTimeout(900);
const summaryText = await page.locator('.modal').innerText();
check('end turn opens the summary', /turn 1 report/i.test(summaryText), summaryText.split('\n')[0]);
check('summary reports revenue and compute', /Compute revenue/i.test(summaryText) && /Operating cost/i.test(summaryText));
await shot('07-turn-summary');
await page.getByRole('button', { name: /^Continue/i }).first().click();
await page.waitForTimeout(600);
const turnAfter = await page.evaluate(() => window.__gpDebug.state().game.turn);
check('continue advances the turn', turnAfter === turnBefore + 1, `T${turnBefore} -> T${turnAfter}`);
check('turn counter in HUD updated', new RegExp(`TURN\\s*0?${turnAfter}`, 'i').test(await page.locator('.brand-block').innerText()));

// Play several turns and verify economy carries.
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  const cont = page.getByRole('button', { name: /^Continue/i }).first();
  if (await cont.count()) await cont.click();
  await page.waitForTimeout(250);
}
const mid = await page.evaluate(() => {
  const g = window.__gpDebug.state().game;
  return {
    turn: g.turn,
    credits: g.players[0].credits,
    compute: g.players[0].compute,
    history: g.players[0].history.length,
    rivals: g.players.slice(1).map((p) => ({ tiles: g.tiles.filter((t) => t.owner === p.id).length, dc: g.tiles.filter((t) => t.owner === p.id && t.structure?.kind.startsWith('dc')).length })),
    log: g.log.length,
  };
});
check('turns keep resolving', mid.turn === turnAfter + 6 && mid.history === mid.turn - 1, `T${mid.turn}, history ${mid.history}`);
check('compute production is positive', mid.compute > 0, `${mid.compute} CU`);
check('rivals expand over time', mid.rivals.every((r) => r.tiles > 3), JSON.stringify(mid.rivals));
check('log records events', mid.log > 5, `${mid.log} entries`);

// Empire panel and overlays.
await page.keyboard.press('e');
await page.waitForTimeout(400);
check('empire overview has assets', /Assets/i.test(await page.locator('.modal').innerText()));
await shot('08-empire');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /Power grid/i }).click();
await page.waitForTimeout(500);
await shot('09-power-overlay');

// Save/load via localStorage.
const savedTurn = await page.evaluate(() => window.__gpDebug.state().game.turn);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Save game/i }).click();
await page.waitForTimeout(300);
const manual = await page.evaluate(() => !!localStorage.getItem('gridpower.slot.manual'));
check('manual save written', manual);
await page.keyboard.press('Escape');

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : `${failures} CHECK(S) FAILED`} · turn ${savedTurn}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
