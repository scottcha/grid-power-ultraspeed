import { useEffect, useRef, useState } from 'react';
import { STRUCTURES, TERRAIN_INFO } from '../engine/config.ts';
import { IsoRenderer, type RendererBridge } from '../render/renderer.ts';
import { useGame } from '../state/store.ts';
import { TopBar } from './TopBar.tsx';
import { LeftRail } from './LeftRail.tsx';
import { RightRail } from './RightRail.tsx';
import { TilePanel } from './TilePanel.tsx';
import { Modals } from './Modals.tsx';
import { Toasts } from './Toasts.tsx';
import { coord, money, num, ownerName, structureName, terrainName } from './format.ts';

export function GameView() {
  const game = useGame((s) => s.game);
  const selection = useGame((s) => s.selection);
  const hover = useGame((s) => s.hover);
  const hoverScreen = useGame((s) => s.hoverScreen);
  const endTurn = useGame((s) => s.endTurn);
  const modal = useGame((s) => s.modal);
  const focusRequest = useGame((s) => s.focusRequest);
  const buildKind = useGame((s) => s.buildKind);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IsoRenderer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bridge: RendererBridge = {
      getGame: () => useGame.getState().game,
      getPreview: () => useGame.getState().preview,
      getSelection: () => useGame.getState().selection,
      getHover: () => useGame.getState().hover,
      getBuildKind: () => useGame.getState().buildKind,
      getPrefs: () => ({ overlay: useGame.getState().overlay, showGrid: useGame.getState().showGrid }),
      onClickTile: (x, y) => {
        useGame.getState().selectTile(x, y);
      },
      onHoverTile: (x, y, screen) => useGame.getState().setHover(x, y ?? -1, screen),
      onCameraChange: () => undefined,
    };
    const renderer = new IsoRenderer(canvas, bridge);
    rendererRef.current = renderer;
    renderer.start();
    if (import.meta.env.DEV) {
      window.__gpDebug = {
        camera: () => renderer.getCamera(),
        screenOf: (x, y) => {
          const cam = renderer.getCamera();
          const rect = canvas.getBoundingClientRect();
          return {
            x: ((x - y) * 52 - cam.x) * cam.zoom + rect.width / 2,
            y: ((x + y) * 26 - cam.y) * cam.zoom + rect.height / 2,
          };
        },
        state: () => useGame.getState(),
        center: (x, y) => renderer.centerOnTile(x, y, renderer.getCamera().zoom),
      };
    }
    setReady(true);
    // Re-measure after layout settles.
    requestAnimationFrame(() => renderer.resize());
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Initial / requested camera focus.
  useEffect(() => {
    if (!game || !ready) return;
    if (focusRequest) {
      rendererRef.current?.centerOnTile(focusRequest.x, focusRequest.y, focusRequest.zoom ?? rendererRef.current.getCamera().zoom);
      return;
    }
    const start = game.tiles.find((t) => t.owner === 0 && t.structure?.kind === 'dc_edge') ?? game.tiles.find((t) => t.owner === 0);
    if (start) requestAnimationFrame(() => rendererRef.current?.resetCamera(start.x, start.y));
  }, [focusRequest, ready, game?.seed]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useGame.getState();
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const pan = (dx: number, dy: number) => rendererRef.current?.panByScreen(dx, dy);
      switch (e.key.toLowerCase()) {
        case 'escape':
          if (st.modal !== 'none') st.setModal(st.modal === 'pause' ? 'none' : st.modal === 'summary' ? 'none' : 'none');
          else if (st.selection) st.clearSelection();
          else st.setModal('pause');
          break;
        case 't': st.setModal(st.modal === 'tech' ? 'none' : 'tech'); break;
        case 'm': st.setModal(st.modal === 'market' ? 'none' : 'market'); break;
        case 'e': st.setModal(st.modal === 'empire' ? 'none' : 'empire'); break;
        case 'l': st.setModal(st.modal === 'log' ? 'none' : 'log'); break;
        case 'h': st.setModal(st.modal === 'help' ? 'none' : 'help'); break;
        case 'o': st.setModal(st.modal === 'objectives' ? 'none' : 'objectives'); break;
        case ' ':
          e.preventDefault();
          if (st.modal === 'none' && st.game?.phase === 'player') st.endTurn();
          else if (st.modal === 'summary') st.setModal('none');
          break;
        case 'w': case 'arrowup': pan(0, 80); break;
        case 's': case 'arrowdown': pan(0, -80); break;
        case 'a': case 'arrowleft': pan(80, 0); break;
        case 'd': case 'arrowright': pan(-80, 0); break;
        default: break;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        st.save('manual');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!game) return null;
  const tile = hover ? game.tiles[hover.y * game.size + hover.x] : null;
  const showSummary = modal === 'summary';

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="hud">
        <TopBar />
        <div className="mid-layer">
          <LeftRail />
          <RightRail />
        </div>
        <div className="bottom-layer">
          {selection ? (
            <TilePanel />
          ) : (
            <div className="tile-panel interactive" style={{ maxWidth: 470, alignItems: 'center', textAlign: 'center', padding: '14px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Select a tile to operate</div>
              <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                Click your data center to inspect output, or click an empty owned tile to build.
                Drag to pan · wheel to zoom · <span className="kbd">Space</span> ends the turn.
              </div>
            </div>
          )}
          <button className="end-turn" onClick={endTurn} disabled={game.phase !== 'player' || showSummary}>
            End turn
            <small>Space · rivals move after you</small>
          </button>
        </div>
      </div>

      <Toasts />
      <Modals />

      {hover && tile && tile.explored[0] && !showSummary && modal === 'none' && (
        <div
          className="tooltip"
          style={{
            left: Math.min(window.innerWidth - 290, Math.max(10, hoverScreen.x + 18)),
            top: Math.min(window.innerHeight - 150, Math.max(10, hoverScreen.y + 14)),
          }}
        >
          <h5>
            <span>{tile.structure ? structureName(tile.structure.kind) : terrainName(tile.terrain)}</span>
            <span className="mono" style={{ color: 'var(--faint)', fontSize: 10 }}>{coord(tile.x, tile.y)}</span>
          </h5>
          <div className="tt-sub">{tile.owner === null ? 'Unclaimed territory' : ownerName(game, tile.owner)}</div>
          <div className="tt-rows">
            {tile.terrain !== 'ocean' && (
              <>
                <div className="tt-row"><span>Solar / wind</span><b>×{TERRAIN_INFO[tile.terrain].solar.toFixed(2)} / ×{TERRAIN_INFO[tile.terrain].wind.toFixed(2)}</b></div>
                <div className="tt-row"><span>Cooling PUE</span><b>{TERRAIN_INFO[tile.terrain].cooling >= 0 ? '+' : ''}{Math.round(TERRAIN_INFO[tile.terrain].cooling * 100)}%</b></div>
                {tile.structure && <div className="tt-row"><span>Upkeep</span><b>{money(STRUCTURES[tile.structure.kind].upkeep)}/turn</b></div>}
                {tile.structure?.kind === 'battery' && <div className="tt-row"><span>Stored</span><b>{num(tile.structure.soc ?? 0)} MWh</b></div>}
                {!tile.structure && tile.owner === 0 && <div className="tt-row"><span>Click to build</span><b>available</b></div>}
                {!tile.owner && <div className="tt-row"><span>Need to border</span><b>your territory</b></div>}
              </>
            )}
          </div>
        </div>
      )}

      {buildKind && (
        <div style={{ position: 'fixed', bottom: 104, left: '50%', transform: 'translateX(-50%)', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Placing {STRUCTURES[buildKind].name} — click a highlighted site
        </div>
      )}

    </div>
  );
}

/** Development-only automation seam used by the Playwright validation script. */
declare global {
  interface Window {
    __gpDebug?: {
      camera: () => { x: number; y: number; zoom: number };
      screenOf: (x: number, y: number) => { x: number; y: number };
      state: () => ReturnType<typeof useGame.getState>;
      center: (x: number, y: number) => void;
    };
  }
}
