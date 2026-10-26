import { useState } from 'react';
import { useGame, listSaves } from '../state/store.ts';
import { Icon, LogoMark } from './Icons.tsx';
import { HelpModal } from './Modals.tsx';

export function MainMenu() {
  const startNewGame = useGame((s) => s.startNewGame);
  const continueGame = useGame((s) => s.continueGame);
  const loadSlot = useGame((s) => s.loadSlot);
  const deleteSlot = useGame((s) => s.deleteSlot);
  const [size, setSize] = useState(18);
  const [difficulty, setDifficulty] = useState(1);
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 1_000_000_000)));
  const [help, setHelp] = useState(false);
  const [helpFull, setHelpFull] = useState(false);
  const [showSaves, setShowSaves] = useState(false);
  const saves = listSaves();
  const auto = saves.find((s) => s.id === 'auto');

  const begin = () => {
    const parsed = Number(seed);
    startNewGame({ seed: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined, size, difficulty });
  };

  return (
    <div className="menu-screen">
      <div className="menu-grid-bg" />
      <div className="menu-pulse-line" />
      <div className="menu-inner">
        <div className="menu-hero">
          <div style={{ marginBottom: 18, opacity: 0.9 }}><LogoMark size={52} /></div>
          <div className="menu-kicker"><span className="ping" /> Turn-based infrastructure strategy</div>
          <h1 className="menu-title">GRIDPOWER<span>Build the grid · Control the compute</span></h1>
          <p className="menu-tagline">
            Four AI infrastructure companies. One finite grid. Claim territory, build generation, transmit power and turn
            megawatts into <strong>AI compute</strong> before your rivals corner the market.
          </p>
          <div className="menu-actions">
            <button className="menu-btn primary" onClick={begin}>
              <span>Start new game</span>
              <Icon name="arrow" size={18} className="arrow" />
            </button>
            <button className="menu-btn" onClick={() => { continueGame(); }} disabled={!auto}>
              <span>Continue{auto ? ` · Turn ${auto.turn}` : ' · no save yet'}</span>
              <Icon name="chevron" size={16} className="arrow" />
            </button>
            <button className="menu-btn" onClick={() => setHelp(true)}>
              <span>How to play</span>
              <Icon name="help" size={16} className="arrow" />
            </button>
            <button className="menu-btn" onClick={() => setShowSaves((v) => !v)}>
              <span>Saved games ({saves.length})</span>
              <Icon name="save" size={16} className="arrow" />
            </button>
          </div>
          {showSaves && (
            <div className="menu-saves" style={{ maxHeight: 220 }}>
              {saves.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No local saves yet. Autosave begins with your first game.</div>}
              {saves.map((s) => (
                <div key={s.id} className="save-row">
                  <span>
                    {s.id === 'auto' ? 'Autosave' : s.id} · T{s.turn} · {s.size}×{s.size}
                    <span className="sr-meta"> · {new Date(s.savedAt).toLocaleString()}</span>
                  </span>
                  <span className="sr-actions">
                    <button className="btn small" onClick={() => loadSlot(s.id)}>Load</button>
                    <button className="btn small ghost" onClick={() => { deleteSlot(s.id); setShowSaves(false); }}>Delete</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="menu-side">
          <h3>New game configuration</h3>
          <div className="option-group">
            <label>Map size</label>
            <div className="seg">
              {[[12, 'Duel'], [18, 'Standard'], [24, 'Grand']].map(([v, label]) => (
                <button key={v} className={size === v ? 'active' : ''} onClick={() => setSize(v as number)}>
                  {label}<br /><span style={{ fontSize: 10, opacity: 0.7 }}>{v}×{v}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="option-group">
            <label>Rival competence</label>
            <div className="seg">
              {[[0.7, 'Emerging'], [1, 'Competitive'], [1.3, 'Frontier']].map(([v, label]) => (
                <button key={v} className={difficulty === v ? 'active' : ''} onClick={() => setDifficulty(v as number)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="option-group">
            <label>World seed</label>
            <div className="seed-row">
              <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" />
              <button className="icon-btn" title="Randomise seed" onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000_000)))}>
                <Icon name="flash" size={16} />
              </button>
            </div>
          </div>
          <button className="menu-start" onClick={begin}>Initialise grid</button>
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--faint)', lineHeight: 1.6 }}>
            <Icon name="info" size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            Single-player · offline · deterministic simulation. Three rival companies with distinct strategies.
          </div>
        </div>
      </div>
      <div className="menu-footer">
        <span>GRIDPOWER · a compute-empire strategy game</span>
        <span className="version-chip">v1.0</span>
      </div>
      {helpFull && <HelpModal onClose={() => setHelpFull(false)} />}
      {help && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setHelp(false); }}>
          <div className="modal medium">
            <div className="modal-head">
              <div><div className="eyebrow">Field manual</div><h2>How to play</h2></div>
              <button className="close-x" onClick={() => setHelp(false)}><Icon name="close" size={15} /></button>
            </div>
            <div className="modal-body">
              <HelpContentCompact onFull={() => { setHelp(false); setHelpFull(true); }} />
            </div>
            <div className="modal-foot">
              <span className="muted" style={{ fontSize: 11 }}>You can reopen this any time with H.</span>
              <div className="spacer" />
              <button className="btn primary" onClick={() => setHelp(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HelpContentCompact({ onFull }: { onFull: () => void }) {
  return (
    <div className="help-grid">
      <div className="help-section">
        <h4>Build the chain</h4>
        <ul>
          <li><strong>Claim</strong> tiles bordering your territory.</li>
          <li><strong>Generate</strong> power: solar, wind, gas, hydro, geothermal, nuclear.</li>
          <li><strong>Transmit</strong> with substations and lines — assets must touch to share power.</li>
          <li><strong>Sell compute</strong> from data centers: power → CU → credits.</li>
          <li><strong>Research</strong> efficiency, storage, grid and factory technologies.</li>
        </ul>
      </div>
      <div className="help-section">
        <h4>Compete</h4>
        <ul>
          <li>Three AI companies expand, build and trade on their own strategies.</li>
          <li>Win by compute dominance, energy empire, technology leadership, or the turn-40 score.</li>
          <li>Weather and markets shift every turn. Plan around the forecast.</li>
          <li>Use batteries and flexible policies to profit from volatility.</li>
        </ul>
        <button className="btn primary" style={{ marginTop: 12 }} onClick={onFull}>
          Full manual <Icon name="arrow" size={14} />
        </button>
      </div>
    </div>
  );
}
