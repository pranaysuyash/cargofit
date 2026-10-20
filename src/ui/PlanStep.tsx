import { useEffect, useMemo, useRef, useState } from 'react';
import { computeMetrics } from '../engine/analyze';
import { expandUnits, normalizeEquipment } from '../engine/normalize';
import { orientationsFor } from '../engine/solver';
import { fmtKgDual, fmtMmDual, fmtNum } from '../engine/units';
import { renderIso, renderSide, renderTop, rowColors } from '../engine/viz';
import { validatePlacements, EPS } from '../engine/validator';
import type { Placement } from '../engine/types';
import type { AppApi } from './App';
import { NumInput, StatusBadge } from './common';

type View = 'iso' | 'top' | 'side';
const STEP = 50;

export function PlanStep(p: AppApi) {
  const { scenario, results, readOnly } = p;
  const withPlans = results.filter((r) => r.arrangements.length > 0);
  const result = results.find((r) => r.equipmentId === p.planEq && r.arrangements.length) ?? withPlans[0];
  const [view, setView] = useState<View>('iso');
  const [rot, setRot] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const [upTo, setUpTo] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [xray, setXray] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [filterRowUid, setFilterRowUid] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const vref = useRef<HTMLDivElement>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const arrIdx = result ? Math.min(p.arrIdx, result.arrangements.length - 1) : 0;
  const arr = result?.arrangements[arrIdx];
  const key = result ? `${result.equipmentId}:${arrIdx}` : '';
  const working: Placement[] = (key && p.edits[key]) || arr?.placements || [];
  const edited = !!(key && p.edits[key]);

  const profile = result ? scenario.equipment.find((e) => e.id === result.equipmentId) : undefined;
  const eq = useMemo(() => (profile ? normalizeEquipment(profile) : null), [profile]);
  const units = useMemo(() => expandUnits(scenario.rows), [scenario.rows]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const colors = useMemo(() => rowColors(scenario.rows), [scenario.rows]);

  const violations = useMemo(() => (eq ? validatePlacements(units, eq, working, scenario.settings) : []), [eq, units, working, scenario.settings]);
  const bad = useMemo(() => new Set(violations.flatMap((v) => v.unitIds)), [violations]);
  const metrics = useMemo(() => (eq ? computeMetrics(units, eq, working) : null), [eq, units, working]);
  const placedIds = new Set(working.map((w) => w.unitId));
  const unplaced = units.filter((u) => !placedIds.has(u.id));

  useEffect(() => { setUpTo(null); setSel(null); setPlaying(false); }, [key]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setUpTo((cur) => {
      const n = (cur ?? 0) + 1;
      if (n >= working.length) { setPlaying(false); return null; }
      return n;
    }), 350);
    return () => clearInterval(t);
  }, [playing, working.length]);

  if (!result || !eq || !profile || !arr || !metrics) {
    return (
      <section className="step"><div className="step-head"><div><p className="eyebrow">Step 04</p><h1>Plan</h1></div></div>
        <div className="empty"><h3>{p.solver.state.phase === 'running' ? 'Solving…' : 'No computed plan to show'}</h3>
          <p>A plan exists only when the engine placed at least one unit. Check the comparison for reasons.</p>
          <button className="btn" onClick={() => p.go('decision')}>Back to comparison</button></div></section>
    );
  }

  const setWorking = (next: Placement[]) => p.setEdits({ ...p.edits, [key]: next });
  const resetEdits = () => { const n = { ...p.edits }; delete n[key]; p.setEdits(n); p.notify('ok', 'Restored the solver’s arrangement.'); };
  const selP = working.find((w) => w.unitId === sel) ?? null;
  const selU = selP ? unitMap.get(selP.unitId) : undefined;
  const mutate = (id: string, patch: Partial<Placement>) => {
    if (readOnly) { p.notify('warn', 'Read-only plan: editing is disabled.'); return; }
    setWorking(working.map((w) => (w.unitId === id ? { ...w, ...patch } : w)));
  };
  const rotate = () => {
    if (!selP || !selU) return;
    const list = orientationsFor(selU);
    if (list.length < 2) { p.notify('warn', `${selP.unitId} has only one allowed orientation (rule: ${selU.rotation}).`); return; }
    const cur = list.findIndex(([a, b, c]) => Math.abs(a - selP.dx) < EPS && Math.abs(b - selP.dy) < EPS && Math.abs(c - selP.dz) < EPS);
    const [dx, dy, dz] = list[(cur + 1) % list.length];
    mutate(selP.unitId, { dx, dy, dz });
  };
  const dropToRest = () => {
    if (!selP) return;
    let z = 0;
    for (const o of working) {
      if (o.unitId === selP.unitId) continue;
      if (selP.x < o.x + o.dx - EPS && o.x < selP.x + selP.dx - EPS && selP.y < o.y + o.dy - EPS && o.y < selP.y + selP.dy - EPS && o.z + o.dz <= selP.z + selP.dz + EPS) z = Math.max(z, o.z + o.dz);
    }
    mutate(selP.unitId, { z });
  };
  const move = (dx: number, dy: number, dz: number) => selP && mutate(selP.unitId, { x: selP.x + dx, y: selP.y + dy, z: Math.max(0, selP.z + dz) });
  const removeFromPlan = () => { if (selP && !readOnly) { setWorking(working.filter((w) => w.unitId !== selP.unitId)); setSel(null); } };
  const addToPlan = (id: string) => {
    if (readOnly) return;
    const u = unitMap.get(id)!;
    const [dx, dy, dz] = orientationsFor(u)[0];
    setWorking([...working, { unitId: id, rowUid: u.rowUid, label: u.label, x: 0, y: 0, z: 0, dx, dy, dz, order: Math.max(0, ...working.map((w) => w.order)) + 1 }]);
    setSel(id);
    p.notify('warn', `${id} added at the origin — move it; the validator flags any overlap.`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!selP) return;
    const k = e.key;
    const m: Record<string, [number, number, number]> = { ArrowLeft: [-STEP, 0, 0], ArrowRight: [STEP, 0, 0], ArrowUp: [0, -STEP, 0], ArrowDown: [0, STEP, 0], PageUp: [0, 0, STEP], PageDown: [0, 0, -STEP] };
    if (m[k]) { e.preventDefault(); move(...m[k]); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); rotate(); }
    else if (k === 'Escape') setSel(null);
  };

  const ctx = {
    eq,
    placements: working,
    colors,
    selectedId: sel,
    badIds: bad,
    upTo: upTo ?? undefined,
    rotation: rot,
    xray,
    showGrid,
    filterRowUid,
  };
  const svg = view === 'iso' ? renderIso(ctx) : view === 'top' ? renderTop(ctx) : renderSide(ctx);
  const onPick = (e: React.MouseEvent) => {
    const id = (e.target as Element).closest('.pi')?.getAttribute('data-uid');
    setSel(id ?? null);
  };

  const verdict = edited
    ? (violations.length === 0 && unplaced.length === 0 ? 'Edited plan: the validator found no violations of the modeled constraints.' : `Edited plan: ${violations.length} violation(s), ${unplaced.length} unit(s) unplaced.`)
    : null;

  const filteredPlacements = useMemo(() => {
    let list = working.slice().sort((a, b) => a.order - b.order);
    if (filterRowUid) list = list.filter((w) => w.rowUid === filterRowUid);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((w) => w.unitId.toLowerCase().includes(q) || w.label.toLowerCase().includes(q));
    }
    return list;
  }, [working, filterRowUid, query]);

  return (
    <section className="step plan" aria-labelledby="h-plan">
      <div className="step-head">
        <div><p className="eyebrow">Step 04</p><h1 id="h-plan">Plan & 3D Spatial Arrangements</h1></div>
        <div className="actions">
          <label className="inl">Equipment
            <select value={result.equipmentId} onChange={(e) => { p.setPlanEq(e.target.value); p.setArrIdx(0); }}>
              {withPlans.map((r) => <option key={r.equipmentId} value={r.equipmentId}>{r.equipmentName}</option>)}</select></label>
          <label className="inl">Arrangement
            <select value={arrIdx} onChange={(e) => p.setArrIdx(Number(e.target.value))}>
              {result.arrangements.map((a, i) => <option key={i} value={i}>{i + 1}. {a.name}{a.unplacedIds.length ? ` (${a.unplacedIds.length} unplaced)` : ''}</option>)}</select></label>
        </div>
      </div>

      <div className={`status-strip ${edited ? 'edited' : ''}`}>
        <StatusBadge status={result.status} full />
        {edited && <span className="chip warn">Manually edited — solver status above no longer applies</span>}
        {verdict && <b className={violations.length ? 'bad-t' : 'ok-t'}>{verdict}</b>}
        {result.reasons.slice(0, 2).map((r, i) => <span key={i} className="reason-line">{r.message} <i>→ {r.action}</i></span>)}
      </div>

      {/* Arrangement Strategy Switcher Gallery */}
      {result.arrangements.length > 1 && (
        <div className="arr-gallery" role="tablist" aria-label="Alternative packing arrangements">
          <span className="arr-lbl">Alternative Heuristic Strategies:</span>
          <div className="arr-pills">
            {result.arrangements.map((a, i) => {
              const isCur = i === arrIdx;
              return (
                <button key={i} role="tab" aria-selected={isCur} className={`arr-btn ${isCur ? 'active' : ''}`}
                  onClick={() => p.setArrIdx(i)}>
                  <span className="arr-title">#{i + 1} {a.name}</span>
                  <span className="arr-stat mono">
                    {a.placements.length}/{units.length} placed
                    {a.unplacedIds.length > 0 && <b className="warn-t"> ({a.unplacedIds.length} unplaced)</b>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="metrics">
        <div><span>Placed</span><b className="mono">{working.length}/{units.length}</b></div>
        <div><span>Occupied volume*</span><b className="mono">{fmtNum(metrics.occupiedVolumePct)}%</b></div>
        <div><span>Known weight</span><b className="mono">{fmtKgDual(metrics.loadedWeightKg)}</b>{metrics.unknownWeightUnits > 0 && <em>+{metrics.unknownWeightUnits} unknown</em>}</div>
        <div><span>Payload left</span><b className="mono">{metrics.payloadRemainingKg === null ? 'not declared' : fmtKgDual(metrics.payloadRemainingKg)}</b></div>
        <div><span>Length used</span><b className="mono">{fmtMmDual(metrics.usedLengthMm)}</b></div>
        <div><span>Centroid (info)</span><b className="mono">{metrics.cogXPct === null ? 'n/a' : `${fmtNum(metrics.cogXPct, 0)}% of length`}</b></div>
      </div>

      <div className="viewer">
        <div className="vbar" role="toolbar" aria-label="Plan view controls">
          <div className="seg" role="tablist" aria-label="View">
            {([['iso', 'Isometric 3D'], ['top', 'Top (Plan)'], ['side', 'Side Elevation']] as [View, string][]).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>))}
          </div>
          {view === 'iso' && <>
            <button className="btn sm" onClick={() => setRot((r) => (r + 3) % 4)} title="Rotate view 90° CCW">⟲ {rot * 90}°</button>
            <button className="btn sm" onClick={() => setRot((r) => (r + 1) % 4)} title="Rotate view 90° CW">⟳ {((rot + 1) * 90) % 360}°</button>
            <button className={`btn sm ${xray ? 'accent-active' : ''}`} onClick={() => setXray(!xray)} title="Toggle X-Ray translucent view">
              {xray ? '👁 X-Ray ON' : '👁 X-Ray'}
            </button>
            <button className={`btn sm ${showGrid ? 'accent-active' : ''}`} onClick={() => setShowGrid(!showGrid)} title="Toggle floor grid lines">
              {showGrid ? '⊞ Grid ON' : '⊞ Grid'}
            </button>
          </>}
          <button className="btn sm" onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))} aria-label="Zoom in">＋</button>
          <button className="btn sm" onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))} aria-label="Zoom out">－</button>
          <button className="btn sm ghost" onClick={() => { setZoom(1); setRot(0); setXray(false); setShowGrid(true); setFilterRowUid(null); }}>Reset</button>

          <div className="cargo-filter">
            <label className="inl">
              Filter SKU:
              <select value={filterRowUid ?? ''} onChange={(e) => setFilterRowUid(e.target.value || null)}>
                <option value="">All cargo rows ({scenario.rows.length})</option>
                {scenario.rows.map((r) => (
                  <option key={r.uid} value={r.uid}>{r.label} ({r.qty}x)</option>
                ))}
              </select>
            </label>
          </div>

          <div className="seq">
            <button className="btn sm" disabled={reduced || working.length < 2} title={reduced ? 'Reduced motion is on — use the slider' : 'Play loading sequence'}
              onClick={() => { if (playing) setPlaying(false); else { setUpTo(0); setPlaying(true); } }}>{playing ? '❚❚ Pause' : '▶ Load sequence'}</button>
            <input type="range" min={0} max={working.length} value={upTo ?? working.length} aria-label="Loading step"
              onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setUpTo(v >= working.length ? null : v); }} />
            <span className="mono">{upTo ?? working.length}/{working.length}</span>
          </div>
        </div>
        <div className="canvas" ref={vref} tabIndex={0} role="group"
          aria-label="Spatial plan. Click an item to select it. With an item selected, arrow keys move it in the floor plane, Page Up and Page Down change height, R rotates."
          onKeyDown={onKey} onClick={onPick}
          style={{ ['--zoom' as string]: zoom }}
          dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="legend" aria-label="Colour legend">
          {scenario.rows.map((r) => <span key={r.uid}><i style={{ background: colors.get(r.uid)?.fill, borderColor: colors.get(r.uid)?.stroke }} />{r.label}</span>)}
          <span><i className="door" />door end</span>
        </div>
      </div>

      <div className="plan-cols">
        <div className="panel">
          <div className="panel-h">
            <b>Placements ({filteredPlacements.length})</b>
            <span>readable equivalent of the drawing · click to select</span>
          </div>
          <div className="search-box">
            <input type="text" className="txt" placeholder="Filter by Unit ID or label…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button className="btn sm ghost" onClick={() => setQuery('')}>✕</button>}
          </div>
          <div className="tablewrap short">
            <table className="grid slim" aria-label="Placements">
              <thead><tr><th>#</th><th>Unit</th><th>x, y, z (mm)</th><th>dx × dy × dz</th></tr></thead>
              <tbody>
                {filteredPlacements.map((w) => (
                  <tr key={w.unitId} className={`${sel === w.unitId ? 'sel' : ''}${bad.has(w.unitId) ? ' has-err' : ''}`} onClick={() => setSel(w.unitId)}>
                    <td className="mono">{w.order}</td>
                    <td><button className="linkbtn" onClick={() => setSel(w.unitId)}>{w.unitId}</button>{bad.has(w.unitId) && <span className="chip bad">violation</span>}</td>
                    <td className="mono">{fmtNum(w.x, 0)}, {fmtNum(w.y, 0)}, {fmtNum(w.z, 0)}</td>
                    <td className="mono">{fmtNum(w.dx, 0)}×{fmtNum(w.dy, 0)}×{fmtNum(w.dz, 0)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          {unplaced.length > 0 && (
            <div className="unplaced"><b>Not placed ({unplaced.length}):</b> {unplaced.slice(0, 24).map((u) => (
              <button key={u.id} className="chip warn btnchip" disabled={!!readOnly} title="Add at origin to place by hand" onClick={() => addToPlan(u.id)}>+ {u.id}</button>))}
              {unplaced.length > 24 && ` … and ${unplaced.length - 24} more`}</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-h"><b>{selP ? `Selected: ${selP.unitId}` : 'Inspector'}</b>{edited && !readOnly && <button className="btn sm ghost" onClick={resetEdits}>Reset to solver plan</button>}</div>
          {selP && selU ? (
            <div className="inspector">
              <p className="muted small">Row “{selU.label}” · {selU.rotation} rotation · {selU.stackable ? 'stackable' : 'no-stack'} · {selU.weightKg === null ? 'weight unknown' : `${fmtNum(selU.weightKg, 1)} kg`}<br />
                Size {fmtNum(selP.dx, 0)} × {fmtNum(selP.dy, 0)} × {fmtNum(selP.dz, 0)} mm (placed orientation)</p>

              {/* Clearances Card */}
              <div className="clearances-card">
                <span className="card-lbl">Clearances & Support Geometry</span>
                <div className="clearance-grid">
                  <div><span>Front bulkhead:</span> <b>{fmtMmDual(selP.x)}</b></div>
                  <div><span>Rear door:</span> <b>{fmtMmDual(Math.max(0, eq.L - (selP.x + selP.dx)))}</b></div>
                  <div><span>Left sidewall:</span> <b>{fmtMmDual(selP.y)}</b></div>
                  <div><span>Right sidewall:</span> <b>{fmtMmDual(Math.max(0, eq.W - (selP.y + selP.dy)))}</b></div>
                  <div><span>Ceiling clearance:</span> <b>{fmtMmDual(Math.max(0, eq.H - (selP.z + selP.dz)))}</b></div>
                  <div><span>Base plane:</span> <b>{selP.z <= EPS ? 'Bed floor (0 mm)' : `Elevated (+${Math.round(selP.z)} mm)`}</b></div>
                </div>
              </div>

              <div className="posgrid">
                {(['x', 'y', 'z'] as const).map((a) => (
                  <label key={a}>{a} (mm)<NumInput value={Math.round(selP[a] * 100) / 100} label={`${selP.unitId} ${a} position`} width={92} disabled={!!readOnly}
                    onChange={(v) => v !== null && mutate(selP.unitId, { [a]: v })} /></label>))}
              </div>

              {/* Quick Snaps */}
              <div className="snap-actions">
                <span className="muted small">Quick Snaps:</span>
                <div className="btn-group-sm">
                  <button className="btn sm ghost" disabled={!!readOnly} onClick={() => mutate(selP.unitId, { x: 0 })}>Bulkhead (x=0)</button>
                  <button className="btn sm ghost" disabled={!!readOnly} onClick={() => mutate(selP.unitId, { x: Math.max(0, eq.L - selP.dx) })}>Rear Door</button>
                  <button className="btn sm ghost" disabled={!!readOnly} onClick={() => mutate(selP.unitId, { y: 0 })}>Left (y=0)</button>
                  <button className="btn sm ghost" disabled={!!readOnly} onClick={() => mutate(selP.unitId, { y: Math.max(0, eq.W - selP.dy) })}>Right Wall</button>
                  <button className="btn sm ghost" disabled={!!readOnly} onClick={() => mutate(selP.unitId, { z: 0 })}>Floor (z=0)</button>
                  <button className="btn sm ghost" disabled={!!readOnly} onClick={dropToRest}>Drop to Rest</button>
                </div>
              </div>

              <div className="nudge">
                <button className="btn sm" disabled={!!readOnly} onClick={() => move(-STEP, 0, 0)}>← x</button><button className="btn sm" disabled={!!readOnly} onClick={() => move(STEP, 0, 0)}>x →</button>
                <button className="btn sm" disabled={!!readOnly} onClick={() => move(0, -STEP, 0)}>↑ y</button><button className="btn sm" disabled={!!readOnly} onClick={() => move(0, STEP, 0)}>y ↓</button>
                <button className="btn sm" disabled={!!readOnly} onClick={() => move(0, 0, STEP)}>z ↑</button><button className="btn sm" disabled={!!readOnly} onClick={() => move(0, 0, -STEP)}>z ↓</button>
                <button className="btn sm" disabled={!!readOnly} onClick={rotate}>Rotate (R)</button>
                <button className="btn sm danger" disabled={!!readOnly} onClick={removeFromPlan}>Remove from plan</button>
              </div>
              <p className="muted small">Step {STEP} mm. x runs from front wall to door; y across width; z up.</p>
            </div>
          ) : <p className="muted">Select an item in the drawing or table to see its size, source row and to move or rotate it. Every change is re-validated immediately.</p>}

          <div className="validation" role="status" aria-live="polite">
            <b>Validator</b>
            {violations.length === 0
              ? <p className="ok-t">No violations of the modeled constraints.</p>
              : <ul className="issue-list">{violations.slice(0, 12).map((v, i) => <li key={i} className="error">{v.message}</li>)}{violations.length > 12 && <li>… {violations.length - 12} more</li>}</ul>}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><b>What was checked — and what was not</b><span>solver {result.solver.version} · seed {result.solver.seed} · {result.solver.attempts}/{result.solver.budget} attempts · {result.solver.ms} ms</span></div>
        <ul className="checks">
          {result.checks.map((c) => (
            <li key={c.id} className={c.state}><span className="cs">{c.state === 'verified' ? '✓ checked' : c.state === 'not_modeled' ? '⚠ not modeled' : c.state === 'not_declared' ? '⚠ not declared' : '? unknown'}</span><b>{c.label}</b><span className="muted small"> — {c.note}</span></li>))}
        </ul>
      </div>
      <div className="foot-actions"><button className="btn" onClick={() => p.go('decision')}>← Compare</button><button className="btn primary" onClick={() => p.go('versions')}>Next: save & export →</button></div>
    </section>
  );
}
