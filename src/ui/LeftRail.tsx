import { BAL } from '../engine/config.ts';
import { victoryProgress } from '../engine/simulation.ts';
import { useGame, type Overlay } from '../state/store.ts';
import { Icon } from './Icons.tsx';
import { num, pct } from './format.ts';

const OVERLAYS: { id: Overlay; label: string; icon: 'grid' | 'bolt' | 'chip' | 'layers' | 'coin' }[] = [
  { id: 'none', label: 'Standard view', icon: 'layers' },
  { id: 'power', label: 'Power grid', icon: 'bolt' },
  { id: 'compute', label: 'Compute load', icon: 'chip' },
  { id: 'territory', label: 'Territory', icon: 'grid' },
  { id: 'economy', label: 'Site potential', icon: 'coin' },
];

export function LeftRail() {
  const game = useGame((s) => s.game);
  const preview = useGame((s) => s.preview);
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const setModal = useGame((s) => s.setModal);
  if (!game) return null;
  const vp = victoryProgress(game, 0);
  const me = game.players[0];
  const congested = preview?.nodes.filter((n) => (n.kind === 'line' || n.kind === 'substation') && n.util > 0.92).length ?? 0;
  const surplus = Math.max(0, (preview?.generation ?? 0) - (preview?.demand ?? 0));

  return (
    <div className="left-rail">
      <div className="overlay-switch">
        <div className="title">Map overlays</div>
        {OVERLAYS.map((o) => (
          <button key={o.id} className={`overlay-btn ${overlay === o.id ? 'active' : ''}`} onClick={() => setOverlay(o.id)}>
            <Icon name={o.icon} size={15} />
            {o.label}
          </button>
        ))}
        <div className="title" style={{ marginTop: 4, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          {congested > 0 ? (
            <span style={{ color: 'var(--gold)' }}>{congested} congested asset{congested > 1 ? 's' : ''}</span>
          ) : surplus > 1 ? (
            <span style={{ color: 'var(--muted)' }}>{num(surplus)} MW spare capacity</span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>Grid nominal</span>
          )}
        </div>
      </div>

      <button className="objectives-card interactive" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setModal('objectives')}>
        <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Victory progress</span>
          <Icon name="chevron" size={13} />
        </h4>
        <div className="objective-row">
          <div className="objective-head"><span>Compute dominance</span><span className="val">{pct(me.computeShare)}</span></div>
          <div className="progress"><span style={{ width: `${vp.compute.progress * 100}%` }} /></div>
        </div>
        <div className="objective-row">
          <div className="objective-head"><span>Energy empire</span><span className="val">{Math.round(vp.energy.progress * 100)}%</span></div>
          <div className="progress gold"><span style={{ width: `${vp.energy.progress * 100}%` }} /></div>
        </div>
        <div className="objective-row">
          <div className="objective-head"><span>Technology leadership</span><span className="val">{Math.round(vp.tech.progress * 100)}%</span></div>
          <div className="progress violet"><span style={{ width: `${vp.tech.progress * 100}%` }} /></div>
        </div>
        <div className="objective-head" style={{ marginTop: 10, fontSize: 10.5 }}>
          <span>Empire score</span>
          <span className="val">{num(vp.score)}</span>
        </div>
      </button>

      <div style={{ fontSize: 10.5, color: 'var(--faint)', paddingLeft: 4, lineHeight: 1.6 }}>
        Targets: {Math.round(BAL.dominanceShare * 100)}% compute share for {BAL.dominanceTurns} turns · {BAL.energyCapacity} MW reliable · autonomous fleet tech.
      </div>
    </div>
  );
}
