import { useGame } from '../state/store.ts';
import { Minimap } from './Minimap.tsx';
import { money, num } from './format.ts';

export function RightRail() {
  const game = useGame((s) => s.game);
  const setModal = useGame((s) => s.setModal);
  if (!game) return null;
  const m = game.market;
  const next = game.nextMarket;
  return (
    <div className="right-rail">
      <Minimap />
      <button className="market-glance interactive" onClick={() => setModal('market')}>
        <div className="row"><span className="k">Compute price</span><span className="v gold">${m.computePrice.toFixed(2)}<span style={{ color: 'var(--faint)' }}>/CU</span></span></div>
        <div className="row"><span className="k">Power price</span><span className="v">${m.powerPrice.toFixed(1)}<span style={{ color: 'var(--faint)' }}>/MWh</span></span></div>
        <div className="row"><span className="k">Next turn compute</span><span className="v" style={{ color: next.computePrice >= m.computePrice ? 'var(--good)' : 'var(--bad)' }}>${next.computePrice.toFixed(2)}</span></div>
        <div className="row"><span className="k">Forecast</span><span className="v" style={{ fontFamily: 'inherit', color: 'var(--muted)' }}>{game.forecast.name}</span></div>
        {m.event ? <div className="event">{m.event.name} — click for market detail</div> : <div className="event" style={{ color: 'var(--muted)' }}>Markets stable · click for forecast</div>}
        <div className="row" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
          <span className="k">Treasury</span><span className="v">{money(game.players[0].credits)}</span>
        </div>
        <div className="row"><span className="k">Fleet</span><span className="v">{num(game.players[0].capacity)} MW</span></div>
      </button>
    </div>
  );
}
