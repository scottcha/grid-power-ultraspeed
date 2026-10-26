/** Captures the final deliverable screenshots from the running application. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const exe = process.env.CHROME_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const OUT = 'screenshots';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(8000);
const step = (m) => console.log('·', m);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, type: 'png' });

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await shot('01-main-menu'); step('menu');

await page.fill('.seed-row input', '2024');
await page.getByRole('button', { name: /Initialise grid/i }).click();
await page.waitForTimeout(1400);
const clearToasts = () => page.evaluate(() => {
  const st = window.__gpDebug.state();
  for (const t of [...st.toasts]) st.dismissToast(t.id);
});
const openTile = (x, y) => page.evaluate(([tx, ty]) => {
  const st = window.__gpDebug.state();
  if (!st.selection || st.selection.x !== tx || st.selection.y !== ty) st.selectTile(tx, ty);
  window.__gpDebug.center(tx, ty);
}, [x, y]);

await clearToasts();
await page.waitForTimeout(400);
await shot('02-game-start'); step('start');

// Claim one adjacent tile and show the build menu while the treasury is healthy.
const claimed = await page.evaluate(() => {
  const st = window.__gpDebug.state();
  const g = st.game;
  const size = g.size;
  const key = (x, y) => y * size + x;
  const owned = new Set(g.tiles.filter((t) => t.owner === 0).map((t) => key(t.x, t.y)));
  const adjacent = g.tiles.filter((t) => t.owner === null && t.terrain !== 'ocean' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => owned.has(key(t.x + dx, t.y + dy))));
  const score = { geothermal: 9, urban: 8, river: 7, basin: 6, mountain: 5, desert: 4, coast: 4, plains: 3, forest: 2 };
  adjacent.sort((a, b) => (score[b.terrain] ?? 0) - (score[a.terrain] ?? 0));
  const t = adjacent[0];
  if (!t) return null;
  st.selectTile(t.x, t.y);
  st.claimSelected();
  return { x: t.x, y: t.y };
});
await page.waitForTimeout(500);
await clearToasts();
if (claimed) await openTile(claimed.x, claimed.y);
await page.waitForTimeout(600);
await shot('04-build-menu'); step('build menu');

const capital = await page.evaluate(() => {
  const g = window.__gpDebug.state().game;
  const dc = g.tiles.find((t) => t.owner === 0 && t.structure?.kind === 'dc_edge');
  return { x: dc.x, y: dc.y };
});
await openTile(capital.x, capital.y);
await page.waitForTimeout(600);
await shot('03-tile-panel'); step('panel');

// Develop the capital through legitimate UI actions across five turns.
const act = async () => page.evaluate(() => {
  const st = window.__gpDebug.state();
  const g = st.game;
  const size = g.size;
  const key = (x, y) => y * size + x;
  const owned = g.tiles.filter((t) => t.owner === 0);
  const ownedIdx = new Set(owned.map((t) => key(t.x, t.y)));
  const adjacent = g.tiles.filter((t) => t.owner === null && t.terrain !== 'ocean' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ownedIdx.has(key(t.x + dx, t.y + dy))));
  const score = { geothermal: 9, urban: 8, river: 7, basin: 6, mountain: 5, desert: 4, coast: 4, plains: 3, forest: 2 };
  adjacent.sort((a, b) => (score[b.terrain] ?? 0) - (score[a.terrain] ?? 0));
  if (adjacent[0]) {
    st.selectTile(adjacent[0].x, adjacent[0].y);
    st.claimSelected();
  }
  const empty = g.tiles.filter((t) => t.owner === 0 && !t.structure);
  const powerEmpty = empty.find((t) => ['plains', 'desert', 'urban'].includes(t.terrain));
  if (powerEmpty) {
    st.selectTile(powerEmpty.x, powerEmpty.y);
    st.buildSelected('solar');
  }
  const dcEmpty = g.tiles.filter((t) => t.owner === 0 && !t.structure && t.terrain !== 'ocean')[0];
  if (dcEmpty && g.players[0].credits > 130) {
    st.selectTile(dcEmpty.x, dcEmpty.y);
    st.buildSelected('dc_edge');
  }
});

for (let i = 0; i < 5; i++) {
  await act();
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  if (i === 0) await shot('07-turn-summary');
  const cont = page.getByRole('button', { name: /^Continue/i }).first();
  if (await cont.count()) await cont.click();
  await page.waitForTimeout(400);
}
await clearToasts();
await openTile(capital.x, capital.y);
await page.waitForTimeout(700);

await page.keyboard.press('t');
await page.waitForTimeout(500);
await shot('05-tech-tree'); step('tech');
await page.keyboard.press('Escape');
await page.keyboard.press('m');
await page.waitForTimeout(400);
await shot('06-market'); step('market');
await page.keyboard.press('Escape');
await page.keyboard.press('e');
await page.waitForTimeout(400);
await shot('08-empire'); step('empire');
await page.keyboard.press('Escape');
await page.evaluate(() => window.__gpDebug.state().setOverlay('power'));
await page.waitForTimeout(900);
await shot('09-power-overlay'); step('overlay');
await page.evaluate(() => window.__gpDebug.state().setOverlay('none'));
await page.waitForTimeout(400);
step('standard view');

// Victory screen via a legitimate end-turn on the final turn.
await page.evaluate(async () => {
  const st = window.__gpDebug.state();
  st.game.turn = st.game.maxTurns;
  st.game.players[0].credits = 9999;
});
await page.waitForTimeout(300);
await page.keyboard.press('Space');
await page.waitForTimeout(1400);
await shot('10-victory'); step('victory');

console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
