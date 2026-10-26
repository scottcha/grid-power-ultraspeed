import { useEffect, useState } from 'react';
import { STRUCTURES, TERRAIN_INFO, POLICY_INFO, DCS } from '../engine/config.ts';
import { isDc, isGen, pueWithWeather, playerModifiers, genOutput, GRID_KINDS } from '../engine/grid.ts';
import { useGame } from '../state/store.ts';
import type { StructureKind } from '../engine/types.ts';
import { Icon } from './Icons.tsx';
import { coord, money, num, pct, signed, structureBlurb, structureName } from './format.ts';

type Tab = 'all' | 'compute' | 'power' | 'grid' | 'support';

export function TilePanel() {
  const game = useGame((s) => s.game);
  const preview = useGame((s) => s.preview);
  const selection = useGame((s) => s.selection);
  const setBuildKind = useGame((s) => s.setBuildKind);
  const buildSelected = useGame((s) => s.buildSelected);
  const claimSelected = useGame((s) => s.claimSelected);
  const upgradeSelected = useGame((s) => s.upgradeSelected);
  const setPolicy = useGame((s) => s.setPolicy);
  const selectionInfo = useGame((s) => s.selectionInfo);
  const clearSelection = useGame((s) => s.clearSelection);
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => setTab('all'), [selection?.x, selection?.y]);

  if (!game || !selection) return null;
  const tile = game.tiles[selection.y * game.size + selection.x];
  const info = selectionInfo();
  if (!tile || !info) return null;
  const me = game.players[0];
  const mods = playerModifiers(me);
  const structure = tile.structure;
  const ownerColor = tile.owner !== null ? game.players[tile.owner].color : '#7d95a5';
  const ownerLabel = tile.owner === null ? 'Unclaimed' : tile.owner === 0 ? 'Your territory' : game.players[tile.owner].company;
  const terrain = TERRAIN_INFO[tile.terrain];
  const dcDispatch = preview?.dc.find((d) => d.x === tile.x && d.y === tile.y);
  const node = preview?.nodes.find((n) => n.x === tile.x && n.y === tile.y);
  const island = preview?.islands.find((i) => i.tiles.some((t) => t.x === tile.x && t.y === tile.y));

  const categories: Record<Tab, (k: StructureKind) => boolean> = {
    all: () => true,
    compute: (k) => STRUCTURES[k].category === 'dc',
    power: (k) => STRUCTURES[k].category === 'gen',
    grid: (k) => STRUCTURES[k].category === 'grid',
    support: (k) => STRUCTURES[k].category === 'storage' || STRUCTURES[k].category === 'lab',
  };
  const buildCards = info.structures.filter((o) => categories[tab](o.kind));
  const title = structure ? structureName(structure.kind) : terrain.name;
  const connectedNeighbour = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ].some(([dx, dy]) => {
    const nx = tile.x + dx;
    const ny = tile.y + dy;
    if (nx < 0 || ny < 0 || nx >= game.size || ny >= game.size) return false;
    const n = game.tiles[ny * game.size + nx];
    return n.owner === 0 && n.structure && GRID_KINDS[n.structure.kind];
  });

  return (
    <div className="tile-panel interactive">
      <div className="tile-head">
        <div className="tile-title">
          <h2>{title}</h2>
          <span className="coord">{coord(tile.x, tile.y)}</span>
          <span className="owner-badge" style={{ color: ownerColor }}>
            <span className="swatch" />
            {ownerLabel}
          </span>
          {tile.structure && tile.owner === 0 ? (
            <span className="owner-badge" style={{ color: connectedNeighbour ? 'var(--good)' : 'var(--bad)' }}>
              {connectedNeighbour ? 'Grid connected' : 'No grid link'}
            </span>
          ) : null}
        </div>
        <button className="close-x" onClick={clearSelection} title="Close (Esc)"><Icon name="close" size={15} /></button>
      </div>

      <p className="tile-blurb">{structure ? structureBlurb(structure.kind) : terrain.blurb}</p>

      {/* Structure details */}
      {structure && tile.owner === 0 && (
        <>
          {isDc(structure.kind) && dcDispatch && (
            <div className="bal-row">
              <Chip k="IT capacity" v={`${num(DCS[structure.kind].it)} MW`} />
              <Chip k="PUE" v={pueWithWeather(tile, mods, game.weather).toFixed(2)} />
              <Chip k="Throughput" v={`${pct(dcDispatch.utilization)}`} tone={dcDispatch.utilization < 0.98 ? 'warn' : 'good'} />
              <Chip k="Compute" v={`${num(dcDispatch.compute, 1)} CU`} />
              <Chip k="Revenue" v={`${money(dcDispatch.revenue)}/turn`} tone="good" />
              <Chip k="Power draw" v={`${num(dcDispatch.demand)} MW`} />
            </div>
          )}
          {isGen(structure.kind) && (
            <div className="bal-row">
              <Chip k="Output" v={`${num(genOutput(tile, me, game.weather)?.available ?? 0, 1)} MW`} />
              <Chip k="Nameplate" v={`${STRUCTURES[structure.kind].capacity} MW`} />
              <Chip k="Weather" v={`${Math.round(game.weather.solar * 100)}% sun · ${Math.round(game.weather.wind * 100)}% wind`} />
              <Chip k="Upkeep" v={`${money(STRUCTURES[structure.kind].upkeep)}/turn`} />
            </div>
          )}
          {structure.kind === 'battery' && (
            <div className="bal-row">
              <Chip k="State of charge" v={`${num(structure.soc ?? 0)} MWh`} />
              <Chip k="Storage" v={`${num(130 * (me.techs.includes('batteries_hd') ? 1.5 : 1))} MWh`} />
              <Chip k="Power rating" v={`${num(40 * (me.techs.includes('batteries_hd') ? 1.5 : 1))} MW`} />
              <Chip k="Island" v={island ? `${island.tiles.length} assets` : 'isolated'} />
            </div>
          )}
          {(structure.kind === 'substation' || structure.kind === 'line') && (
            <div className="bal-row">
              <Chip k="Throughput" v={`${num(node?.flow ?? 0)} / ${num(node?.cap ?? 0)} MW`} tone={(node?.util ?? 0) > 0.92 ? 'warn' : 'good'} />
              <Chip k="Utilization" v={pct(node?.util ?? 0)} />
              <Chip k="Island supply" v={island ? `${num(island.supply)} MW` : '—'} />
              <Chip k="Island load" v={island ? `${num(island.demand)} MW` : '—'} />
              <Chip k="Island" v={island ? `${island.tiles.length} assets · ${island.hasSubstation ? 'anchored' : 'unanchored'}` : 'isolated'} />
              <Chip k="Upkeep" v={`${money(STRUCTURES[structure.kind].upkeep)}/turn`} />
            </div>
          )}
          {structure.kind === 'lab' && (
            <div className="bal-row">
              <Chip k="Research" v="+12 RP/turn" tone="good" />
              <Chip k="Power draw" v="3 MW" />
              <Chip k="Upkeep" v={`${money(STRUCTURES[structure.kind].upkeep)}/turn`} />
            </div>
          )}

          {isDc(structure.kind) && (
            <div className="policy-row">
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--faint)' }}>
                Operating policy {structure.policy !== me.policy ? '(custom for this site)' : '(fleet default)'}
              </span>
              <div className="policy-btns">
                {(Object.keys(POLICY_INFO) as (keyof typeof POLICY_INFO)[]).map((p) => (
                  <button
                    key={p}
                    className={`policy-btn ${((structure.policy ?? me.policy) === p) ? 'active' : ''}`}
                    title={POLICY_INFO[p].blurb}
                    onClick={() => setPolicy(p)}
                  >
                    {POLICY_INFO[p].name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="action-row">
            {isDc(structure.kind) && DCS[structure.kind].upgradeTo && (
              <button className="btn primary" onClick={upgradeSelected} disabled={!info.canUpgradeNow}>
                <Icon name="arrow" size={14} />
                Upgrade to {DCS[DCS[structure.kind].upgradeTo!].name} · {money(info.upgradeCost)}
              </button>
            )}
            {isDc(structure.kind) && DCS[structure.kind].upgradeTo && !info.canUpgradeNow && info.upgradeReason && (
              <span className="muted" style={{ fontSize: 11.5 }}>{info.upgradeReason}</span>
            )}
            <span className="muted" style={{ fontSize: 11 }}>
              {isDc(structure.kind)
                ? `${num(DCS[structure.kind].eff * mods.compute * POLICY_INFO[(structure.policy ?? me.policy) as keyof typeof POLICY_INFO].compute, 2)} CU per MW of IT · ${game.weather.kind === 'heatwave' ? 'heatwave cooling penalty active' : 'cooling conditions nominal'}`
                : `Upkeep ${money(STRUCTURES[structure.kind].upkeep)}/turn`}
            </span>
          </div>
        </>
      )}

      {/* Claim action */}
      {!tile.structure && !info.owned && info.claimable && (
        <div className="action-row">
          <button className="btn primary" onClick={claimSelected} disabled={!info.canClaimNow}>
            <Icon name="plus" size={14} />
            Claim territory · {money(info.claimCost)}
          </button>
          {!info.canClaimNow && info.reasonClaim && <span className="muted" style={{ fontSize: 11.5 }}>{info.reasonClaim}</span>}
          <span className="muted" style={{ fontSize: 11 }}>Claiming reveals the surrounding area and opens new construction sites.</span>
        </div>
      )}

      {/* Build menu */}
      {info.canBuildHere && (
        <>
          <div className="build-tabs">
            {([
              ['all', 'All'],
              ['compute', 'Compute'],
              ['power', 'Power'],
              ['grid', 'Grid'],
              ['support', 'Storage & research'],
            ] as [Tab, string][]).map(([id, label]) => (
              <button key={id} className={`build-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                {label}
                <span className="count">{info.structures.filter((o) => categories[id](o.kind)).length}</span>
              </button>
            ))}
          </div>
          <div className="build-grid" onMouseLeave={() => setBuildKind(null)}>
            {buildCards.map((o) => {
              const def = STRUCTURES[o.kind];
              const disabled = !o.unlocked || !!o.reason || me.credits < o.cost;
              const reason = !o.unlocked ? o.reason : me.credits < o.cost ? 'Not enough credits' : o.reason;
              return (
                <button
                  key={o.kind}
                  className={`build-card ${def.category === 'gen' ? 'gen' : ''}`}
                  disabled={disabled}
                  onMouseEnter={() => !disabled && setBuildKind(o.kind)}
                  onClick={() => buildSelected(o.kind)}
                  title={o.blurb}
                >
                  <span className="bc-cat" />
                  <span className="bc-top">
                    <span className="bc-name">{o.name}</span>
                    <span className="bc-cost">{money(o.cost)}</span>
                  </span>
                  <span className="bc-stats">{o.stats}</span>
                  <span className="bc-blurb">{o.blurb}</span>
                  {disabled && reason && <span className="bc-lock"><Icon name="lock" size={11} />{reason}</span>}
                </button>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: 10.5 }}>
            Construction is instant. Adjacent grid assets share power — chain lines and substations to reach remote sites.
          </div>
        </>
      )}

      {!info.owned && !info.claimable && (
        <div className="muted" style={{ fontSize: 11.5 }}>
          {tile.owner === null
            ? 'This tile does not border your territory. Expand outward one tile at a time.'
            : `${game.players[tile.owner!]?.company ?? 'A rival'} controls this asset. Out-compete them economically.`}
        </div>
      )}

      {info.owned && !tile.structure && (
        <div className="muted" style={{ fontSize: 11 }}>
          Site modifiers: solar ×{terrain.solar.toFixed(2)} · wind ×{terrain.wind.toFixed(2)} · cooling {signed(terrain.cooling * 100)}% PUE · build cost ×{terrain.build.toFixed(2)}
        </div>
      )}
    </div>
  );
}

function Chip({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="bal-chip">
      <span className="k">{k}</span>
      <span className={`v ${tone === 'good' ? 'good' : tone === 'warn' ? 'bad' : ''}`}>{v}</span>
    </div>
  );
}
