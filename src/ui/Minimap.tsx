import { useEffect, useRef } from 'react';
import { TERRAIN_INFO } from '../engine/config.ts';
import { useGame } from '../state/store.ts';

export function Minimap() {
  const game = useGame((s) => s.game);
  const focus = useGame((s) => s.focus);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !game) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 220;
    const size = game.size;
    const cell = Math.floor(W / size);
    const dim = cell * size;
    canvas.width = dim;
    canvas.height = dim;
    ctx.clearRect(0, 0, dim, dim);
    for (const t of game.tiles) {
      const info = TERRAIN_INFO[t.terrain];
      let color = t.terrain === 'ocean' ? '#123246' : info.color;
      if (!t.explored[0]) color = '#0a1720';
      ctx.fillStyle = color;
      ctx.fillRect(t.x * cell, t.y * cell, cell, cell);
      if (t.owner !== null && t.explored[0]) {
        ctx.fillStyle = game.players[t.owner].color;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(t.x * cell, t.y * cell, cell, cell);
        ctx.globalAlpha = 1;
      }
      if (t.structure && t.owner !== null && t.explored[0]) {
        ctx.fillStyle = t.structure.kind.startsWith('dc') ? '#ffffff' : '#0a141c';
        ctx.fillRect(t.x * cell + cell * 0.32, t.y * cell + cell * 0.32, Math.max(1, cell * 0.36), Math.max(1, cell * 0.36));
      }
    }
    ctx.strokeStyle = 'rgba(120,200,225,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, dim - 1, dim - 1);
  }, [game]);

  if (!game) return null;
  return (
    <div
      className="minimap-wrap"
      title="Minimap — click to jump"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * game.size);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * game.size);
        if (x >= 0 && y >= 0 && x < game.size && y < game.size) focus(x, y);
      }}
    >
      <canvas ref={ref} />
      <div className="minimap-label">Grid overview</div>
    </div>
  );
}
