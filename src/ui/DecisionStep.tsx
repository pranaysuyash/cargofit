import { useMemo, useState } from 'react';
import { diffResults, diffRows, summarize } from '../engine/scenario';
import { fmtNum, toMm } from '../engine/units';
import type { EquipmentProfile, EquipmentResult } from '../engine/types';
import type { AppApi } from './App';
import { StatusBadge } from './common';

type Crit = 'cost' | 'margin' | 'size' | 'length';
const CRIT: Record<Crit, string> = {
  cost: 'Lowest cost I entered', margin: 'Most payload margin', size: 'Smallest sufficient interior', length: 'Shortest loaded length',
};

const viable = (r: EquipmentResult) => r.status === 'FEASIBLE_UNDER_MODELED_CONSTRAINTS' || r.status === 'NEEDS_PHYSICAL_REVIEW';

export function DecisionStep(p: AppApi) {
  const { scenario, results, solver, baseline, readOnly } = p;
  const [crit, setCrit] = useState<Crit>('size');
  const [open, setOpen] = useState<string | null>(null);
  const [whatRow, setWhatRow] = useState<string>('');
  const eqOf = (r: EquipmentResult): EquipmentProfile | undefined => scenario.equipment.find((e) => e.id === r.equipmentId);
  const vol = (e?: EquipmentProfile) => (e?.length && e.width && e.height ? (toMm(e.length, e.unit) * toMm(e.width, e.unit) * toMm(e.height, e.unit)) / 1e9 : Infinity);

  const ranking = useMemo(() => {
    const v = results.filter(viable);
    const withKey = v.map((r) => {
      const e = eqOf(r);
      let key: number | null = null;
      if (crit === 'cost') key = e && e.cost !== null && e.costSource !== 'none' ? e.cost : null;
      if (crit === 'margin') key = r.metrics.payloadRemainingKg !== null && r.metrics.unknownWeightUnits === 0 ? -r.metrics.payloadRemainingKg : null;
      if (crit === 'size') key = vol(e);
      if (crit === 'length') key = r.metrics.usedLengthMm;
      return { r, key };
    });
    const ranked = withKey.filter((x) => x.key !== null).sort((a, b) => a.key! - b.key!);
    const unranked = withKey.filter((x) => x.key === null);
    return { ranked, unranked };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, crit, scenario.equipment]);

  const fitCount = results.filter((r) => r.status === 'FEASIBLE_UNDER_MODELED_CONSTRAINTS').length;
  const row = scenario.rows.find((r) => r.uid === whatRow) ?? scenario.rows[0];
  const edit = (fn: (s: typeof scenario) => typeof scenario) => p.setScenario(fn);

  const rowDiff = baseline ? diffRows(baseline.scenario.rows, scenario.rows) : [];
  const resDiff = baseline ? diffResults(baseline.summaries, results.map(summarize)) : [];
  const running = solver.state.phase === 'running';

  const pin = () => {
    if (p.stale || running) { p.notify('warn', 'Wait for plans to finish computing, then pin the baseline.'); return; }
    p.setBaseline({ label: `Pinned ${new Date().toLocaleTimeString()}`, savedAt: new Date().toISOString(), scenario: JSON.parse(JSON.stringify(scenario)), summaries: results.map(summarize) });
    p.notify('ok', 'Baseline pinned. Change cargo or equipment and compare below.');
  };

  return (
    <section className="step" aria-labelledby="h-dec">
      <div className="step-head">
        <div><p className="eyebrow">Step 03</p><h1 id="h-dec">Compare options</h1>
          <p className="sub">Each equipment option is solved separately under the same manifest. Status wording is deliberately specific: “proven” means a sound bound tripped; “no plan found” means only that the search did not succeed.</p></div>
        <div className="actions"><button className="btn" onClick={pin} disabled={!results.length}>Pin as baseline</button></div>
      </div>

      {running && <div className="banner run" role="status">Computing {solver.state.progress.done} of {solver.state.progress.total} options… <button className="btn sm" onClick={solver.cancel}>Cancel</button></div>}
      {p.stale && !running && !readOnly && <div className="banner warn" role="status">Inputs changed since these results were computed. They are shown greyed out and will refresh automatically.</div>}

      {results.length === 0 ? (
        <div className="empty"><h3>{running ? 'Solving…' : 'No results yet'}</h3><p>{scenario.equipment.some((e) => e.included) ? 'Plans appear as each option finishes.' : 'Include at least one equipment profile in step 02.'}</p></div>
      ) : (
        <>
          <div className={`verdict${p.stale ? ' stale' : ''}`}>
            <b>{fitCount === 0 ? 'No option is confirmed to fit under the modeled constraints.' : `${fitCount} of ${results.length} option(s) fit under the modeled constraints.`}</b>
            <span>Remember: axle loads, securement, legal limits and handling access are not modeled.</span>
          </div>
          <div className="tablewrap">
            <table className={`grid cmp${p.stale ? ' stale' : ''}`} aria-label="Equipment comparison">
              <thead><tr><th>Equipment</th><th>Outcome</th><th>Placed</th><th>Occupied volume*</th><th>Known weight / payload</th><th>Door</th><th>Your cost</th><th>Why</th><th /></tr></thead>
              <tbody>
                {results.map((r) => {
                  const e = eqOf(r);
                  const top = r.reasons[0];
                  return (
                    <tr key={r.equipmentId}>
                      <th scope="row">{r.equipmentName}<small>{e ? `${fmtNum(e.length ?? 0, 0)}×${fmtNum(e.width ?? 0, 0)}×${fmtNum(e.height ?? 0, 0)} ${e.unit}` : ''}</small></th>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="mono">{r.metrics.placedUnits}/{r.metrics.totalUnits}</td>
                      <td className="mono">{fmtNum(r.metrics.occupiedVolumePct)}%</td>
                      <td className="mono">{fmtNum(r.metrics.loadedWeightKg, 0)} kg{r.metrics.unknownWeightUnits ? ` + ${r.metrics.unknownWeightUnits} unk.` : ''} / {r.metrics.payloadKg === null ? 'n/d' : `${fmtNum(r.metrics.payloadKg, 0)} kg`}</td>
                      <td className="mono">{e?.doorWidth && e.doorHeight ? `${fmtNum(e.doorWidth, 0)}×${fmtNum(e.doorHeight, 0)} ${e.unit}` : 'n/d'}</td>
                      <td className="mono">{e && e.cost !== null && e.costSource !== 'none' ? `${fmtNum(e.cost, 0)} ${e.currency}${e.costSource === 'illustrative' ? ' (illus.)' : ''}` : '—'}</td>
                      <td className="why">{top ? <button className="linkbtn" aria-expanded={open === r.equipmentId} onClick={() => setOpen(open === r.equipmentId ? null : r.equipmentId)}>{top.message.length > 70 ? `${top.message.slice(0, 68)}…` : top.message}</button> : <span className="muted">All checks the model performs passed.</span>}</td>
                      <td><button className="btn sm" disabled={r.arrangements.length === 0} onClick={() => { p.setPlanEq(r.equipmentId); p.setArrIdx(0); p.go('plan'); }}>{r.arrangements.length ? 'Open plan' : 'No plan'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">*Sum of placed items’ bounding-box volume ÷ interior volume — not usable space and not a safety measure. n/d = not declared.</p>

          {open && (() => {
            const r = results.find((x) => x.equipmentId === open);
            if (!r) return null;
            return (
              <div className="panel" role="region" aria-label={`Reasons for ${r.equipmentName}`}>
                <div className="panel-h"><b>{r.equipmentName}: reasons & what would resolve them</b><button className="btn sm ghost" onClick={() => setOpen(null)}>Close</button></div>
                <ul className="reasons">
                  {r.reasons.length === 0 && <li className="info">Nothing blocked this option. Unmodeled checks still apply — see the plan view.</li>}
                  {r.reasons.map((x, i) => (
                    <li key={i} className={x.severity}><div><b>{x.code.replace(/_/g, ' ').toLowerCase()}</b> {x.message}</div><div className="act">→ {x.action}</div>{x.labels.length > 0 && <div className="muted small">Items: {x.labels.join(', ')}</div>}</li>
                  ))}
                </ul>
                <p className="muted small">Solver {r.solver.version} · seed {r.solver.seed} · {r.solver.attempts}/{r.solver.budget} attempts · stop: {r.solver.stopReason.replace('_', ' ')} · {r.solver.ms} ms</p>
              </div>
            );
          })()}

          <div className="panel">
            <div className="panel-h"><b>Rank the options that fit</b>
              <select aria-label="Ranking criterion" value={crit} onChange={(e) => setCrit(e.target.value as Crit)}>{(Object.keys(CRIT) as Crit[]).map((c) => <option key={c} value={c}>{CRIT[c]}</option>)}</select></div>
            {ranking.ranked.length === 0 && ranking.unranked.length === 0 && <p className="muted">No option fits yet, so there is nothing to rank.</p>}
            <ol className="rank">
              {ranking.ranked.map(({ r }, i) => <li key={r.equipmentId}><span className="rk">{i + 1}</span><b>{r.equipmentName}</b> <StatusBadge status={r.status} /></li>)}
            </ol>
            {ranking.unranked.length > 0 && <p className="muted small">Not ranked (evidence missing for “{CRIT[crit]}”): {ranking.unranked.map((x) => x.r.equipmentName).join(', ')}. {crit === 'cost' ? 'Enter your own cost per option in step 02 — there is no live quote feed.' : crit === 'margin' ? 'Needs a declared payload and no unknown weights.' : ''}</p>}
          </div>

          <div className="panel">
            <div className="panel-h"><b>What-if</b><span>edits recompute every option; pin a baseline first to see exactly what changed</span></div>
            {scenario.rows.length === 0 ? <p className="muted">Add cargo first.</p> : (
              <div className="whatif">
                <label>Item row<select value={row?.uid} onChange={(e) => setWhatRow(e.target.value)}>{scenario.rows.map((r) => <option key={r.uid} value={r.uid}>{r.label || '(unnamed)'} × {r.qty ?? '?'}</option>)}</select></label>
                <button className="btn sm" disabled={!!readOnly || !row} onClick={() => edit((s) => ({ ...s, rows: s.rows.map((r) => (r.uid === row.uid ? { ...r, qty: (r.qty ?? 0) + 2 } : r)) }))}>+2 units</button>
                <button className="btn sm" disabled={!!readOnly || !row || (row.qty ?? 0) <= 1} onClick={() => edit((s) => ({ ...s, rows: s.rows.map((r) => (r.uid === row.uid ? { ...r, qty: Math.max(1, (r.qty ?? 1) - 1) } : r)) }))}>−1 unit</button>
                <button className="btn sm" disabled={!!readOnly || !row} onClick={() => edit((s) => ({ ...s, rows: s.rows.map((r) => (r.uid === row.uid ? { ...r, rotation: 'any' } : r)) }))}>Allow any rotation</button>
                <button className="btn sm" disabled={!!readOnly || !row} onClick={() => edit((s) => ({ ...s, rows: s.rows.map((r) => (r.uid === row.uid ? { ...r, rotation: 'fixed' } : r)) }))}>Forbid rotation</button>
                <button className="btn sm" disabled={!!readOnly || !row} onClick={() => edit((s) => ({ ...s, rows: s.rows.map((r) => (r.uid === row.uid ? { ...r, stackable: !r.stackable } : r)) }))}>Toggle stackable</button>
                <button className="btn sm danger" disabled={!!readOnly || !row} onClick={() => edit((s) => ({ ...s, rows: s.rows.filter((r) => r.uid !== row.uid) }))}>Remove row</button>
              </div>
            )}
            {baseline ? (
              <div className="delta">
                <p className="muted small">Compared with <b>{baseline.label}</b>{p.stale ? ' — current results are still computing' : ''}.</p>
                {rowDiff.length === 0 ? <p>No cargo changes since the baseline.</p> : (
                  <ul className="chg">{rowDiff.map((c) => <li key={c.uid}><b>{c.kind}</b> {c.label}{c.fields.length ? ` — ${c.fields.join(', ')}` : ''}</li>)}</ul>
                )}
                <table className="grid slim" aria-label="Result changes"><thead><tr><th>Equipment</th><th>Before</th><th>After</th><th>Placed Δ</th><th>Weight Δ</th></tr></thead>
                  <tbody>{resDiff.map((d) => (
                    <tr key={d.equipmentName} className={d.statusChanged ? 'chgrow' : ''}>
                      <th scope="row">{d.equipmentName}</th>
                      <td>{d.before ? <StatusBadge status={d.before.status} /> : '—'}</td>
                      <td>{d.after ? <StatusBadge status={d.after.status} /> : '—'}</td>
                      <td className="mono">{d.placedDelta > 0 ? '+' : ''}{d.placedDelta}</td>
                      <td className="mono">{d.weightDeltaKg > 0 ? '+' : ''}{fmtNum(d.weightDeltaKg, 0)} kg</td>
                    </tr>))}</tbody></table>
                <button className="btn sm ghost" onClick={() => p.setBaseline(null)}>Clear baseline</button>
              </div>
            ) : <p className="muted small">No baseline pinned. “Pin as baseline” stores the current result so the next change shows what flipped and why.</p>}
          </div>
        </>
      )}
      <div className="foot-actions"><button className="btn" onClick={() => p.go('equipment')}>← Equipment</button><button className="btn primary" disabled={!results.some((r) => r.arrangements.length)} onClick={() => { const r = ranking.ranked[0]?.r ?? results.find((x) => x.arrangements.length); if (r) { p.setPlanEq(r.equipmentId); p.go('plan'); } }}>Next: inspect plan →</button></div>
    </section>
  );
}
