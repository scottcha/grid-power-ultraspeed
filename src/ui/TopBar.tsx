import { useGame } from '../state/store.ts';
import { Icon, LogoMark } from './Icons.tsx';
import { money, num, projectIncome, signed } from './format.ts';

export function TopBar() {
  const game = useGame((s) => s.game);
  const preview = useGame((s) => s.preview);
  const setModal = useGame((s) => s.setModal);
  const modal = useGame((s) => s.modal);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  if (!game) return null;
  const me = game.players[0];
  const gen = preview?.generation ?? 0;
  const demand = preview?.demand ?? 0;
  const balance = gen - demand;
  const stability = preview?.stability ?? me.stability;
  const income = projectIncome(game, 0, preview);
  const netIncome = income.net;
  const researchIncome = income.research;
  const projectedCompute = preview?.dc.reduce((a, d) => a + d.compute, 0) ?? me.compute;
  const totalCompute = game.players.reduce((a, p) => a + p.compute, 0) || 1;

  const open = (m: typeof modal) => setModal(modal === m ? 'none' : m);

  return (
    <div className="topbar">
      <div className="brand-block">
        <LogoMark size={38} />
        <div>
          <div className="company-name">
            <span className="swatch" style={{ color: me.color }} />
            {me.company}
          </div>
          <div className="turn-line">
            <span>Turn <strong>{String(game.turn).padStart(2, '0')}</strong> / {game.maxTurns}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: 'var(--muted)' }}>{game.weather.name}</span>
          </div>
        </div>
      </div>

      <div className="resources">
        <div className="res-pill gold" title="Credits — capital for construction, claims and research.">
          <div className="ico"><Icon name="coin" size={17} /></div>
          <div>
            <div className="label">Credits</div>
            <div className="value">{money(me.credits)}</div>
            <div className={`sub ${netIncome >= 0 ? 'good' : 'bad'}`}>{signed(netIncome)}/turn</div>
          </div>
        </div>

        <div className={`res-pill ${balance < 0 ? 'warn' : 'green'}`} title="Power balance — available generation versus data-center demand.">
          <div className="ico"><Icon name="bolt" size={17} /></div>
          <div>
            <div className="label">Power</div>
            <div className="value">{signed(balance, 0)} MW</div>
            <div className="sub">{num(gen)} gen · {num(demand)} load</div>
          </div>
        </div>

        <div className="res-pill" title="Compute — AI workloads delivered this turn.">
          <div className="ico"><Icon name="chip" size={17} /></div>
          <div>
            <div className="label">Compute</div>
            <div className="value">{num(projectedCompute, 1)} CU</div>
            <div className="sub">{Math.round((me.compute / totalCompute) * 100)}% market share</div>
          </div>
        </div>

        <div className="res-pill violet" title="Research — spend it in the technology tree.">
          <div className="ico"><Icon name="research" size={17} /></div>
          <div>
            <div className="label">Research</div>
            <div className="value">{num(me.research)} RP</div>
            <div className="sub">+{num(researchIncome, 1)}/turn</div>
          </div>
        </div>

        <div className={`res-pill ${stability < 45 ? 'red' : stability < 65 ? '' : 'green'}`} title="Grid stability — reserves and reliability of your network.">
          <div className="ico"><Icon name="stability" size={17} /></div>
          <div>
            <div className="label">Stability</div>
            <div className="value">{stability}%</div>
            <div className="sub">{stability >= 65 ? 'Healthy reserves' : stability >= 45 ? 'Thin reserves' : 'Outage risk'}</div>
          </div>
        </div>
      </div>

      <div className="top-actions">
        <button className={`icon-btn ${modal === 'tech' ? 'active' : ''}`} title="Technology tree (T)" onClick={() => open('tech')}>
          <Icon name="research" />
        </button>
        <button className={`icon-btn ${modal === 'market' ? 'active' : ''}`} title="Markets & forecast (M)" onClick={() => open('market')}>
          <Icon name="scale" />
        </button>
        <button className={`icon-btn ${modal === 'empire' ? 'active' : ''}`} title="Empire overview (E)" onClick={() => open('empire')}>
          <Icon name="grid" />
        </button>
        <button className={`icon-btn ${modal === 'objectives' ? 'active' : ''}`} title="Victory objectives (O)" onClick={() => open('objectives')}>
          <Icon name="trophy" />
        </button>
        <button className={`icon-btn ${modal === 'log' ? 'active' : ''}`} title="Event log (L)" onClick={() => open('log')}>
          <Icon name="clock" />
        </button>
        <button className="icon-btn" title={muted ? 'Unmute audio' : 'Mute audio'} onClick={toggleMute}>
          <Icon name={muted ? 'mute' : 'sound'} />
        </button>
        <button className={`icon-btn ${modal === 'help' ? 'active' : ''}`} title="How to play (H)" onClick={() => open('help')}>
          <Icon name="help" />
        </button>
        <button className="icon-btn" title="Menu (Esc)" onClick={() => setModal('pause')}>
          <Icon name="menu" />
        </button>
      </div>
    </div>
  );
}
