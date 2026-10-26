import { useMemo } from 'react';
import { BAL, MARKET_EVENTS, POLICY_INFO, STRUCTURES, TECHNOLOGIES, TECH_BRANCH_COLORS } from '../engine/config.ts';
import { isDc } from '../engine/grid.ts';
import { victoryProgress, scorePlayer, AI_PERSONALITY_LABEL } from '../engine/simulation.ts';
import { useGame, listSaves } from '../state/store.ts';
import type { TurnReport } from '../engine/types.ts';
import { Icon } from './Icons.tsx';
import { countStructures, money, num, pct, signed } from './format.ts';

export function ModalShell({ children, title, eyebrow, onClose, size, foot }: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
  onClose?: () => void;
  size?: 'small' | 'medium';
  foot?: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${size ?? ''}`}>
        <div className="modal-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2>{title}</h2>
          </div>
          {onClose && <button className="close-x" onClick={onClose} title="Close"><Icon name="close" size={15} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Modals() {
  const modal = useGame((s) => s.modal);
  const setModal = useGame((s) => s.setModal);
  const game = useGame((s) => s.game);
  if (!game || modal === 'none') return null;
  const close = () => setModal('none');

  switch (modal) {
    case 'tech': return <TechModal onClose={close} />;
    case 'market': return <MarketModal onClose={close} />;
    case 'log': return <LogModal onClose={close} />;
    case 'objectives': return <ObjectivesModal onClose={close} />;
    case 'empire': return <EmpireModal onClose={close} />;
    case 'help': return <HelpModal onClose={close} />;
    case 'pause': return <PauseModal onClose={close} />;
    case 'summary': return <SummaryModal onClose={close} />;
    case 'victory': return <VictoryModal />;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Technology
// ---------------------------------------------------------------------------

function TechModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const research = useGame((s) => s.research);
  const me = game.players[0];
  const branches = ['compute', 'energy', 'optimization', 'infrastructure'] as const;
  return (
    <ModalShell
      title="Technology tree"
      eyebrow={`${num(me.research)} RP available · ${me.techs.length} of ${TECHNOLOGIES.length} technologies complete`}
      onClose={onClose}
      foot={<>
        <span className="muted" style={{ fontSize: 11.5 }}>Research points come from data centers and labs. Each technology applies immediately.</span>
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Close</button>
      </>}
    >
      <div className="tech-layout">
        {branches.map((branch) => (
          <div key={branch} className="tech-branch">
            <h3 style={{ color: TECH_BRANCH_COLORS[branch] }}>
              <span className="dot" /> {branch}
            </h3>
            {TECHNOLOGIES.filter((t) => t.branch === branch).map((t) => {
              const owned = me.techs.includes(t.id);
              const available = t.requires.every((r) => me.techs.includes(r));
              const affordable = me.research >= t.cost;
              return (
                <button
                  key={t.id}
                  className={`tech-node ${owned ? 'owned' : ''} ${available && !owned ? 'available' : ''} ${affordable && available && !owned ? 'affordable' : ''}`}
                  disabled={owned || !available || !affordable}
                  onClick={() => research(t.id)}
                  title={t.blurb}
                >
                  <div className="tn-top">
                    <span className="tn-name">{t.name}</span>
                    <span className="tn-cost">{t.cost} RP</span>
                  </div>
                  <span className="tn-effect">{t.effect}</span>
                  {!available && <span className="tn-req">Requires {t.requires.map((r) => TECHNOLOGIES.find((x) => x.id === r)?.name).join(' + ')}</span>}
                  {owned && <span className="tn-check"><Icon name="check" size={16} /></span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

function MarketModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const preview = useGame((s) => s.preview);
  const m = game.market;
  const next = game.nextMarket;
  const event = m.event;
  const me = game.players[0];
  const dcRevenue = preview?.dc.reduce((a, d) => a + d.revenue, 0) ?? 0;
  const serviceOther = preview?.serviceRevenue ?? 0;
  const power = preview?.surplusRevenue ?? 0;
  const fuel = preview?.fuelCost ?? 0;
  const imports = preview?.importCost ?? 0;
  const upkeep = useMemo(() => {
    let sum = 0;
    for (const t of game.tiles) if (t.owner === 0 && t.structure) sum += STRUCTURES[t.structure.kind].upkeep;
    return sum;
  }, [game.tiles]);

  return (
    <ModalShell title="Energy & compute markets" eyebrow={`Turn ${game.turn} · ${game.weather.name}`} onClose={onClose} size="medium">
      <div className="market-grid">
        <div>
          <div className="market-card">
            <h4>Today's clearing prices</h4>
            <div className="price-row"><span className="muted">AI compute</span><span className="pv gold">${m.computePrice.toFixed(2)} / CU</span></div>
            <div className="price-row"><span className="muted">Wholesale power</span><span className="pv">${m.powerPrice.toFixed(1)} / MWh</span></div>
            <div className="price-row"><span className="muted">Gas fuel</span><span className="pv">${m.fuelPrice.toFixed(1)} / MWh</span></div>
            <div className="price-row"><span className="muted">Grid-service capacity</span><span className="pv">${m.servicePrice.toFixed(1)} / MW</span></div>
            <div className="price-row"><span className="muted">Global compute demand</span><span className="pv">{pct(m.computeDemand)}</span></div>
            {event && (
              <div className="event-box">
                <h5>{event.name}</h5>
                <p>{event.blurb}</p>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="market-card">
            <h4>Next turn forecast</h4>
            <div className="forecast-row"><span>Weather</span><span className="fv">{game.forecast.name}</span></div>
            <div className="forecast-row"><span>Solar factor</span><span className="fv">{Math.round(game.forecast.solar * 100)}%</span></div>
            <div className="forecast-row"><span>Wind factor</span><span className="fv">{Math.round(game.forecast.wind * 100)}%</span></div>
            <div className="forecast-row"><span>Cooling load</span><span className="fv">{game.forecast.cooling >= 0 ? '+' : ''}{Math.round(game.forecast.cooling * 100)}% PUE</span></div>
            <div className="forecast-row"><span>Compute price</span><span className="fv gold">${next.computePrice.toFixed(2)}</span></div>
            <div className="forecast-row"><span>Forecast confidence</span><span className="fv">±12%</span></div>
            <div className="forecast-row"><span>Power price</span><span className="fv">${next.powerPrice.toFixed(1)}</span></div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>{game.forecast.blurb}</p>
          </div>
        </div>
      </div>

      <div className="market-card" style={{ marginTop: 16 }}>
        <h4>Your projected operating result</h4>
        <div className="price-row"><span className="muted">Compute sales</span><span className="pv good">{money(dcRevenue)}</span></div>
        <div className="price-row"><span className="muted">Grid-service payments</span><span className="pv good">{money(serviceOther)}</span></div>
        <div className="price-row"><span className="muted">Surplus power sales</span><span className="pv good">{money(power)}</span></div>
        <div className="price-row"><span className="muted">Facility upkeep</span><span className="pv bad">-{money(upkeep)}</span></div>
        <div className="price-row"><span className="muted">Gas fuel</span><span className="pv bad">-{money(fuel)}</span></div>
        <div className="price-row"><span className="muted">Grid imports</span><span className="pv bad">-{money(imports)}</span></div>
        <div className="price-row"><strong>Net operating profit</strong><span className="pv" style={{ color: dcRevenue + serviceOther + power - upkeep - fuel - imports >= 0 ? 'var(--good)' : 'var(--bad)' }}>{money(dcRevenue + serviceOther + power - upkeep - fuel - imports)}</span></div>
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Compute prices fall as the world's installed compute grows: at {num(game.players.reduce((a, p) => a + p.compute, 0), 0)} CU/turn the market is absorbing supply.
          Flexible data centers earn service income; grid emergencies multiply it ×{MARKET_EVENTS.find((e) => e?.id === 'grid-emergency')?.servicePriceMul}.
        </p>
        <p className="muted" style={{ fontSize: 11 }}>Rule of thumb: one MW of delivered IT capacity at your current efficiency yields about {money((m.computePrice * 1.0) / Math.max(0.5, m.powerPrice * 0.02))} per turn of compute value per 50 MW of grid power. {me.policy === 'flexible' ? 'Your fleet is in flexible mode.' : 'Consider flexible policy during emergencies.'}</p>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

function LogModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  return (
    <ModalShell title="Event log" eyebrow="Grid operations, markets, rival activity" onClose={onClose} size="medium">
      <div className="log-list">
        {game.log.map((e, i) => (
          <div key={i} className={`log-entry ${e.kind}`}>
            <span className="le-turn">T{e.turn}</span>
            <span className="le-dot" />
            <span className="le-text">{e.text}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

function ObjectivesModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const vp = victoryProgress(game, 0);
  const me = game.players[0];
  return (
    <ModalShell title="Victory objectives" eyebrow={`Turn ${game.turn} of ${game.maxTurns} · score victory available at the end`} onClose={onClose}>
      <div className="help-grid">
        <div className="help-section">
          <h4>Compute dominance</h4>
          <p>Hold at least {Math.round(BAL.dominanceShare * 100)}% of the world compute market for {BAL.dominanceTurns} consecutive turns.</p>
          <div className="progress" style={{ margin: '10px 0' }}><span style={{ width: `${vp.compute.progress * 100}%` }} /></div>
          <p className="mono" style={{ fontSize: 11.5 }}>{vp.compute.label} · streak {vp.compute.streak}/{BAL.dominanceTurns}</p>
        </div>
        <div className="help-section">
          <h4>Energy empire</h4>
          <p>Operate {BAL.energyCapacity} MW of generation with {BAL.energyStability}+ stability and {money(BAL.energyCredits)} in the bank.</p>
          <div className="progress gold" style={{ margin: '10px 0' }}><span style={{ width: `${vp.energy.progress * 100}%` }} /></div>
          <p className="mono" style={{ fontSize: 11.5 }}>{vp.energy.label}</p>
        </div>
        <div className="help-section">
          <h4>Technology leadership</h4>
          <p>Research Autonomous Fleet Optimization and sustain {BAL.techComputeTarget} CU/turn for {BAL.techComputeTurns} turns.</p>
          <div className="progress violet" style={{ margin: '10px 0' }}><span style={{ width: `${vp.tech.progress * 100}%` }} /></div>
          <p className="mono" style={{ fontSize: 11.5 }}>{vp.tech.label}</p>
        </div>
        <div className="help-section">
          <h4>Final score · turn {game.maxTurns}</h4>
          <p>If no empire wins earlier, the highest score takes the grid: credits, compute, capacity, technologies and market share.</p>
          <p className="mono" style={{ fontSize: 11.5 }}>Your score: {num(vp.score)}</p>
        </div>
      </div>

      <h3 style={{ margin: '22px 0 10px', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--faint)' }}>Standings</h3>
      <table className="history-table">
        <thead>
          <tr><th>Company</th><th>Compute</th><th>Share</th><th>Capacity</th><th>Credits</th><th>Techs</th><th>Score</th></tr>
        </thead>
        <tbody>
          {[...game.players].sort((a, b) => scorePlayer(b) - scorePlayer(a)).map((p) => (
            <tr key={p.id} style={{ color: p.id === 0 ? 'var(--accent)' : undefined }}>
              <td style={{ fontFamily: 'inherit' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
                  {p.company}
                </span>
              </td>
              <td>{num(p.compute, 0)}</td>
              <td>{pct(p.computeShare)}</td>
              <td>{num(p.capacity)} MW</td>
              <td>{money(p.credits)}</td>
              <td>{p.techs.length}</td>
              <td>{num(scorePlayer(p))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>You are {me.company}. Rivals pursue different strategies: {game.players.filter((p) => p.isAI).map((p) => `${p.company} (${AI_PERSONALITY_LABEL[p.personality]})`).join(' · ')}.</p>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Empire
// ---------------------------------------------------------------------------

function EmpireModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const preview = useGame((s) => s.preview);
  const me = game.players[0];
  const counts = countStructures(game, 0);
  const tiles = game.tiles.filter((t) => t.owner === 0).length;
  const dcs = game.tiles.filter((t) => t.owner === 0 && t.structure && isDc(t.structure.kind));
  const history = me.history.slice(-12);
  const assetOrder = Object.keys(STRUCTURES) as (keyof typeof STRUCTURES)[];
  return (
    <ModalShell title="Empire overview" eyebrow={`${tiles} tiles · ${dcs.length} data centers · ${num(me.capacity)} MW`} onClose={onClose}>
      <div className="empire-grid">
        <div className="market-card">
          <h4>Assets</h4>
          <div className="asset-list">
            {assetOrder.filter((k) => counts[k]).map((k) => (
              <div key={k} className="asset-line">
                <span className="al"><span style={{ width: 6, height: 6, borderRadius: 2, background: STRUCTURES[k].category === 'gen' ? 'var(--gold)' : STRUCTURES[k].category === 'dc' ? 'var(--accent)' : 'var(--muted)' }} />{STRUCTURES[k].name}</span>
                <span className="av">{counts[k]}</span>
              </div>
            ))}
            <div className="asset-line"><span className="al">Territory</span><span className="av">{tiles} tiles</span></div>
          </div>
        </div>
        <div className="market-card">
          <h4>Operating snapshot</h4>
          <div className="price-row"><span className="muted">Generation</span><span className="pv">{num(preview?.generation ?? 0)} MW</span></div>
          <div className="price-row"><span className="muted">Demand</span><span className="pv">{num(preview?.demand ?? 0)} MW</span></div>
          <div className="price-row"><span className="muted">Surplus sold</span><span className="pv">{num(preview?.surplusSold ?? 0)} MWh</span></div>
          <div className="price-row"><span className="muted">Compute output</span><span className="pv gold">{num(me.compute, 1)} CU</span></div>
          <div className="price-row"><span className="muted">Stability</span><span className="pv">{preview?.stability ?? me.stability}%</span></div>
          <div className="price-row"><span className="muted">Research income</span><span className="pv">+{num(me.history.at(-1)?.research ?? 0, 1)} RP</span></div>
          <div className="price-row"><span className="muted">Grid islands</span><span className="pv">{preview?.islands.length ?? 0}</span></div>
        </div>
      </div>

      <div className="market-card" style={{ marginTop: 12 }}>
        <h4>Electrical islands</h4>
        {(preview?.islands ?? []).length === 0 && <p className="muted" style={{ fontSize: 11.5 }}>No grid assets yet.</p>}
        {(preview?.islands ?? []).slice(0, 6).map((isl, i) => {
          const congested = preview?.nodes.some((n) => n.island === isl.id && n.util > 0.92);
          return (
            <div key={isl.id} className="price-row">
              <span className="muted">Island {i + 1} · {isl.tiles.length} assets {isl.hasSubstation ? '' : '(isolated)'}</span>
              <span className="pv" style={{ color: congested ? 'var(--gold)' : isl.hasSubstation ? 'var(--good)' : 'var(--bad)' }}>
                {num(isl.supply)} / {num(isl.demand)} MW{congested ? ' · congested' : ''}
              </span>
            </div>
          );
        })}
        <p className="muted" style={{ fontSize: 10.5, margin: '6px 0 0' }}>
          Islands are formed by orthogonally touching grid assets. Substations anchor islands and cap their throughput.
        </p>
      </div>

      <div className="market-card" style={{ marginTop: 12 }}>
        <h4>Fleet operating policy</h4>
        <div className="policy-btns">
          {(Object.keys(POLICY_INFO) as (keyof typeof POLICY_INFO)[]).map((p) => (
            <button key={p} className={`policy-btn ${me.policy === p ? 'active' : ''}`} title={POLICY_INFO[p].blurb} onClick={() => useGame.getState().setPolicy(p)}>
              {POLICY_INFO[p].name}
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>Applies to every data center you own. Per-site overrides can be set from the tile panel.</p>
      </div>

      <div className="market-card" style={{ marginTop: 12 }}>
        <h4>Recent performance</h4>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="muted" style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Net profit / turn</div>
            <Sparkline values={history.map((h) => h.net)} color="#5ce1f2" />
          </div>
          <div>
            <div className="muted" style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Compute output</div>
            <Sparkline values={history.map((h) => h.compute)} color="#ffcf6b" />
          </div>
          <div>
            <div className="muted" style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Fleet capacity</div>
            <Sparkline values={history.map((h) => h.capacity)} color="#b388ff" />
          </div>
        </div>
        <table className="history-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Turn</th><th>Gen</th><th>Demand</th><th>Compute</th><th>Revenue</th><th>Opex</th><th>Net</th><th>Stability</th></tr></thead>
          <tbody>
            {history.slice().reverse().map((h) => (
              <tr key={h.turn}>
                <td>T{h.turn}</td><td>{num(h.generation)}</td><td>{num(h.demand)}</td><td>{num(h.compute)}</td>
                <td>{money(h.revenue)}</td><td>{money(h.opex)}</td><td className={h.net >= 0 ? 'good' : 'bad'}>{signed(h.net)}</td><td>{h.stability}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div style={{ height: 54, display: 'flex', alignItems: 'center', color: 'var(--faint)', fontSize: 11 }}>Waiting for more turns…</div>;
  const w = 170, h = 54, pad = 4;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const pts = values.map((v, i) => `${pad + (i / (values.length - 1)) * (w - pad * 2)},${h - pad - ((v - min) / range) * (h - pad * 2)}`).join(' ');
  const zero = h - pad - ((0 - min) / range) * (h - pad * 2);
  return (
    <svg width={w} height={h} className="spark-wrap">
      <line x1={pad} x2={w - pad} y1={zero} y2={zero} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 3" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pad + (w - pad * 2)} cy={h - pad - ((values.at(-1)! - min) / range) * (h - pad * 2)} r="2.5" fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="How to play" eyebrow="Five minutes to a working grid" onClose={onClose} size="medium">
      <div className="help-grid">
        <div className="help-section">
          <h4>The loop</h4>
          <ul>
            <li><strong>Power → Compute → Credits.</strong> Generators make MW. Data centers convert delivered MW into CU. Compute sells at market prices.</li>
            <li><strong>Grid adjacency matters.</strong> A building must touch your substation, a transmission line, or another powered asset. Lines and substations have throughput limits.</li>
            <li><strong>Claim land</strong> bordering your territory. Costs rise as your empire grows; valuable sites cost more.</li>
            <li><strong>Research</strong> raises compute-per-MW, unlocks hyperscale campuses and gigafactories, adds storage, and strengthens the grid.</li>
            <li><strong>End turn</strong> to resolve weather, dispatch, storage, revenue and rival moves.</li>
          </ul>
        </div>
        <div className="help-section">
          <h4>Strategy notes</h4>
          <ul>
            <li>Solar is cheap on desert; wind is strong on mountains and coast; rivers host hydro; geothermal is always-on baseload.</li>
            <li>Batteries buy and store surplus, cover shortfalls, and stabilise islands.</li>
            <li>Policies change utilization: flexible sites earn grid-service income during emergencies; compute policy maximises CU.</li>
            <li>Compute prices fall as the world's installed compute grows — efficiency and market timing beat raw volume.</li>
            <li>Win by compute dominance, energy empire, technology leadership, or final score at turn {BAL.maxTurns}.</li>
          </ul>
        </div>
        <div className="help-section">
          <h4>Controls</h4>
          <ul>
            <li><span className="kbd">Drag</span> pan · <span className="kbd">Wheel</span> zoom · <span className="kbd">WASD</span>/arrows pan</li>
            <li><span className="kbd">Click</span> select tile · <span className="kbd">Esc</span> deselect / menu</li>
            <li><span className="kbd">T</span> tech · <span className="kbd">M</span> market · <span className="kbd">E</span> empire · <span className="kbd">L</span> log · <span className="kbd">H</span> help</li>
            <li><span className="kbd">Space</span> end turn · <span className="kbd">Ctrl+S</span> save</li>
          </ul>
        </div>
        <div className="help-section">
          <h4>Reading the world</h4>
          <ul>
            <li><strong>Glowing cables</strong> show your live power network; amber means congestion.</li>
            <li><strong>Colored territory borders</strong> belong to companies. Neutral substations are free strategic assets.</li>
            <li><strong>Overlays</strong> (left) reveal power flow, compute load, territory and site potential.</li>
            <li><strong>Weather forecast</strong> (right) tells you what renewables will do next turn.</li>
            <li>Tooltips explain every tile, building and resource.</li>
          </ul>
        </div>
      </div>
      <div className="modal-foot" style={{ padding: '14px 0 0' }}>
        <span className="muted" style={{ fontSize: 11 }}>Tip: the first five turns are about establishing a 2:1 power-to-compute balance, then compounding efficiency.</span>
        <div className="spacer" />
        <button className="btn primary" onClick={onClose}>Got it</button>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Pause / settings
// ---------------------------------------------------------------------------

function PauseModal({ onClose }: { onClose: () => void }) {
  const save = useGame((s) => s.save);
  const quit = useGame((s) => s.quitToMenu);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const showGrid = useGame((s) => s.showGrid);
  const toggleGrid = useGame((s) => s.toggleGrid);
  const saves = listSaves();
  const loadSlot = useGame((s) => s.loadSlot);
  return (
    <ModalShell title="Paused" eyebrow="Grid operations suspended" onClose={onClose} size="small">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn primary" onClick={onClose}><Icon name="arrow" size={15} /> Resume operations</button>
        <button className="btn" onClick={() => { save('manual'); }}><Icon name="save" size={15} /> Save game</button>
        <button className="btn" onClick={() => { toggleMute(); }}><Icon name={muted ? 'mute' : 'sound'} size={15} /> {muted ? 'Enable' : 'Mute'} audio</button>
        <button className="btn" onClick={toggleGrid}><Icon name="bolt" size={15} /> {showGrid ? 'Hide' : 'Show'} power lines</button>
        <button className="btn" onClick={() => useGame.getState().setModal('help')}><Icon name="help" size={15} /> How to play</button>
        <button className="btn ghost" onClick={quit}><Icon name="close" size={15} /> Quit to main menu</button>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 14 }}>
        Autosaves after every action. Local slots:
      </div>
      <div className="menu-saves" style={{ marginTop: 6 }}>
        {saves.slice(0, 6).map((s) => (
          <div key={s.id} className="save-row">
            <span>{s.id === 'auto' ? 'Autosave' : s.id} <span className="sr-meta">· T{s.turn} · {new Date(s.savedAt).toLocaleTimeString()}</span></span>
            <button className="btn small" onClick={() => loadSlot(s.id)}>Load</button>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function SummaryModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const report = game.summary;
  if (!report) return null;
  return (
    <ModalShell
      title={`Turn ${report.turn} report`}
      eyebrow={`${game.weather.name} · ${game.market.event ? game.market.event.name : 'Markets stable'}`}
      onClose={onClose}
      foot={<>
        <span className="muted" style={{ fontSize: 11.5 }}>Turn {game.turn} begins now.</span>
        <div className="spacer" />
        <button className="btn primary" onClick={onClose}>Continue <Icon name="arrow" size={15} /></button>
      </>}
    >
      <SummaryBody report={report} />
    </ModalShell>
  );
}

function SummaryBody({ report }: { report: TurnReport }) {
  const delta = report.creditsEnd - report.creditsStart;
  return (
    <>
      <div className="summary-hero">
        <div>
          <div className="summary-title">Operations resolved</div>
          <div className="summary-sub">{report.notes.length ? 'Grid notes below · everything compounds from here' : 'A clean turn — no incidents reported'}</div>
        </div>
        <div className={`profit-big ${delta >= 0 ? 'good' : 'bad'}`}>{signed(delta)}</div>
      </div>
      <div className="summary-grid">
        <Stat k="Generation" v={`${num(report.generation)} MW`} />
        <Stat k="Demand" v={`${num(report.demand)} MW`} />
        <Stat k="Delivered" v={`${num(report.delivered)} MW`} tone={report.delivered < report.demand * 0.98 ? 'bad' : 'good'} />
        <Stat k="Compute" v={`${num(report.compute, 1)} CU`} />
        <Stat k="Compute revenue" v={money(report.computeRevenue)} />
        <Stat k="Power sales" v={money(report.powerRevenue)} />
        <Stat k="Grid services" v={money(report.serviceRevenue)} />
        <Stat k="Operating cost" v={`-${money(report.opex)}`} tone="bad" />
        <Stat k="Research" v={`+${num(report.research, 1)} RP`} />
        <Stat k="Stability" v={`${report.stability}%`} tone={report.stability >= 65 ? 'good' : 'bad'} />
        <Stat k="Treasury" v={money(report.creditsEnd)} />
        <Stat k="Cash change" v={signed(delta)} tone={delta >= 0 ? 'good' : 'bad'} />
      </div>
      {(report.notes.length > 0 || report.rivalHighlights.length > 0) && (
        <div className="notes">
          {report.notes.map((n, i) => (
            <div key={i} className="note-line"><span className="bullet">◆</span>{n}</div>
          ))}
          {report.rivalHighlights.map((n, i) => (
            <div key={`r${i}`} className="note-line" style={{ color: '#c7a9a0' }}><span className="bullet" style={{ color: '#ff9a6b' }}>◇</span>{n}</div>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="summary-stat">
      <div className="k">{k}</div>
      <div className={`v ${tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : ''}`}>{v}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Victory
// ---------------------------------------------------------------------------

function VictoryModal() {
  const game = useGame((s) => s.game)!;
  const startNewGame = useGame((s) => s.startNewGame);
  const quit = useGame((s) => s.quitToMenu);
  const v = game.victory;
  const won = v.winner === 0;
  const winner = v.winner !== null ? game.players[v.winner] : null;
  return (
    <ModalShell title={won ? 'Victory' : 'Defeat'} eyebrow={`${v.condition ?? ''} victory · turn ${game.turn - 1}`} size="small">
      <div className="victory-screen">
        <div className="crown"><Icon name="trophy" size={46} /></div>
        <h2>{winner ? winner.company : 'Unclaimed'}</h2>
        <div className="vsub">{v.title}</div>
        <p>{v.detail}</p>
        <div className="victory-stats">
          <div className="vs"><div className="k">Your compute</div><div className="v">{num(game.players[0].compute, 0)} CU</div></div>
          <div className="vs"><div className="k">Your score</div><div className="v">{num(scorePlayer(game.players[0]))}</div></div>
          <div className="vs"><div className="k">Technologies</div><div className="v">{game.players[0].techs.length}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => startNewGame({})}><Icon name="plus" size={15} /> New game</button>
          <button className="btn" onClick={quit}>Main menu</button>
        </div>
      </div>
    </ModalShell>
  );
}
