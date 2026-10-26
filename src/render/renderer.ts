/** Isometric canvas art system: terrain, structures, power lines, weather. */
import { TERRAIN_INFO } from './palette.ts';
import { STRUCTURES } from '../engine/config.ts';
import { isDc } from '../engine/grid.ts';
import type { DispatchResult } from '../engine/grid.ts';
import type { GameState, StructureKind, Terrain, Tile } from '../engine/types.ts';

export const TW = 104;
export const TH = 52;
const ELEV = 9;

export interface RenderPrefs {
  overlay: 'none' | 'power' | 'compute' | 'territory' | 'economy';
  showGrid: boolean;
}

export interface TileScreen {
  x: number;
  y: number;
}

export interface RendererBridge {
  getGame(): GameState | null;
  getPreview(): DispatchResult | null;
  getSelection(): { x: number; y: number } | null;
  getHover(): { x: number; y: number } | null;
  getBuildKind(): StructureKind | null;
  getPrefs(): RenderPrefs;
  onClickTile(x: number, y: number, opts: { shift: boolean }): void;
  onHoverTile(x: number, y: number | null, screen: TileScreen): void;
  onCameraChange(cam: { x: number; y: number; zoom: number }): void;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function shade(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = clamp(((num >> 16) & 255) + amount, 0, 255);
  const g = clamp(((num >> 8) & 255) + amount, 0, 255);
  const b = clamp((num & 255) + amount, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function rgba(hex: string, a: number): string {
  const num = parseInt(hex.slice(1), 16);
  return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${a})`;
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - w, cy);
  ctx.closePath();
}

/** Draws an isometric box whose footprint is a diamond (half width fw, half depth fw/2). */
function isoBox(
  ctx: CanvasRenderingContext2D, cx: number, cy: number,
  fw: number, h: number, top: string, left: string, right: string,
  outline = 'rgba(0,0,0,0.35)',
) {
  const fd = fw * 0.5;
  ctx.lineWidth = 1;
  ctx.strokeStyle = outline;
  // Left face.
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(cx - fw, cy - h);
  ctx.lineTo(cx, cy - h + fd);
  ctx.lineTo(cx, cy + fd);
  ctx.lineTo(cx - fw, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Right face.
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(cx + fw, cy - h);
  ctx.lineTo(cx, cy - h + fd);
  ctx.lineTo(cx, cy + fd);
  ctx.lineTo(cx + fw, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Top face.
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h - fd);
  ctx.lineTo(cx + fw, cy - h);
  ctx.lineTo(cx, cy - h + fd);
  ctx.lineTo(cx - fw, cy - h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha = 0.22) {
  ctx.fillStyle = `rgba(4,10,16,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
}

function pine(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dark = false) {
  ctx.fillStyle = '#3b2a1c';
  ctx.fillRect(x - s * 0.06, y - s * 0.12, s * 0.12, s * 0.22);
  for (let i = 0; i < 3; i++) {
    const yy = y - s * 0.08 - i * s * 0.3;
    const w = s * (0.42 - i * 0.1);
    ctx.fillStyle = i === 0 ? (dark ? '#1f4030' : '#2f6b42') : i === 1 ? (dark ? '#25503a' : '#377a4a') : (dark ? '#2b5c41' : '#438c55');
    ctx.beginPath();
    ctx.moveTo(x, yy - s * 0.42);
    ctx.lineTo(x + w, yy);
    ctx.lineTo(x - w, yy);
    ctx.closePath();
    ctx.fill();
  }
}

function turbine(ctx: CanvasRenderingContext2D, cx: number, top: number, scale: number, phase: number) {
  ctx.strokeStyle = '#dfe9f2';
  ctx.lineWidth = 2.4 * scale;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx, top + 46 * scale);
  ctx.stroke();
  ctx.fillStyle = '#c9d6e2';
  ctx.beginPath();
  ctx.arc(cx, top, 3.4 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, top);
  ctx.rotate(phase);
  ctx.strokeStyle = '#f2f7fb';
  ctx.lineWidth = 2 * scale;
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(4 * scale, -14 * scale, 2 * scale, -24 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

function steam(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, scale = 1, color = 'rgba(230,240,248,0.5)') {
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.5 + i * 0.33) % 1;
    const r = (3 + p * 9) * scale;
    ctx.fillStyle = color.replace('0.5', String(0.42 * (1 - p)).slice(0, 4));
    ctx.beginPath();
    ctx.arc(x + Math.sin((p + i) * 4) * 4 * scale, y - p * 26 * scale, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSolar(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  drawShadow(ctx, cx, cy + 4, 32, 0.18);
  const rows = [
    [{ x: -18, y: -6 }, { x: 2, y: -11 }, { x: 22, y: -8 }],
    [{ x: -10, y: 8 }, { x: 10, y: 3 }, { x: 28, y: 6 }],
  ];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const { x, y } = rows[r][c];
      const px = cx + x;
      const py = cy + y;
      const fw = 12;
      const fh = 6;
      const lift = 5;
      // Frame + legs
      ctx.strokeStyle = '#5f707d';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px - fw + 2, py - lift + 1);
      ctx.lineTo(px - fw + 2, py + lift + 3);
      ctx.moveTo(px + fw - 2, py - lift + 1);
      ctx.lineTo(px + fw - 2, py + lift + 3);
      ctx.stroke();
      ctx.fillStyle = '#26394a';
      ctx.beginPath();
      ctx.moveTo(px, py - fh - lift);
      ctx.lineTo(px + fw, py - lift);
      ctx.lineTo(px, py + fh - lift);
      ctx.lineTo(px - fw, py - lift);
      ctx.closePath();
      ctx.fill();
      const grad = ctx.createLinearGradient(px - fw, py - fh - lift, px + fw, py + fh - lift);
      grad.addColorStop(0, '#6cc4ef');
      grad.addColorStop(0.5, '#3a82b3');
      grad.addColorStop(1, '#1d4f76');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px, py - fh - lift + 1.5);
      ctx.lineTo(px + fw - 1.5, py - lift + 0.5);
      ctx.lineTo(px, py + fh - lift - 0.5);
      ctx.lineTo(px - fw + 1.5, py - lift + 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,240,255,0.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px, py - fh - lift + 2);
      ctx.lineTo(px, py + fh - lift - 1);
      ctx.moveTo(px - fw + 3, py - lift + 0.5);
      ctx.lineTo(px + fw - 3, py - lift + 0.5);
      ctx.stroke();
      const glint = (t * 0.35 + (r * 3 + c) * 0.19) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.2 * Math.sin(glint * Math.PI)})`;
      ctx.beginPath();
      ctx.moveTo(px - fw + glint * fw * 1.5, py - lift - 4 + glint * 1.4);
      ctx.lineTo(px - fw + glint * fw * 1.5 + 5, py - lift - 2.4);
      ctx.lineTo(px - fw + glint * fw * 1.5 + 5, py - lift + 0.8);
      ctx.lineTo(px - fw + glint * fw * 1.5, py - lift - 0.8);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawGas(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  drawShadow(ctx, cx, cy + 3, 26, 0.2);
  isoBox(ctx, cx - 8, cy + 2, 16, 17, '#8d99a6', '#4c545d', '#657079');
  isoBox(ctx, cx + 13, cy - 2, 8, 24, '#a8b4c0', '#5b656f', '#78838d');
  ctx.fillStyle = '#3b444d';
  ctx.fillRect(cx + 10, cy - 38, 6, 14);
  steam(ctx, cx + 13, cy - 40, t, 0.7, 'rgba(210,220,230,0.5)');
  // Pipes
  ctx.strokeStyle = '#b9c4cf';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy + 6);
  ctx.lineTo(cx - 8, cy + 6);
  ctx.lineTo(cx - 8, cy + 10);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,170,60,0.85)';
  ctx.beginPath();
  ctx.arc(cx + 13, cy - 32, 3 + Math.sin(t * 6) * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawHydro(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  drawShadow(ctx, cx, cy + 2, 27, 0.18);
  isoBox(ctx, cx, cy + 2, 22, 12, '#b6c1c9', '#67737c', '#87929b');
  // Reservoir
  ctx.fillStyle = 'rgba(70,160,210,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 12, 21, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,235,255,0.5)';
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.5 + i * 0.34) % 1;
    ctx.fillRect(cx - 18 + p * 36, cy - 13 + Math.sin(p * 6) * 2, 6, 1.4);
  }
  // Spillway
  ctx.fillStyle = 'rgba(120,210,240,0.8)';
  ctx.fillRect(cx - 3, cy - 1, 6, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(cx - 1, cy + 4, 1.5, 6);
}

function drawNuclear(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  drawShadow(ctx, cx, cy + 2, 28, 0.22);
  for (const dx of [-12, 12]) {
    const x = cx + dx;
    const y = cy - 4 + (dx > 0 ? 3 : 0);
    ctx.fillStyle = '#c3ccd4';
    ctx.beginPath();
    ctx.moveTo(x - 9, y + 6);
    ctx.quadraticCurveTo(x - 7, y - 30, x, y - 34);
    ctx.quadraticCurveTo(x + 7, y - 30, x + 9, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(88,104,118,0.55)';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 6);
    ctx.quadraticCurveTo(x + 6, y - 24, x + 4, y - 32);
    ctx.quadraticCurveTo(x + 7, y - 30, x + 9, y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,55,70,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y - 34, 4.5, 1.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    steam(ctx, x, y - 36, t, 0.9, 'rgba(240,248,255,0.5)');
  }
  isoBox(ctx, cx, cy + 10, 20, 8, '#9aa6b1', '#58626c', '#77828c');
  // Glowing core ring
  ctx.strokeStyle = `rgba(120,240,180,${0.5 + Math.sin(t * 2) * 0.2})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 10, 3.5, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGeothermal(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  drawShadow(ctx, cx, cy + 2, 24, 0.2);
  isoBox(ctx, cx + 6, cy + 2, 13, 16, '#9c7d64', '#5d4535', '#7c5f4a');
  isoBox(ctx, cx - 12, cy, 7, 10, '#a88b71', '#6a5140', '#87694f');
  steam(ctx, cx - 12, cy - 12, t, 0.8, 'rgba(250,250,245,0.55)');
  steam(ctx, cx + 8, cy - 16, t + 0.4, 1, 'rgba(255,245,235,0.5)');
  ctx.fillStyle = 'rgba(255,140,80,0.8)';
  ctx.beginPath();
  ctx.arc(cx + 6, cy + 4, 2.5 + Math.sin(t * 3) * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,180,120,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx + 6, cy + 6, 8, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

function drawSubstation(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, color: string) {
  drawShadow(ctx, cx, cy + 2, 25, 0.18);
  // Yard
  ctx.fillStyle = '#2c3d4a';
  diamondPath(ctx, cx, cy + 3, 34, 17);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,180,200,0.35)';
  ctx.lineWidth = 1;
  diamondPath(ctx, cx, cy + 3, 34, 17);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  diamondPath(ctx, cx, cy + 3, 28, 14);
  ctx.fill();
  for (const [dx, dy] of [[-10, 1], [7, -3]] as const) {
    isoBox(ctx, cx + dx, cy + dy, 7.5, 12, '#b8c3cd', '#4f5a63', '#7a858f');
    ctx.strokeStyle = 'rgba(120,220,255,0.65)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const ox = -4 + i * 4;
      ctx.beginPath();
      ctx.moveTo(cx + dx + ox, cy + dy - 16);
      ctx.lineTo(cx + dx + ox, cy + dy - 10);
      ctx.stroke();
    }
  }
  // Fence posts
  ctx.strokeStyle = 'rgba(170,190,205,0.55)';
  ctx.lineWidth = 1;
  for (const [fx, fy] of [[-28, 6], [-14, -8], [14, -6], [28, 8], [0, 16]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + fx, cy + fy);
    ctx.lineTo(cx + fx, cy + fy - 7);
    ctx.stroke();
  }
  // Lattice pylon
  drawPylon(ctx, cx + 2, cy - 2, true, color);
  // Hazard stripe
  ctx.fillStyle = 'rgba(255,200,90,0.75)';
  ctx.fillRect(cx - 13, cy + 11, 26, 2);
  const pulse = 0.55 + Math.sin(t * 3) * 0.3;
  ctx.fillStyle = rgba(color, pulse);
  ctx.beginPath();
  ctx.arc(cx, cy - 16, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawPylon(ctx: CanvasRenderingContext2D, cx: number, cy: number, energized: boolean, color: string) {
  ctx.strokeStyle = '#b9c6d2';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy + 4);
  ctx.lineTo(cx - 2, cy - 32);
  ctx.lineTo(cx + 2, cy - 32);
  ctx.lineTo(cx + 7, cy + 4);
  ctx.moveTo(cx - 5, cy - 6);
  ctx.lineTo(cx + 5, cy - 6);
  ctx.moveTo(cx - 3.5, cy - 16);
  ctx.lineTo(cx + 3.5, cy - 16);
  ctx.moveTo(cx - 12, cy - 26);
  ctx.lineTo(cx + 12, cy - 26);
  ctx.moveTo(cx, cy - 32);
  ctx.lineTo(cx, cy - 36);
  ctx.stroke();
  if (energized) {
    ctx.fillStyle = rgba(color, 0.85);
    ctx.beginPath();
    ctx.arc(cx, cy - 36, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBattery(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, soc: number) {
  drawShadow(ctx, cx, cy + 2, 24, 0.18);
  for (let i = 0; i < 3; i++) {
    const dx = -17 + i * 17;
    isoBox(ctx, cx + dx, cy + (i % 2 === 0 ? 1 : -1), 8, 16, '#d7dfe6', '#6d7780', '#96a0a9');
    // LED bar
    const lit = soc * 3 > i + 0.5;
    ctx.fillStyle = lit ? `rgba(120,240,170,${0.6 + Math.sin(t * 4 + i) * 0.25})` : 'rgba(90,100,110,0.7)';
    ctx.fillRect(cx + dx - 2.5, cy - 12 + (i % 2 ? -1 : 1), 5, 2);
  }
  // charge cable
  ctx.strokeStyle = 'rgba(120,240,170,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy + 6);
  ctx.lineTo(cx + 16, cy + 6);
  ctx.stroke();
}

function drawLab(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, color: string) {
  drawShadow(ctx, cx, cy + 2, 23, 0.18);
  isoBox(ctx, cx, cy + 3, 22, 13, '#cfd8e0', '#67717c', '#939da7');
  // dome
  const grad = ctx.createRadialGradient(cx - 5, cy - 14, 2, cx, cy - 10, 18);
  grad.addColorStop(0, 'rgba(220,250,255,0.95)');
  grad.addColorStop(1, 'rgba(100,190,220,0.55)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy - 9, 19, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,245,255,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy - 9, 19, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - 9, 11, Math.PI, 0);
  ctx.stroke();
  // antenna
  ctx.strokeStyle = '#cfd8e0';
  ctx.beginPath();
  ctx.moveTo(cx + 10, cy - 10);
  ctx.lineTo(cx + 10, cy - 30);
  ctx.stroke();
  ctx.fillStyle = rgba(color, 0.5 + Math.sin(t * 3) * 0.4);
  ctx.beginPath();
  ctx.arc(cx + 10, cy - 31, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawDataCenter(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number,
  kind: 'dc_edge' | 'dc_hyper' | 'dc_giga', color: string,
) {
  const shadowR = kind === 'dc_giga' ? 40 : kind === 'dc_hyper' ? 32 : 23;
  drawShadow(ctx, cx, cy + 3, shadowR, 0.24);
  const accent = color;
  if (kind === 'dc_edge') {
    isoBox(ctx, cx, cy + 3, 15, 20, '#aeb9c4', '#5c6771', '#828e99');
    isoBox(ctx, cx - 12, cy + 8, 6, 8, '#96a2ad', '#4f5a63', '#6f7b85');
    // Accent band on the front face.
    ctx.fillStyle = rgba(accent, 0.75);
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy + 3);
    ctx.lineTo(cx - 15, cy + 7);
    ctx.lineTo(cx + 15, cy + 13);
    ctx.lineTo(cx + 15, cy + 9);
    ctx.closePath();
    ctx.fill();
    // LEDs
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = rgba(accent, 0.65 + Math.sin(t * 3 + i * 2) * 0.3);
      ctx.fillRect(cx - 5 + i * 4, cy - 8, 2, 1.6);
    }
    ctx.fillStyle = rgba(accent, 0.22);
    ctx.beginPath();
    ctx.ellipse(cx, cy - 18, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'dc_hyper') {
    isoBox(ctx, cx + 4, cy + 4, 20, 24, '#b3bec9', '#5f6a74', '#87939e');
    isoBox(ctx, cx - 16, cy + 2, 11, 15, '#a2aeb9', '#556069', '#77838e');
    isoBox(ctx, cx - 6, cy - 18, 10, 9, '#c7d1da', '#6d7882', '#98a3ad');
    // Rooftop units
    for (let i = 0; i < 5; i++) {
      isoBox(ctx, cx + 4 + (i - 2) * 10, cy - 3, 3.6, 3.2, '#d8e1e9', '#7a858f', '#a6b1bb');
    }
    // Server LED rows on the front face
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = rgba(accent, 0.4 + Math.sin(t * 2.5 + i * 0.9) * 0.4);
      ctx.fillRect(cx - 4 + (i % 4) * 7, cy - 20 + Math.floor(i / 4) * 10, 2.6, 1.8);
    }
    ctx.fillStyle = rgba(accent, 0.18);
    ctx.beginPath();
    ctx.ellipse(cx, cy - 34, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    isoBox(ctx, cx + 7, cy + 5, 32, 40, '#b7c2cc', '#5e6973', '#87929d');
    isoBox(ctx, cx - 26, cy + 4, 17, 27, '#a3afba', '#525d66', '#76828c');
    isoBox(ctx, cx - 10, cy - 32, 17, 15, '#c8d2db', '#6b7680', '#98a3ad');
    isoBox(ctx, cx + 26, cy - 24, 10, 15, '#aab6c1', '#5a656e', '#7d8893');
    // Glowing crown ring
    ctx.strokeStyle = rgba(accent, 0.55 + Math.sin(t * 1.8) * 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy - 38, 26, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = rgba(accent, 0.45 + Math.sin(t * 3 + i) * 0.4);
      ctx.fillRect(cx - 18 + i * 5.2, cy - 4, 2, 1.8);
    }
    // Cooling units
    for (let i = 0; i < 3; i++) {
      isoBox(ctx, cx - 20 + i * 9, cy - 8, 3.4, 3, '#d9e2ea', '#7b868f', '#a7b2bc');
    }
    ctx.fillStyle = rgba(accent, 0.2);
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy - 44, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStructure(
  ctx: CanvasRenderingContext2D, tile: Tile, cx: number, cy: number, t: number, color: string,
) {
  const kind = tile.structure!.kind;
  const def = STRUCTURES[kind];
  if (def.category === 'gen') {
    switch (kind) {
      case 'solar': drawSolar(ctx, cx, cy, t); break;
      case 'wind':
        drawShadow(ctx, cx, cy + 2, 20, 0.14);
        turbine(ctx, cx - 10, cy - 22, 0.8, t * 1.4);
        turbine(ctx, cx + 12, cy - 10, 0.68, t * 1.7 + 1.2);
        break;
      case 'gas': drawGas(ctx, cx, cy, t); break;
      case 'hydro': drawHydro(ctx, cx, cy, t); break;
      case 'nuclear': drawNuclear(ctx, cx, cy, t); break;
      case 'geothermal': drawGeothermal(ctx, cx, cy, t); break;
    }
  } else if (def.category === 'grid') {
    if (kind === 'substation') drawSubstation(ctx, cx, cy, t, color);
    else drawPylon(ctx, cx, cy, true, color);
  } else if (def.category === 'storage') {
    drawBattery(ctx, cx, cy, t, safeSoc(tile));
  } else if (def.category === 'lab') {
    drawLab(ctx, cx, cy, t, color);
  } else if (def.category === 'dc' && isDc(kind)) {
    drawDataCenter(ctx, cx, cy, t, kind, color);
  }
}

function safeSoc(tile: Tile): number {
  if (!tile.structure || tile.structure.kind !== 'battery') return 0;
  return Math.min(1, (tile.structure.soc ?? 0) / 130);
}

export class IsoRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bridge: RendererBridge;
  private cam: Camera = { x: 0, y: 0, zoom: 1 };
  private raf = 0;
  private last = 0;
  private dragging = false;
  private dragMoved = false;
  private lastPointer = { x: 0, y: 0 };
  private hoverScreen = { x: 0, y: 0 };
  private dpr = 1;
  private width = 0;
  private height = 0;
  private zoomTarget = 1;

  constructor(canvas: HTMLCanvasElement, bridge: RendererBridge) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bridge = bridge;
    this.resize();
    this.bind();
  }

  private bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', this.onContext);
    window.addEventListener('resize', this.resize);
    this.zoomTarget = this.cam.zoom;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('resize', this.resize);
  }

  resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  };

  private onContext = (e: MouseEvent) => e.preventDefault();

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.dragMoved = false;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    if (this.dragging) {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true;
      this.cam.x -= dx / this.cam.zoom;
      this.cam.y -= dy / this.cam.zoom;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.bridge.onCameraChange(this.cam);
      const tile = this.pick(e.clientX - rect.left, e.clientY - rect.top);
      this.hoverScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.bridge.onHoverTile(tile?.x ?? -1, tile?.y ?? -1, this.hoverScreen);
      return;
    }
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const tile = this.pick(e.clientX - rect.left, e.clientY - rect.top);
    this.hoverScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.bridge.onHoverTile(tile?.x ?? -1, tile?.y ?? -1, this.hoverScreen);
  };

  private onUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.dragMoved) return;
    const rect = this.canvas.getBoundingClientRect();
    const tile = this.pick(e.clientX - rect.left, e.clientY - rect.top);
    if (tile) this.bridge.onClickTile(tile.x, tile.y, { shift: e.shiftKey });
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const before = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const factor = Math.exp(-e.deltaY * 0.0014);
    this.zoomTarget = clamp(this.zoomTarget * factor, 0.42, 2.1);
    this.cam.zoom = this.zoomTarget;
    const after = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.bridge.onCameraChange(this.cam);
  };

  centerOnTile(x: number, y: number, zoom = 1) {
    const p = this.tileWorld(x, y);
    this.cam = { x: p.x, y: p.y, zoom };
    this.zoomTarget = zoom;
    this.bridge.onCameraChange(this.cam);
  }

  getCamera(): Camera {
    return { ...this.cam };
  }

  /** Pans the camera by a screen-space delta (used by keyboard controls). */
  panByScreen(dx: number, dy: number) {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.bridge.onCameraChange(this.cam);
  }

  private tileWorld(x: number, y: number): { x: number; y: number } {
    return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) };
  }

  private screenToWorld(px: number, py: number): { x: number; y: number } {
    return {
      x: (px - this.width / 2) / this.cam.zoom + this.cam.x,
      y: (py - this.height / 2) / this.cam.zoom + this.cam.y,
    };
  }

  private pick(px: number, py: number): { x: number; y: number } | null {
    const game = this.bridge.getGame();
    if (!game) return null;
    const w = this.screenToWorld(px, py);
    const u = w.x / (TW / 2);
    const v = w.y / (TH / 2);
    const fx = (u + v) / 2;
    const fy = (v - u) / 2;
    const x = Math.round(fx);
    const y = Math.round(fy);
    if (x < 0 || y < 0 || x >= game.size || y >= game.size) return null;
    return { x, y };
  }

  start() {
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      if (!this.last) this.last = ts;
      const dt = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this.draw(ts / 1000, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Forces a camera reset for a fresh game. */
  resetCamera(x: number, y: number) {
    this.centerOnTile(x, y, this.width < 700 ? 1.0 : 1.55);
  }

  private draw(time: number, _dt: number) {
    const game = this.bridge.getGame();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    void _dt;

    // Sky / atmosphere
    const bg = ctx.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, '#07131d');
    bg.addColorStop(0.45, '#0b1c28');
    bg.addColorStop(1, '#0a1620');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);
    // subtle vignette-ish glow behind map
    const glow = ctx.createRadialGradient(this.width / 2, this.height * 0.45, 40, this.width / 2, this.height * 0.45, this.width * 0.6);
    glow.addColorStop(0, 'rgba(40,120,140,0.10)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    if (!game) return;
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    const prefs = this.bridge.getPrefs();
    const hover = this.bridge.getHover();
    const selection = this.bridge.getSelection();
    const preview = this.bridge.getPreview();
    const weather = game.weather;
    const human = 0;

    // Painter's order
    const order = [...game.tiles].sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);
    const nodeUtil = new Map<number, number>();
    if (preview) for (const n of preview.nodes) nodeUtil.set(n.y * 999 + n.x, n.util);

    for (const tile of order) {
      const explored = tile.explored[human];
      if (!explored) {
        this.drawFog(tile);
        continue;
      }
      const w = this.tileWorld(tile.x, tile.y);
      const lift = tile.elevation * ELEV;
      const cx = w.x;
      const cy = w.y - lift;
      this.drawTile(tile, cx, cy, time, prefs, nodeUtil, preview, game);
      if (tile.structure) {
        const owner = tile.owner !== null ? game.players[tile.owner] : null;
        drawStructure(ctx, tile, cx, cy - 2, time, owner?.color ?? '#59c7d8');
      }
      // ownership flag
      if (tile.owner !== null) {
        const color = game.players[tile.owner].color;
        ctx.strokeStyle = rgba(color, prefs.overlay === 'territory' ? 0.95 : tile.owner === 0 ? 0.8 : 0.5);
        ctx.lineWidth = prefs.overlay === 'territory' ? 2.4 : tile.owner === 0 ? 2 : 1.6;
        diamondPath(ctx, cx, cy - 1, TW / 2 - 2, TH / 2 - 1);
        ctx.stroke();
      }
      if (hover && hover.x === tile.x && hover.y === tile.y) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        diamondPath(ctx, cx, cy - 1, TW / 2 - 1, TH / 2 - 0.5);
        ctx.stroke();
      }
      if (selection && selection.x === tile.x && selection.y === tile.y) {
        const pulse = 0.65 + Math.sin(time * 4) * 0.25;
        ctx.strokeStyle = `rgba(255,220,120,${pulse})`;
        ctx.lineWidth = 2.6;
        diamondPath(ctx, cx, cy - 1, TW / 2 - 1, TH / 2 - 0.5);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,220,120,0.08)';
        diamondPath(ctx, cx, cy - 1, TW / 2 - 1, TH / 2 - 0.5);
        ctx.fill();
      }
    }

