import { useEffect, useMemo, useRef, useState } from 'react';
import { computeMetrics } from '../engine/analyze';
import { expandUnits, normalizeEquipment } from '../engine/normalize';
import { orientationsFor } from '../engine/solver';
import { fmtKgDual, fmtMmDual, fmtNum } from '../engine/units';
import { renderIso, renderSide, renderTop, rowColors } from '../engine/viz';
import { validatePlacements, EPS } from '../engine/validator';
import { evaluateBridgeCompliance } from '../engine/bridge';
import { computeSecurementPlan } from '../engine/securement';
import { classFromHazardLabel, declaredHazmatWeightLbs } from '../engine/hazmatSegregation';
import { verifyBarcodeMatch } from '../engine/barcode';
import { codeConfirmation, confirmationLabel, type LoadingConfirmation } from '../engine/loadingConfirmation';
import { CameraScanner } from './CameraScanner';
import { TandemSliderModal } from './TandemSliderModal';
import { simulateTandemSlide } from '../engine/tandemSlider';
import { HazmatSegregationModal } from './HazmatSegregationModal';
import { NmfcClassificationModal } from './NmfcClassificationModal';
import { DunnageAirbagModal } from './DunnageAirbagModal';
import { MultiTempBulkheadModal } from './MultiTempBulkheadModal';
import { CartonCompressionModal } from './CartonCompressionModal';
import { evaluateCargoVoidsAndDunnage, dunnageGeometryForPlacements } from '../engine/dunnageVoidCalculator';
import { artifactScope, saveModeledArtifact } from '../engine/modeledArtifacts';
import type { Placement } from '../engine/types';
import type { AppApi } from './App';
import { NumInput, StatusBadge } from './common';