    // Power lines above the terrain.
    if (prefs.showGrid) this.drawNetwork(game, time, nodeUtil, preview);

    // Build ghost.
    const buildKind = this.bridge.getBuildKind();
    if (hover && buildKind) {
      const tile = game.tiles[hover.y * game.size + hover.x];
      const w = this.tileWorld(tile.x, tile.y);
      const cy = w.y - tile.elevation * ELEV;
      const legal = tile.owner === human && !tile.structure && tile.terrain !== 'ocean';
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = legal ? 'rgba(120,255,180,0.25)' : 'rgba(255,90,90,0.25)';
      diamondPath(ctx, w.x, cy, TW / 2 - 3, TH / 2 - 2);
      ctx.fill();
      ctx.strokeStyle = legal ? 'rgba(120,255,180,0.9)' : 'rgba(255,90,90,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      const ghostTile: Tile = { ...tile, structure: { kind: buildKind, policy: 'compute' }, owner: human };
      drawStructure(ctx, ghostTile, w.x, cy - 2, time, game.players[human].color);
      ctx.restore();
    }

    ctx.restore();

    // Screen-space weather.
    this.drawWeather(weather.kind, time, weather.cooling);
    // Screen vignette
    const vig = ctx.createRadialGradient(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.32, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawTile(
    tile: Tile, cx: number, cy: number, time: number,
    prefs: RenderPrefs, nodeUtil: Map<number, number>, preview: DispatchResult | null, game: GameState,
  ) {
    const ctx = this.ctx;
    const info = TERRAIN_INFO[tile.terrain];
    const seed = tile.variant;
    const isOcean = tile.terrain === 'ocean';
    const w = TW / 2;
    const h = TH / 2;

    // Side faces (cliff) for elevation.
    if (tile.elevation > 0) {
      ctx.fillStyle = shade(TERRAIN_INFO[tile.terrain].color, -58);
      ctx.beginPath();
      ctx.moveTo(cx - w, cy);
      ctx.lineTo(cx, cy + h);
      ctx.lineTo(cx, cy + h + tile.elevation * ELEV);
      ctx.lineTo(cx - w, cy + tile.elevation * ELEV);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(TERRAIN_INFO[tile.terrain].color, -38);
      ctx.beginPath();
      ctx.moveTo(cx + w, cy);
      ctx.lineTo(cx, cy + h);
      ctx.lineTo(cx, cy + h + tile.elevation * ELEV);
      ctx.lineTo(cx + w, cy + tile.elevation * ELEV);
      ctx.closePath();
      ctx.fill();
    }

    // Ocean: animated water.
    if (isOcean) {
      const wave = Math.sin(time * 1.2 + tile.x * 0.7 + tile.y * 0.5) * 0.5 + 0.5;
      ctx.fillStyle = `rgb(${28 + wave * 18},${100 + wave * 22},${140 + wave * 20})`;
    } else {
      if (tile.terrain === 'river') {
        // Grassy banks with a connected water ribbon drawn below.
        const bank = ctx.createLinearGradient(cx - w, cy - h, cx + w, cy + h);
        bank.addColorStop(0, '#4e8355');
        bank.addColorStop(1, '#37693f');
        ctx.fillStyle = bank;
      } else {
        const grad = ctx.createLinearGradient(cx - w, cy - h, cx + w, cy + h);
        grad.addColorStop(0, shade(info.color, 16));
        grad.addColorStop(1, shade(info.color, -14));
        ctx.fillStyle = grad;
      }
    }
    diamondPath(ctx, cx, cy, w, h);
    ctx.fill();

    // Subtle top highlight.
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Terrain texture.
    switch (tile.terrain) {
      case 'ocean': {
        for (let i = 0; i < 2; i++) {
          const p = (time * 0.15 + hash01(seed + i)) % 1;
          ctx.strokeStyle = `rgba(190,225,245,${0.08 + 0.05 * Math.sin(time + i)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(cx - 22 + p * 44, cy + (i === 0 ? -7 : 8), 8, 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'plains': {
        for (let i = 0; i < 5; i++) {
          const hx = hash01(seed + i * 17);
          const hy = hash01(seed + i * 31 + 5);
          const px = cx + (hx - 0.5) * 66;
          const py = cy + (hy - 0.5) * 30;
          ctx.strokeStyle = i % 3 === 0 ? 'rgba(240,235,160,0.5)' : 'rgba(50,110,60,0.55)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - 1.5, py - 4);
          ctx.moveTo(px, py);
          ctx.lineTo(px + 1.5, py - 3.5);
          ctx.stroke();
        }
        break;
      }
      case 'forest': {
        ctx.fillStyle = 'rgba(30,60,45,0.35)';
        diamondPath(ctx, cx, cy + 2, 34, 16);
        ctx.fill();
        for (let i = 0; i < 4; i++) {
          const hx = hash01(seed + i * 13) * 0.62 + 0.19;
          const hy = hash01(seed + i * 23 + 9) * 0.44 + 0.28;
          const px = cx + (hx - 0.5) * 62;
          const py = cy + (hy - 0.5) * 26;
          pine(ctx, px, py, 13 + hash01(seed + i) * 4, i % 2 === 0);
        }
        break;
      }
      case 'desert': {
        for (let i = 0; i < 3; i++) {
          const px = cx + (hash01(seed + i * 7) - 0.5) * 60;
          const py = cy + (hash01(seed + i * 11) - 0.5) * 26;
          ctx.strokeStyle = 'rgba(160,120,60,0.45)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px - 10, py);
          ctx.quadraticCurveTo(px, py - 4, px + 10, py);
          ctx.stroke();
          if (i === 0) {
            ctx.fillStyle = 'rgba(120,150,80,0.8)';
            ctx.fillRect(px + 14, py - 6, 2.4, 7);
            ctx.fillRect(px + 11, py - 3, 3, 1.6);
            ctx.fillRect(px + 16, py - 1, 3, 1.6);
          }
        }
        break;
      }
      case 'mountain': {
        ctx.fillStyle = 'rgba(60,64,72,0.9)';
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + 8);
        ctx.lineTo(cx - 6, cy - 22);
        ctx.lineTo(cx + 6, cy - 9);
        ctx.lineTo(cx + 16, cy + 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(140,146,155,0.95)';
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 22);
        ctx.lineTo(cx + 6, cy - 9);
        ctx.lineTo(cx - 1, cy - 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(240,245,250,0.92)';
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 22);
        ctx.lineTo(cx - 2.5, cy - 15);
        ctx.lineTo(cx - 8, cy - 15.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,44,50,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + 8, cy + 8);
        ctx.lineTo(cx + 15, cy - 6);
        ctx.lineTo(cx + 21, cy + 8);
        ctx.stroke();
        break;
      }
      case 'river': {
        const dirs: [number, number, number, number][] = [
          [1, 0, w, h], [-1, 0, -w, -h],
          [0, 1, -w, h], [0, -1, w, -h],
          [1, 1, 0, h * 2], [-1, -1, 0, -h * 2],
          [1, -1, w * 2, 0], [-1, 1, -w * 2, 0],
        ];
        const links = dirs.filter(([dx, dy]) => {
          const nx = tile.x + dx, ny = tile.y + dy;
          if (nx < 0 || ny < 0 || nx >= game.size || ny >= game.size) return false;
          const nt = game.tiles[ny * game.size + nx].terrain;
          return nt === 'river' || nt === 'ocean' || nt === 'coast';
        });
        const riverLinks = links.length === 1
          ? [links[0], [0, 0, -links[0][2], -links[0][3]] as [number, number, number, number]]
          : links;
        ctx.strokeStyle = 'rgba(34,96,134,0.78)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 12;
        ctx.beginPath();
        if (riverLinks.length === 0) {
          ctx.ellipse(cx, cy, 16, 8, 0, 0, Math.PI * 2);
        } else {
          for (const [, , dx, dy] of riverLinks) { ctx.moveTo(cx, cy); ctx.lineTo(cx + dx, cy + dy); }
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(74,160,198,0.8)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        if (riverLinks.length === 0) {
          ctx.ellipse(cx, cy, 11, 5, 0, 0, Math.PI * 2);
        } else {
          for (const [, , dx, dy] of riverLinks) { ctx.moveTo(cx, cy); ctx.lineTo(cx + dx, cy + dy); }
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(170,225,245,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [, , dx, dy] of riverLinks) { ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 0.8, cy + dy * 0.8); }
        ctx.stroke();
        // Flowing highlights.
        ctx.strokeStyle = `rgba(205,245,255,${0.35 + Math.sin(time * 2 + seed) * 0.12})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 2; i++) {
          const p = (time * 0.22 + i * 0.5 + hash01(seed)) % 1;
          ctx.moveTo(cx - 10 + p * 20, cy - 5 + p * 10);
          ctx.lineTo(cx - 4 + p * 20, cy - 8 + p * 10);
        }
        ctx.stroke();
        break;
      }
      case 'coast': {
        ctx.fillStyle = 'rgba(225,250,255,0.28)';
        ctx.beginPath();
        ctx.ellipse(cx - 22, cy + 4, 18, 5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + 20, cy + 3, 14, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = 'rgba(120,105,80,0.5)';
          ctx.beginPath();
          ctx.arc(cx - 10 + hash01(seed + i) * 30, cy - 4 + hash01(seed + i * 3) * 12, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'geothermal': {
        ctx.fillStyle = 'rgba(52,36,29,0.7)';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 1, 22, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,150,80,0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy + 3);
        ctx.lineTo(cx - 4, cy - 3);
        ctx.lineTo(cx + 3, cy + 2);
        ctx.lineTo(cx + 11, cy - 2);
        ctx.stroke();
        // Vent rocks.
        for (const [dx, dy, r] of [[-12, -5, 4], [9, 4, 3.4], [3, -9, 2.6]] as const) {
          ctx.fillStyle = '#4a352a';
          ctx.beginPath();
          ctx.ellipse(cx + dx, cy + dy, r, r * 0.55, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        // Steam.
        for (let i = 0; i < 3; i++) {
          const p = (time * 0.28 + i * 0.34 + hash01(seed)) % 1;
          ctx.fillStyle = `rgba(235,240,238,${0.22 * (1 - p)})`;
          ctx.beginPath();
          ctx.arc(cx - 2 + Math.sin((p + i) * 4) * 5, cy - 4 - p * 24, 3 + p * 7, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'urban': {
        for (let i = 0; i < 4; i++) {
          const px = cx + (hash01(seed + i * 5) - 0.5) * 54;
          const py = cy + (hash01(seed + i * 9) - 0.5) * 22;
          const hgt = 6 + hash01(seed + i * 13) * 10;
          ctx.fillStyle = ['#8b95a2', '#a5afba', '#6f7a87'][i % 3];
          ctx.fillRect(px - 4, py - hgt, 8, hgt);
          ctx.fillStyle = 'rgba(255,220,140,0.55)';
          ctx.fillRect(px - 2, py - hgt + 2, 1.5, 1.5);
          ctx.fillRect(px + 1, py - hgt + 4, 1.5, 1.5);
        }
        break;
      }
      case 'basin': {
        ctx.strokeStyle = 'rgba(80,68,50,0.7)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx - 24, cy + 6);
        ctx.lineTo(cx - 4, cy + 2);
        ctx.lineTo(cx + 6, cy + 6);
        ctx.stroke();
        ctx.fillStyle = 'rgba(120,110,80,0.9)';
        ctx.beginPath();
        ctx.arc(cx + 10, cy - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }


    if (prefs.overlay === 'power' && tile.owner === 0 && tile.structure) {
      const util = nodeUtil.get(tile.y * 999 + tile.x) ?? 0;
      const powered = tile.structure.kind !== 'line' || util > 0;
      if (powered) {
        ctx.fillStyle = util > 0.92 ? 'rgba(255,150,90,0.10)' : 'rgba(90,235,190,0.09)';
        diamondPath(ctx, cx, cy, w - 2, h - 1);
        ctx.fill();
        ctx.strokeStyle = util > 0.92 ? 'rgba(255,170,110,0.55)' : 'rgba(110,240,195,0.45)';
        ctx.lineWidth = 1.4;
        diamondPath(ctx, cx, cy, w - 3, h - 1.5);
        ctx.stroke();
      }
    }
    // Economy overlay annotations.
    if (prefs.overlay === 'economy') {
      const value = tile.terrain === 'ocean' ? 0 : terrainValue(tile.terrain);
      ctx.fillStyle = `rgba(120,220,255,${value * 0.16})`;
      diamondPath(ctx, cx, cy, w - 2, h - 1);
      ctx.fill();
    }
    if (prefs.overlay === 'power' && tile.structure) {
      const key = tile.y * 999 + tile.x;
      const util = nodeUtil.get(key);
      if (util !== undefined && util > 0.02) {
        ctx.strokeStyle = util > 0.92 ? 'rgba(255,140,90,0.9)' : util > 0.7 ? 'rgba(255,210,110,0.8)' : 'rgba(120,240,180,0.65)';
        ctx.lineWidth = 2;
        diamondPath(ctx, cx, cy, 14, 7);
        ctx.stroke();
      }
    }
    if (prefs.overlay === 'compute' && tile.structure && isDc(tile.structure.kind) && tile.owner === 0 && preview) {
      const dc = preview.dc.find((d) => d.x === tile.x && d.y === tile.y);
      const util = dc ? dc.utilization : 0;
      const bw = 30;
      ctx.fillStyle = 'rgba(8,16,24,0.75)';
      ctx.fillRect(cx - bw / 2, cy - 52, bw, 4);
      ctx.fillStyle = util > 0.97 ? 'rgba(110,240,176,0.95)' : util > 0.6 ? 'rgba(255,207,107,0.95)' : 'rgba(255,120,120,0.95)';
      ctx.fillRect(cx - bw / 2, cy - 52, bw * util, 4);
    }
  }

  private drawFog(tile: Tile) {
    const ctx = this.ctx;
    const w = this.tileWorld(tile.x, tile.y);
    const cy = w.y;
    const info = TERRAIN_INFO[tile.terrain];
    // Silhouette of the terrain so the continent reads as a whole under fog.
    ctx.fillStyle = shade(info.color, tile.terrain === 'ocean' ? -72 : -66);
    diamondPath(ctx, w.x, cy, TW / 2 - 1, TH / 2 - 0.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(7,16,22,0.42)';
    diamondPath(ctx, w.x, cy, TW / 2 - 1, TH / 2 - 0.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,110,130,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const sv = tile.variant;
    ctx.fillStyle = `rgba(120,160,185,${0.035 + hash01(sv) * 0.03})`;
    ctx.beginPath();
    ctx.ellipse(w.x + (hash01(sv + 1) - 0.5) * 34, cy + (hash01(sv + 2) - 0.5) * 12, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (hash01(sv + 5) > 0.5) {
      ctx.beginPath();
      ctx.ellipse(w.x + (hash01(sv + 6) - 0.5) * 24, cy + (hash01(sv + 7) - 0.5) * 10, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawNetwork(
    game: GameState, time: number, nodeUtil: Map<number, number>, preview: DispatchResult | null,
  ) {
    const ctx = this.ctx;
    const size = game.size;
    for (const tile of game.tiles) {
      if (!tile.structure || tile.owner === null) continue;
      if (!tile.explored[0]) continue;
      const kind = tile.structure.kind;
      if (!(kind in STRUCTURES)) continue;
      if (!this.bridge.getPrefs().showGrid) continue;
      const color = game.players[tile.owner].color;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const other = game.tiles[ny * size + nx];
        if (!other.structure || other.owner !== tile.owner || !other.explored[0]) continue;
        if (!isGridAsset(other.structure.kind) || !isGridAsset(kind)) continue;
        const a = this.tileWorld(tile.x, tile.y);
        const b = this.tileWorld(other.x, other.y);
        const ay = a.y - tile.elevation * ELEV - 2;
        const by = b.y - other.elevation * ELEV - 2;
        const yTopA = ay - 26;
        const yTopB = by - 26;
        const util = Math.max(
          nodeUtil.get(tile.y * 999 + tile.x) ?? 0,
          nodeUtil.get(other.y * 999 + other.x) ?? 0,
        );
        const congested = util > 0.92;
        // Sagging transmission cable: dark sheath + energised glow.
        const midY = Math.max(yTopA, yTopB) + 16;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(7,14,20,0.65)';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(a.x, yTopA);
        ctx.quadraticCurveTo((a.x + b.x) / 2, midY, b.x, yTopB);
        ctx.stroke();
        ctx.strokeStyle = congested ? 'rgba(255,150,90,0.95)' : rgba(color, tile.owner === 0 ? 0.9 : 0.45);
        ctx.lineWidth = congested ? 2 : 1.3;
        ctx.beginPath();
        ctx.moveTo(a.x, yTopA);
        ctx.quadraticCurveTo((a.x + b.x) / 2, midY, b.x, yTopB);
        ctx.stroke();
        if (tile.owner === 0) {
          ctx.shadowColor = congested ? 'rgba(255,160,90,0.8)' : rgba(color, 0.8);
          ctx.shadowBlur = 7;
          ctx.strokeStyle = congested ? 'rgba(255,190,120,0.8)' : rgba(color, 0.55);
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(a.x, yTopA);
          ctx.quadraticCurveTo((a.x + b.x) / 2, midY, b.x, yTopB);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // Energised pulse dots.
        if (preview && tile.owner === 0) {
          const flowing = (preview.generation > 0.5);
          if (flowing) {
            for (let k = 0; k < 2; k++) {
              const p = ((time * 0.45 + k * 0.5 + hash01(tile.variant + k) * 0.3) % 1);
              const px = a.x + (b.x - a.x) * p;
              const py = (1 - p) * yTopA + p * yTopB + Math.sin(p * Math.PI) * 16;
              ctx.fillStyle = congested ? 'rgba(255,220,150,0.95)' : rgba(color, 0.95);
              ctx.beginPath();
              ctx.arc(px, py, 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    }
  }

  private drawWeather(kind: string, time: number, cooling: number) {
    const ctx = this.ctx;
    if (kind === 'storm') {
      ctx.fillStyle = 'rgba(20,40,60,0.24)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.strokeStyle = 'rgba(180,220,255,0.35)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 90; i++) {
        const x = (hash01(i * 3) * this.width + time * 320) % this.width;
        const y = (hash01(i * 7) * this.height + time * 520) % this.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 16);
        ctx.stroke();
      }
    } else if (kind === 'cold') {
      ctx.fillStyle = 'rgba(160,210,255,0.07)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = 'rgba(240,250,255,0.5)';
      for (let i = 0; i < 70; i++) {
        const x = (hash01(i * 11) * this.width + Math.sin(time + i) * 30) % this.width;
        const y = (hash01(i * 5) * this.height + time * 22) % this.height;
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'heatwave' || kind === 'drought') {
      const g = ctx.createLinearGradient(0, 0, this.width, this.height);
      g.addColorStop(0, 'rgba(255,170,80,0.05)');
      g.addColorStop(0.6, 'rgba(255,120,40,0.08)');
      g.addColorStop(1, 'rgba(255,90,30,0.03)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.strokeStyle = `rgba(255,200,130,${0.05 + Math.sin(time * 2) * 0.02})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const y = (i / 12) * this.height;
        ctx.beginPath();
        ctx.moveTo(0, y + Math.sin(time + i) * 6);
        ctx.bezierCurveTo(this.width * 0.33, y + 8, this.width * 0.66, y - 8, this.width, y + Math.sin(time * 0.8 + i) * 6);
        ctx.stroke();
      }
    } else if (kind === 'windy') {
      ctx.strokeStyle = 'rgba(200,235,255,0.16)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 16; i++) {
        const y = hash01(i * 13) * this.height;
        const x = (hash01(i * 7) * this.width + time * 260) % (this.width + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 90, y + 6);
        ctx.stroke();
      }
    } else if (kind === 'overcast') {
      ctx.fillStyle = 'rgba(120,140,160,0.10)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = 'rgba(160,180,200,0.05)';
      for (let i = 0; i < 6; i++) {
        const x = ((i * 271 + time * 8) % (this.width + 400)) - 200;
        const y = 60 + hash01(i * 3) * 220;
        ctx.beginPath();
        ctx.ellipse(x, y, 180, 46, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    void cooling;
  }
}

function isGridAsset(kind: StructureKind): boolean {
  return kind in STRUCTURES;
}

function terrainValue(t: Terrain): number {
  switch (t) {
    case 'geothermal': return 1;
    case 'urban': return 0.85;
    case 'river': return 0.8;
    case 'mountain': return 0.7;
    case 'basin': return 0.6;
    case 'coast': return 0.5;
    case 'desert': return 0.55;
    case 'plains': return 0.35;
    case 'forest': return 0.3;
    default: return 0;
  }
}