type View = 'iso' | 'top' | 'side';

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
  const [explode, setExplode] = useState(0);
  const [sliceX, setSliceX] = useState<number | null>(null);
  const [blueprint, setBlueprint] = useState(true);
  const [showCoG, setShowCoG] = useState(true);
  const [dockMode, setDockMode] = useState(false);
  const [nudgeStep, setNudgeStep] = useState(100);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanStatus, setScanStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmations, setConfirmations] = useState<Record<string, LoadingConfirmation>>({});
  const [showScanner, setShowScanner] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const vref = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const arrIdx = result ? Math.min(p.arrIdx, result.arrangements.length - 1) : 0;
  const arr = result?.arrangements[arrIdx];
  const key = result ? `${result.equipmentId}:${arrIdx}` : '';
  const working: Placement[] = (key && p.edits[key]) || arr?.placements || [];
  const edited = !!(key && p.edits[key]);
  const confirmationScope = JSON.stringify([key, working, scenario.rows]);
  useEffect(() => { setConfirmations({}); setScanStatus(null); }, [confirmationScope]);

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

  const activeStage = result?.multiStopStages && result.multiStopStages[activeStageIdx] ? result.multiStopStages[activeStageIdx] : null;
  const modeledScope = artifactScope(scenario, result?.equipmentId ?? '', arrIdx, working, activeStage?.stage ?? 0);

  const bridgeReport = useMemo(() => {
    if (!eq || !metrics || units.some((u) => working.some((w) => w.unitId === u.id) && u.weightKg === null)) return null;
    const effectiveWeightKg = activeStage && activeStage.stage > 0 ? activeStage.remainingWeightKg : metrics.loadedWeightKg;
    const effectiveCogXMm = (activeStage && activeStage.stage > 0 && activeStage.cogX !== null) ? activeStage.cogX : (metrics.cogX ?? 0);
    return evaluateBridgeCompliance({
      equipmentLengthMm: eq.L,
      cargoWeightKg: effectiveWeightKg,
      cargoCogXMm: effectiveCogXMm,
    });
  }, [eq, metrics, activeStage, units, working]);

  const securementPlan = useMemo(() => {
    if (!eq || units.some((u) => working.some((w) => w.unitId === u.id) && u.weightKg === null)) return null;
    const estimate = computeSecurementPlan(units, working);
    return estimate.complete ? estimate : null;
  }, [eq, units, working]);

  const [isTandemModalOpen, setIsTandemModalOpen] = useState(false);
  const [isHazmatModalOpen, setIsHazmatModalOpen] = useState(false);
  const [isNmfcModalOpen, setIsNmfcModalOpen] = useState(false);
  const [isDunnageModalOpen, setIsDunnageModalOpen] = useState(false);
  const [isBulkheadModalOpen, setIsBulkheadModalOpen] = useState(false);
  const [isCompressionModalOpen, setIsCompressionModalOpen] = useState(false);

  const dunnageReport = useMemo(() => {
    return evaluateCargoVoidsAndDunnage({
      equipment: {
        lengthMm: eq?.L ?? 16154,
        widthMm: eq?.W ?? 2540,
        heightMm: eq?.H ?? 2794,
      },
      placements: dunnageGeometryForPlacements(working, units),
      deckFrictionMu: 0.35,
    });
  }, [eq, working, units]);

  const geometryInput = useMemo(() => {
    const effectiveWeightKg = activeStage && activeStage.stage > 0 ? activeStage.remainingWeightKg : (metrics?.loadedWeightKg ?? 0);
    const effectiveCogXMm = (activeStage && activeStage.stage > 0 && activeStage.cogX !== null) ? activeStage.cogX : (metrics?.cogX ?? 0);
    return {
      equipmentLengthMm: eq?.L ?? 16154,
      cargoWeightKg: effectiveWeightKg,
      cargoCogXMm: effectiveCogXMm,
    };
  }, [eq, metrics, activeStage]);

  const hazmatItems = useMemo(() => {
    return scenario.rows
      .filter((r) => /haz|class\s*[1-9]|un\s*\d{4}|flamm|oxid|corros|toxic|acid|cyanide/i.test(r.label))
      .map((r, i) => {
        const unMatch = r.label.match(/UN\s*(\d{4})/i);
        return {
          id: `HAZ-${i + 1}`,
          description: r.label,
          classCode: classFromHazardLabel(r.label),
          unNumber: unMatch ? `UN${unMatch[1]}` : undefined,
          isAcid: /acid/i.test(r.label),
          isCyanide: /cyanide/i.test(r.label),
          weightLbs: declaredHazmatWeightLbs(r.weight, r.weightUnit),
        };
      });
  }, [scenario.rows]);

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

  useEffect(() => {
    if (sel && rowRefs.current.has(sel)) {
      rowRefs.current.get(sel)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [sel]);

  const selP = working.find((w) => w.unitId === sel) ?? null;
  const selU = selP ? unitMap.get(selP.unitId) : undefined;

  const stagePlacements = useMemo(() => {
    if (!activeStage || activeStage.stage === 0) return working;
    return working.filter((w) => {
      const u = unitMap.get(w.unitId);
      const st = u?.stop ?? w.stop ?? null;
      return st === null || st > activeStage.stop;
    });
  }, [activeStage, working, unitMap]);

  const activeStepUnit = useMemo(() => {
    if (selP) return selP;
    const targetOrder = upTo ?? working.length;
    return working.find((w) => w.order === targetOrder) ?? working[0] ?? null;
  }, [selP, upTo, working]);
  const activeStepUnitInfo = activeStepUnit ? unitMap.get(activeStepUnit.unitId) : undefined;

  const filteredPlacements = useMemo(() => {
    let list = working.slice().sort((a, b) => a.order - b.order);
    if (filterRowUid) list = list.filter((w) => w.rowUid === filterRowUid);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((w) => w.unitId.toLowerCase().includes(q) || w.label.toLowerCase().includes(q));
    }
    return list;
  }, [working, filterRowUid, query]);


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
    const k = e.key;
    if (k === 'j' || k === 'J') {
      e.preventDefault();
      const cur = upTo ?? working.length;
      const prev = Math.max(1, cur - 1);
      setUpTo(prev);
      const targetUnit = working.find((w) => w.order === prev);
      if (targetUnit) setSel(targetUnit.unitId);
      return;
    }
    if (k === 'k' || k === 'K') {
      e.preventDefault();
      const cur = upTo ?? working.length;
      const next = Math.min(working.length, cur + 1);
      setUpTo(next >= working.length ? null : next);
      const targetUnit = working.find((w) => w.order === next);
      if (targetUnit) setSel(targetUnit.unitId);
      return;
    }
    if (k === ' ') {
      e.preventDefault();
      if (playing) setPlaying(false);
      else {
        if ((upTo ?? working.length) >= working.length) setUpTo(0);
        setPlaying(true);
      }
      return;
    }
    if (k === 'b' || k === 'B') {
      e.preventDefault();
      setBlueprint((b) => !b);
      return;
    }
    if (k === 'd' || k === 'D') {
      e.preventDefault();
      setDockMode((m) => !m);
      return;
    }

    if (!selP) return;
    const m: Record<string, [number, number, number]> = {
      ArrowLeft: [-nudgeStep, 0, 0],
      ArrowRight: [nudgeStep, 0, 0],
      ArrowUp: [0, -nudgeStep, 0],
      ArrowDown: [0, nudgeStep, 0],
      PageUp: [0, 0, nudgeStep],
      PageDown: [0, 0, -nudgeStep],
    };
    if (m[k]) { e.preventDefault(); move(...m[k]); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); rotate(); }
    else if (k === 'Escape') setSel(null);
  };

  const currentStepNum = upTo ?? working.length;

  const ctx = {
    eq,
    placements: activeStage && activeStage.stage > 0 ? stagePlacements : working,
    colors,
    selectedId: sel,
    hoveredId,
    badIds: bad,
    upTo: upTo ?? undefined,
    rotation: rot,
    xray,
    showGrid,
    filterRowUid,
    explode,
    sliceX,
    blueprint,
    showCoG,
    units,
  };
  const svg = view === 'iso' ? renderIso(ctx) : view === 'top' ? renderTop(ctx) : renderSide(ctx);
  const onPick = (e: React.MouseEvent) => {
    const id = (e.target as Element).closest('.pi')?.getAttribute('data-uid');
    setSel(id ?? null);
  };

  const verdict = edited
    ? (violations.length === 0 && unplaced.length === 0 ? 'Edited plan: the validator found no violations of the modeled constraints.' : `Edited plan: ${violations.length} violation(s), ${unplaced.length} unit(s) unplaced.`)
    : null;


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

      {/* Multi-Stop Delivery Simulation (LIFO Sequence) */}
      {result.multiStopStages && result.multiStopStages.length > 1 && (
        <div className="arr-gallery multi-stop-strip" role="region" aria-label="Multi-Stop delivery simulation">
          <div className="multi-stop-head">
            <span className="arr-lbl">Multi-Stop Delivery Route (LIFO Unload Order):</span>
            <span className="muted small">Simulate partial unload state and axle load balance after each drop</span>
          </div>
          <div className="arr-pills">
            {result.multiStopStages.map((stg, i) => {
              const isCur = i === activeStageIdx;
              return (
                <button
                  key={i}
                  className={`arr-btn ${isCur ? 'active' : ''}`}
                  onClick={() => setActiveStageIdx(i)}
                >
                  <span className="arr-title">
                    {i === 0 ? 'Origin Departure (Full)' : `Post-Stop ${stg.stop} Drop`}
                  </span>
                  <span className="arr-stat mono">
                    {stg.remainingUnits} units · {fmtKgDual(stg.remainingWeightKg)}
                    {stg.warning && <b className="warn-t"> (Axle Alert)</b>}
                  </span>
                </button>
              );
            })}
          </div>
          {activeStage?.warning && (
            <div className="banner warn" style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><b>Progressive Axle Risk:</b> {activeStage.warning}</span>
              <button
                type="button"
                onClick={() => setIsTandemModalOpen(true)}
                className="btn sm"
                style={{ marginLeft: 8, fontWeight: 700, whiteSpace: 'nowrap' }}
                aria-label="Re-balance Tandem Pins for this Leg"
              >
                Slide Tandem to Re-Balance ⚙️
              </button>
            </div>
          )}
        </div>
      )}

      <div className="metrics">
        <div><span>Placed</span><b className="mono">{activeStage && activeStage.stage > 0 ? activeStage.remainingUnits : working.length}/{units.length}</b></div>
        <div><span>Occupied volume*</span><b className="mono">{fmtNum(metrics.occupiedVolumePct)}%</b></div>
        <div><span>Known weight</span><b className="mono">{fmtKgDual(activeStage && activeStage.stage > 0 ? activeStage.remainingWeightKg : metrics.loadedWeightKg)}</b>{metrics.unknownWeightUnits > 0 && <em>+{metrics.unknownWeightUnits} unknown</em>}</div>
        <div><span>Payload left</span><b className="mono">{metrics.payloadRemainingKg === null ? 'not declared' : fmtKgDual(eq.payloadKg === null ? 0 : eq.payloadKg - (activeStage && activeStage.stage > 0 ? activeStage.remainingWeightKg : metrics.loadedWeightKg))}</b></div>
        <div><span>Length used</span><b className="mono">{fmtMmDual(metrics.usedLengthMm)}</b></div>
        <div><span>Centroid (info)</span><b className="mono">{(activeStage && activeStage.stage > 0 ? activeStage.cogXPct : metrics.cogXPct) === null ? 'n/a' : `${fmtNum((activeStage && activeStage.stage > 0 ? activeStage.cogXPct! : metrics.cogXPct!), 0)}% of length`}</b></div>
      </div>

      {(bridgeReport || securementPlan || hazmatItems.length > 0) && (
        <div className="arr-gallery compliance-strip" role="region" aria-label="Illustrative loading estimates">
          <p>Illustrative estimates use assumed vehicle geometry, tare and restraint conditions. Actual axle legality, securement and hazard classification remain unverified.</p>
          <div className="compliance-row">
            {bridgeReport && (
              <div className="compliance-cell">
                <span className="arr-lbl">Illustrative bridge estimate:</span>
                <span className="chip warn">
                  {bridgeReport.allCompliant ? 'Within assumed benchmarks' : 'Assumed benchmark exceeded'}
                </span>
                <span className="mono small">
                  Estimated GVW: {bridgeReport.overallGvwLbs.toLocaleString()} / {bridgeReport.maxLegalGvwLbs.toLocaleString()} lbs
                  {bridgeReport.kpraFt !== null && ` · Assumed KPRA: ${bridgeReport.kpraFt.toFixed(1)}ft (${bridgeReport.kpraCompliant ? 'within benchmark' : 'above benchmark'})`}
                </span>
                <button
                  type="button"
                  onClick={() => setIsTandemModalOpen(true)}
                  className="btn sm"
                  style={{ marginLeft: 6, fontWeight: 700 }}
                  aria-label="Adjust Trailer Tandem and Fifth Wheel Pins"
                >
                  Adjust Pins ⚙️
                </button>
              </div>
            )}
            {securementPlan && (
              <div className="compliance-cell">
                <span className="arr-lbl">Illustrative restraint estimate:</span>
                <span className="chip warn">
                  {securementPlan.totalTieDownsCount} estimated tie-down(s)
                </span>
                <span className="mono small">
                  Estimated WLL: {securementPlan.totalRequiredWllLbs.toLocaleString()} lbs · Assumed deck: {securementPlan.deckFrictionMu}μ
                </span>
              </div>
            )}
            <div className="compliance-cell">
              <span className="arr-lbl">HazMat 49 CFR § 177:</span>
              <button
                type="button"
                onClick={() => setIsHazmatModalOpen(true)}
                className="chip warn"
                style={{ cursor: 'pointer', border: 'none', fontWeight: 700 }}
                aria-label="Open Hazardous Materials Segregation Table"
              >
                {hazmatItems.length > 0 ? `${hazmatItems.length} possible hazard label(s); classification unverified` : 'Hazard classification not declared'}
              </button>
            </div>
            <div className="compliance-cell">
              <span className="arr-lbl">NMFC Density &amp; LTL Class:</span>
              <button
                type="button"
                onClick={() => setIsNmfcModalOpen(true)}
                className="chip ok"
                style={{ cursor: 'pointer', border: 'none', fontWeight: 700 }}
                aria-label="Audit NMFC Freight Density and LTL Class"
              >
                Class Advisor 📊
              </button>
            </div>
            <div className="compliance-cell">
              <span className="arr-lbl">49 CFR § 393 Voids:</span>
              <button
                type="button"
                onClick={() => setIsDunnageModalOpen(true)}
                className="chip warn"
                style={{ cursor: 'pointer', border: 'none', fontWeight: 700 }}
                aria-label="Audit 49 CFR § 393.106 Cargo Voids and Dunnage Airbags"
              >
                {dunnageReport.statutoryCompliant ? 'No modeled void alert' : `${dunnageReport.unsecuredVoidsCount} modeled void(s) to review`}
              </button>
            </div>
            <div className="compliance-cell">
              <span className="arr-lbl">Multi-Temp Reefer:</span>
              <button
                type="button"
                onClick={() => setIsBulkheadModalOpen(true)}
                className="chip ok"
                style={{ cursor: 'pointer', border: 'none', fontWeight: 700 }}
                aria-label="Simulate 53ft Multi-Temp Bulkheads & FSMA Thermal Zones"
              >
                Bulkhead Zones ❄️
              </button>
            </div>
            <div className="compliance-cell">
              <span className="arr-lbl">Carton Crush BCT:</span>
              <button
                type="button"
                onClick={() => setIsCompressionModalOpen(true)}
                className="chip ok"
                style={{ cursor: 'pointer', border: 'none', fontWeight: 700 }}
                aria-label="Audit Corrugated Carton Compressive Strength & Stacking Crush Limits"
              >
                Stack Crush BCT 📦
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="viewer">
        {dockMode && (
          <div className="dock-hud-banner" role="region" aria-label="Tactile Dock Execution Console">
            <div className="dock-hud-main">
              <div className="dock-hud-controls">
                <button
                  className="btn lg dock-btn"
                  disabled={currentStepNum <= 1}
                  onClick={() => {
                    const target = Math.max(1, currentStepNum - 1);
                    setUpTo(target);
                    const u = working.find((w) => w.order === target);
                    if (u) setSel(u.unitId);
                  }}
                  title="Previous step (J)"
                >
                  ◀ PREV (J)
                </button>
                <div className="dock-hud-step-badge">
                  <span className="dock-step-lbl">CURRENT DOCK TASK</span>
                  <b className="dock-step-val mono">STEP #{currentStepNum} of {working.length}</b>
                </div>
                <button
                  className="btn lg dock-btn primary"
                  disabled={currentStepNum >= working.length}
                  onClick={() => {
                    const target = currentStepNum + 1;
                    setUpTo(target >= working.length ? null : target);
                    const u = working.find((w) => w.order === target);
                    if (u) setSel(u.unitId);
                  }}
                  title="Next step (K)"
                >
                  NEXT STEP (K) ▶
                </button>
              </div>

              {activeStepUnit && (
                <div className="dock-active-card">
                  <div className="dock-card-h">
                    <span className="dock-card-id mono">{activeStepUnit.unitId}</span>
                    <span className="dock-card-lbl">{activeStepUnit.label}</span>
                    {activeStepUnitInfo && (
                      <span className={`chip ${activeStepUnitInfo.stackable ? 'ok' : 'warn'}`}>
                        {activeStepUnitInfo.stackable ? 'Stackable' : 'NO-STACK / TOP ONLY'}
                      </span>
                    )}
                  </div>
                  <div className="dock-card-grid">
                    <div><span>Dimensions:</span> <b>{fmtMmDual(activeStepUnit.dx)} × {fmtMmDual(activeStepUnit.dy)} × {fmtMmDual(activeStepUnit.dz)}</b></div>
                    <div><span>Weight:</span> <b>{activeStepUnitInfo?.weightKg ? fmtKgDual(activeStepUnitInfo.weightKg) : 'Unknown weight'}</b></div>
                    <div><span>Target Bay Position:</span> <b>X: {fmtMmDual(activeStepUnit.x)} · Y: {fmtMmDual(activeStepUnit.y)} · Z: {fmtMmDual(activeStepUnit.z)}</b></div>
                    <div><span>Orientation:</span> <b>{activeStepUnit.dx >= activeStepUnit.dy ? 'Lengthwise (along trailer)' : 'Crosswise (across width)'}</b></div>
                  </div>

                  <div className="dock-barcode-bar">
                    <button
                      type="button"
                      className={`btn sm ${showScanner ? 'primary' : 'ghost'}`}
                      onClick={() => setShowScanner(!showScanner)}
                    >
                      {showScanner ? 'Hide Manual Input' : 'Scan Pallet Barcode'}
                    </button>
                    <button
                      type="button"
                      className={`btn sm ${showCamera ? 'primary' : ''}`}
                      onClick={() => setShowCamera(true)}
                      title="Open device camera for optical barcode/QR detection"
                    >
                      Live Camera Scanner
                    </button>

                    {showCamera && activeStepUnit && (
                      <CameraScanner
                        targetUnitId={activeStepUnit.unitId}
                        targetSkuLabel={activeStepUnit.label}
                        onClose={() => setShowCamera(false)}
                        onScan={(scannedCode) => {
                          const res = verifyBarcodeMatch(scannedCode, activeStepUnit.unitId, activeStepUnit.label, activeStepUnitInfo?.barcode);
                          if (res.matched) {
                            const confirmation = codeConfirmation('camera', activeStepUnit.unitId, res)!;
                            setConfirmations((current) => ({ ...current, [confirmation.unitId]: confirmation }));
                            setScanStatus({ ok: true, msg: confirmationLabel(confirmation) });
                            const next = currentStepNum + 1;
                            setUpTo(next >= working.length ? null : next);
                            const targetUnit = working.find((w) => w.order === next);
                            if (targetUnit) setSel(targetUnit.unitId);
                            setShowCamera(false);
                            setTimeout(() => setScanStatus(null), 3500);
                          } else {
                            setScanStatus({ ok: false, msg: `Scanned code "${scannedCode}" mismatch for ${activeStepUnit.unitId}` });
                          }
                        }}
                      />
                    )}
                    {showScanner && (
                      <form
                        className="dock-barcode-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (barcodeInput.trim()) {
                            const res = verifyBarcodeMatch(barcodeInput, activeStepUnit.unitId, activeStepUnit.label, activeStepUnitInfo?.barcode);
                            if (res.matched) {
                              const confirmation = codeConfirmation('entered-code', activeStepUnit.unitId, res)!;
                              setConfirmations((current) => ({ ...current, [confirmation.unitId]: confirmation }));
                              setScanStatus({ ok: true, msg: confirmationLabel(confirmation) });
                              const next = currentStepNum + 1;
                              setUpTo(next >= working.length ? null : next);
                              const targetUnit = working.find((w) => w.order === next);
                              if (targetUnit) setSel(targetUnit.unitId);
                              setBarcodeInput('');
                              setTimeout(() => setScanStatus(null), 3000);
                            } else {
                              setScanStatus({ ok: false, msg: `Tag "${barcodeInput}" mismatch for ${activeStepUnit.unitId}` });
                            }
                          }
                        }}
                      >
                        <input
                          type="text"
                          className="txt mono"
                          placeholder={`Scan tag for ${activeStepUnit.unitId}…`}
                          value={barcodeInput}
                          onChange={(e) => setBarcodeInput(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="btn sm primary">Verify</button>
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={() => {
                            const confirmation: LoadingConfirmation = { method: 'manual', unitId: activeStepUnit.unitId };
                            setConfirmations((current) => ({ ...current, [confirmation.unitId]: confirmation }));
                            setScanStatus({ ok: true, msg: confirmationLabel(confirmation) });
                            const next = currentStepNum + 1;
                            setUpTo(next >= working.length ? null : next);
                            const targetUnit = working.find((w) => w.order === next);
                            if (targetUnit) setSel(targetUnit.unitId);
                            setTimeout(() => setScanStatus(null), 3000);
                          }}
                        >
                          Manually confirm (no scan)
                        </button>
                      </form>
                    )}
                    {scanStatus && (
                      <span className={`chip sm ${scanStatus.ok ? 'ok' : 'err'}`}>
                        {scanStatus.msg}
                      </span>
                    )}
                    {confirmations[activeStepUnit.unitId] && <p className="small">{confirmationLabel(confirmations[activeStepUnit.unitId])}. Session only; not a durable loading record.</p>}
                  </div>
                </div>
              )}
            </div>

            <div className="dock-hud-side">
              <div className="dock-compass">
                <span className="compass-t">FRONT (NOSE) ⬆</span>
                <div className="compass-mid">
                  <span>⬅ DRIVER</span>
                  <span className="compass-dot">+</span>
                  <span>CURB &rarr;</span>
                </div>
                <span className="compass-b">REAR DOOR ⬇</span>
              </div>

              {metrics.axleEst && (
                <div className="dock-axle-summary">
                  <div className="dock-axle-head-row">
                    <span className="dock-axle-title">Axle Weight Distribution (Est.)</span>
                    {metrics.axleEst.bridgeFormulaCompliant !== undefined && (
                      <span className="chip sm warn">
                        {metrics.axleEst.bridgeFormulaCompliant ? 'Within assumed benchmark; actual status unknown' : 'Assumed benchmark exceeded; actual status unknown'}
                      </span>
                    )}
                  </div>
                  <div className="axle-meter">
                    <div className="axle-row">
                      <span>Steer: {fmtKgDual(metrics.axleEst.steerKg)}</span>
                      <b className="mono">{metrics.axleEst.steerPct}%</b>
                    </div>
                    <div className="meter-bar"><div className="meter-fill" style={{ width: `${Math.min(100, metrics.axleEst.steerPct)}%` }} /></div>
                  </div>
                  <div className="axle-meter">
                    <div className="axle-row">
                      <span>Drive Tandem: {fmtKgDual(metrics.axleEst.driveKg)}</span>
                      <b className="mono">{metrics.axleEst.drivePct}%</b>
                    </div>
                    <div className="meter-bar"><div className="meter-fill" style={{ width: `${Math.min(100, metrics.axleEst.drivePct)}%` }} /></div>
                  </div>
                  <div className="axle-meter">
                    <div className="axle-row">
                      <span>Trailer Tandem: {fmtKgDual(metrics.axleEst.trailerKg)}</span>
                      <b className="mono">{metrics.axleEst.trailerPct}%</b>
                    </div>
                    <div className="meter-bar"><div className="meter-fill" style={{ width: `${Math.min(100, metrics.axleEst.trailerPct)}%` }} /></div>
                  </div>
                  <span className="disclaimer-tiny">Engineering estimate. Check on certified scale.</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="vbar" role="toolbar" aria-label="Plan view controls">
          <div className="seg" role="tablist" aria-label="View">
            {([['iso', 'Isometric 3D'], ['top', 'Top (Plan)'], ['side', 'Side Elevation']] as [View, string][]).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>))}
          </div>
          {view === 'iso' && <>
            <button className="btn sm" onClick={() => setRot((r) => (r + 3) % 4)} title="Rotate view 90° CCW">⟲ {rot * 90}°</button>
            <button className="btn sm" onClick={() => setRot((r) => (r + 1) % 4)} title="Rotate view 90° CW">⟳ {((rot + 1) * 90) % 360}°</button>
            <button className={`btn sm ${xray ? 'accent-active' : ''}`} onClick={() => setXray(!xray)} title="Toggle X-Ray translucent view">
              {xray ? 'X-Ray ON' : 'X-Ray'}
            </button>
            <button className={`btn sm ${showGrid ? 'accent-active' : ''}`} onClick={() => setShowGrid(!showGrid)} title="Toggle floor grid lines">
              {showGrid ? '⊞ Grid ON' : '⊞ Grid'}
            </button>
            <label className="inl tool-slider" title="Volumetric exploded view">
              Explode
              <input type="range" min="0" max="1" step="0.05" value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
              <span className="mono">{Math.round(explode * 100)}%</span>
            </label>
            <label className="inl tool-slider" title="Longitudinal cutaway plane (peel from door to nose)">
              Cutaway
              <input type="range" min="0.1" max="1" step="0.05" value={sliceX ?? 1} onChange={(e) => { const v = Number(e.target.value); setSliceX(v >= 0.99 ? null : v); }} />
              <span className="mono">{sliceX !== null ? `${Math.round(sliceX * 100)}%` : 'Full'}</span>
            </label>
            <button className={`btn sm ${blueprint ? 'accent-active' : ''}`} onClick={() => setBlueprint(!blueprint)} title="Toggle technical Prussian blueprint mode (B)">
              Blueprint
            </button>
            <button className={`btn sm ${showCoG ? 'accent-active' : ''}`} onClick={() => setShowCoG(!showCoG)} title="Toggle 3D Center of Gravity plumb-bob and target reticle">
              CoG
            </button>
          </>}
          <button className={`btn sm ${dockMode ? 'accent-active dock-active' : ''}`} onClick={() => setDockMode(!dockMode)} title="Toggle full-screen Tactile Dock HUD (D)">
            Dock HUD
          </button>
          <button className="btn sm" onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))} aria-label="Zoom in">＋</button>
          <button className="btn sm" onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))} aria-label="Zoom out">－</button>
          <button className="btn sm ghost" onClick={() => { setZoom(1); setRot(0); setXray(false); setShowGrid(true); setFilterRowUid(null); setExplode(0); setSliceX(null); setBlueprint(false); }}>Reset</button>

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
            <button className="btn sm" disabled={reduced || working.length < 2} title={reduced ? 'Reduced motion is on — use the slider' : 'Play loading sequence (Space)'}
              onClick={() => { if (playing) setPlaying(false); else { setUpTo(0); setPlaying(true); } }}>{playing ? 'Pause' : 'Play Sequence'}</button>
            <input type="range" min={0} max={working.length} value={upTo ?? working.length} aria-label="Loading step"
              onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setUpTo(v >= working.length ? null : v); }} />
            <span className="mono">{upTo ?? working.length}/{working.length}</span>
          </div>
        </div>
        <div className="canvas" ref={vref} tabIndex={0} role="group"
          aria-label="Spatial plan. Click an item to select it. With an item selected, arrow keys move it in the floor plane, Page Up and Page Down change height, R rotates."
          onKeyDown={onKey} onClick={onPick}
          style={{ ['--zoom' as string]: zoom }}
        >
          <div dangerouslySetInnerHTML={{ __html: svg }} style={{ width: '100%', height: '100%' }} />
          {selP && selU && (
            <div className="canvas-unit-hud" role="region" aria-label="Selected Cargo Unit Quick HUD">
              <div className="canvas-hud-header">
                <div className="canvas-hud-title">
                  <span className="mono badge-sel">{selP.unitId}</span>
                  <b>{selU.label}</b>
                </div>
                <button className="btn sm ghost icon-btn" onClick={() => setSel(null)} title="Deselect (Esc)">Close</button>
              </div>
              <div className="canvas-hud-grid">
                <div><span>Dimensions:</span> <b>{fmtMmDual(selP.dx)} × {fmtMmDual(selP.dy)} × {fmtMmDual(selP.dz)}</b></div>
                <div><span>Weight:</span> <b>{selU.weightKg ? fmtKgDual(selU.weightKg) : 'Unknown'}</b></div>
                <div><span>Coords (x, y, z):</span> <b className="mono">({Math.round(selP.x)}, {Math.round(selP.y)}, {Math.round(selP.z)}) mm</b></div>
                <div><span>Layer / Support:</span> <b>{selP.z <= EPS ? 'Bed floor (Tier 1)' : `Tier (+${Math.round(selP.z)} mm)`}</b></div>
                {selU.stop && <div><span>Delivery Drop:</span> <b>Stop #{selU.stop}</b></div>}
              </div>
              <div className="canvas-hud-actions">
                <button className="btn sm" disabled={!!readOnly} onClick={rotate} title="Rotate 90° (R)">⟳ Rotate (R)</button>
                <button className="btn sm ghost" disabled={!!readOnly} onClick={dropToRest} title="Drop to bed or resting box">⤓ Drop to Rest</button>
                <button className="btn sm danger ghost" disabled={!!readOnly} onClick={removeFromPlan} title="Remove unit from plan">Remove</button>
              </div>
            </div>
          )}
        </div>
        <div className="legend" aria-label="Colour legend">
          {scenario.rows.map((r) => <span key={r.uid}><i style={{ background: colors.get(r.uid)?.fill, borderColor: colors.get(r.uid)?.stroke }} />{r.label}</span>)}
          <span><i className="door" />door end</span>
        </div>
      </div>

      <div className="plan-cols">
        <div className="panel">
          <div className="panel-h">
            <b>Placements ({filteredPlacements.length})</b>
            <span>readable equivalent of the drawing · hover to spotlight · click to select</span>
          </div>
          <div className="search-box">
            <input type="text" className="txt" placeholder="Filter by Unit ID or label…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button className="btn sm ghost" onClick={() => setQuery('')}>Close</button>}
          </div>
          <div className="tablewrap short">
            <table className="grid slim" aria-label="Placements">
              <thead><tr><th>#</th><th>Unit</th><th>x, y, z (mm)</th><th>dx × dy × dz</th></tr></thead>
              <tbody>
                {filteredPlacements.map((w) => (
                  <tr
                    key={w.unitId}
                    ref={(el) => { if (el) rowRefs.current.set(w.unitId, el); else rowRefs.current.delete(w.unitId); }}
                    className={`${sel === w.unitId ? 'sel' : ''}${hoveredId === w.unitId ? ' hov' : ''}${bad.has(w.unitId) ? ' has-err' : ''}`}
                    onClick={() => setSel(w.unitId)}
                    onMouseEnter={() => setHoveredId(w.unitId)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
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

              <div className="nudge-step-bar">
                <span className="muted small">Nudge distance:</span>
                <div className="btn-group-sm">
                  {([10, 50, 100, 500] as const).map((s) => (
                    <button
                      key={s}
                      className={`btn sm ${nudgeStep === s ? 'primary' : 'ghost'}`}
                      onClick={() => setNudgeStep(s)}
                    >
                      {s} mm
                    </button>
                  ))}
                </div>
              </div>

              <div className="nudge">
                <button className="btn sm" disabled={!!readOnly} onClick={() => move(-nudgeStep, 0, 0)}>← x</button><button className="btn sm" disabled={!!readOnly} onClick={() => move(nudgeStep, 0, 0)}>x →</button>
                <button className="btn sm" disabled={!!readOnly} onClick={() => move(0, -nudgeStep, 0)}>↑ y</button><button className="btn sm" disabled={!!readOnly} onClick={() => move(0, nudgeStep, 0)}>y ↓</button>
                <button className="btn sm" disabled={!!readOnly} onClick={() => move(0, 0, nudgeStep)}>z ↑</button><button className="btn sm" disabled={!!readOnly} onClick={() => move(0, 0, -nudgeStep)}>z ↓</button>
                <button className="btn sm" disabled={!!readOnly} onClick={rotate}>Rotate (R)</button>
                <button className="btn sm danger" disabled={!!readOnly} onClick={removeFromPlan}>Remove from plan</button>
              </div>
              <p className="muted small">Step {nudgeStep} mm. x runs from front wall to door; y across width; z up. (Arrow keys & PageUp/Down)</p>
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
            <li key={c.id} className={c.state}><span className="cs">{c.state === 'verified' ? 'Checked' : c.state === 'not_modeled' ? 'Not modeled' : c.state === 'not_declared' ? 'Not declared' : 'Unknown'}</span><b>{c.label}</b><span className="muted small"> — {c.note}</span></li>))}
        </ul>
      </div>
      <div className="foot-actions"><button className="btn" onClick={() => p.go('decision')}>← Compare</button><button className="btn primary" onClick={() => p.go('versions')}>Next: save & export →</button></div>

      <TandemSliderModal
        geometryInput={geometryInput}
        isOpen={isTandemModalOpen}
        onClose={() => setIsTandemModalOpen(false)}
        onApplyConfig={(cfg) => {
          const res = simulateTandemSlide(geometryInput, cfg);
          const artifact = { scope: modeledScope, value: {
            tandemHole: cfg.tandemHole,
            fifthWheelPosition: cfg.fifthWheelPosition,
            kpraFt: res.kpraFt,
            legal: res.allAxlesLegal,
          } };
          p.setTandemConfig(artifact);
          let stored = true;
          try { saveModeledArtifact(window.localStorage, 'tandem', artifact); } catch { stored = false; }
          p.notify(stored ? 'ok' : 'warn', `Applied Tandem Pin Hole #${cfg.tandemHole} (modeled KPRA: ${res.kpraFt}ft, ${res.allAxlesLegal ? 'within assumed benchmarks' : 'assumed benchmark exceeded'}; actual status unverified).${stored ? '' : ' Available in this session only; browser artifact storage could not be updated.'}`);
        }}
      />
      <HazmatSegregationModal
        hazmatItems={hazmatItems}
        isOpen={isHazmatModalOpen}
        onClose={() => setIsHazmatModalOpen(false)}
      />
      <NmfcClassificationModal
        key={modeledScope}
        isOpen={isNmfcModalOpen}
        onClose={() => setIsNmfcModalOpen(false)}
        initialWeightLbs={working.length > 0 && working.every(w => { const weight = unitMap.get(w.unitId)?.weightKg; return weight !== null && weight !== undefined && Number.isFinite(weight) && weight > 0; }) ? Math.round((metrics?.loadedWeightKg ?? 0) * 2.20462) : 0}
        initialVolumeCuFt={eq && metrics ? Math.round((eq.L * eq.W * eq.H * metrics.occupiedVolumePct / 100) / 28316846.592) : 0}
        onApplyClassification={(summary) => {
          const artifact = { scope: modeledScope, value: {
            primaryClass: summary.primaryClass,
            densityLbsCuFt: summary.densityLbsCuFt,
            dimWeightPenaltyLbs: summary.dimWeightPenaltyLbs,
            assumptions: summary.assumptions,
          } };
          p.setNmfcSummary(artifact);
          let stored = true;
          try { saveModeledArtifact(window.localStorage, 'nmfc', artifact); } catch { stored = false; }
          p.notify(stored ? 'ok' : 'warn', `Illustrative density class ${summary.primaryClass} (${summary.densityLbsCuFt.toFixed(1)} lbs/cu ft) recorded for this arrangement; actual classification is unverified.${stored ? '' : ' Available in this session only; browser artifact storage could not be updated.'}`);
        }}
      />
      <DunnageAirbagModal
        isOpen={isDunnageModalOpen}
        onClose={() => setIsDunnageModalOpen(false)}
        report={dunnageReport}
      />
      <MultiTempBulkheadModal
        cargoRows={scenario.rows}
        isOpen={isBulkheadModalOpen}
        onClose={() => setIsBulkheadModalOpen(false)}
        onApply={(pos, zones) => {
          p.notify('ok', `Applied Bulkhead at ${pos}" (${zones.map(z => z.toUpperCase()).join(' / ')})`);
        }}
      />
      <CartonCompressionModal
        isOpen={isCompressionModalOpen}
        onClose={() => setIsCompressionModalOpen(false)}
        onApplyLimit={(maxSafeTiers) => {
          p.notify('ok', `Carton stacking limit set to ${maxSafeTiers} max tiers.`);
        }}
      />
    </section>
  );
}
