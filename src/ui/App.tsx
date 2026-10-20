import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { expandUnits, normalizeEquipment, validateEquipment, validateRows } from '../engine/normalize';
import { scenarioHash, summarize, type ResultSummary } from '../engine/scenario';
import { loadAll, saveRevision, type SavedScenario } from '../engine/storage';
import type { EquipmentResult, Placement, Scenario } from '../engine/types';
import { readPlanFile, type PlanFile } from '../engine/report';
import { computeMetrics, buildChecks } from '../engine/analyze';
import { Landing } from './Landing';
import { CargoStep } from './CargoStep';
import { EquipmentStep } from './EquipmentStep';
import { DecisionStep } from './DecisionStep';
import { PlanStep } from './PlanStep';
import { VersionsStep } from './VersionsStep';
import { blankScenario, sampleScenario } from './samples';
import { useSolver } from './useSolver';
import { getFreightPricingBaseUrl } from '../engine/quoteBridge';

export type StepId = 'cargo' | 'equipment' | 'decision' | 'plan' | 'versions';
export const STEPS: { id: StepId; n: string; label: string; hint: string }[] = [
  { id: 'cargo', n: '01', label: 'Cargo', hint: 'Manifest & units' },
  { id: 'equipment', n: '02', label: 'Equipment', hint: 'Spaces & limits' },
  { id: 'decision', n: '03', label: 'Decision', hint: 'Compare & what-if' },
  { id: 'plan', n: '04', label: 'Plan', hint: 'Inspect & adjust' },
  { id: 'versions', n: '05', label: 'Save & export', hint: 'Versions & files' },
];

export interface Toast { id: number; tone: 'ok' | 'warn' | 'err'; text: string }
export interface Baseline { label: string; savedAt: string; scenario: Scenario; summaries: ResultSummary[] }

function parseHash(): { page: 'landing' | 'app'; step: StepId } {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h.startsWith('app')) {
    const s = h.split('/')[1] as StepId;
    return { page: 'app', step: STEPS.some((x) => x.id === s) ? s : 'cargo' };
  }
  return { page: 'landing', step: 'cargo' };
}

export function App() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const f = () => setRoute(parseHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const go = useCallback((step: StepId) => { window.location.hash = `#/app/${step}`; }, []);

  const [scenario, setScenario] = useState<Scenario>(() => sampleScenario('mixed'));
  const [readOnly, setReadOnly] = useState<PlanFile | null>(null);
  const solver = useSolver();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const notify = useCallback((tone: Toast['tone'], text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const [saved, setSaved] = useState<SavedScenario[]>(() => loadAll(window.localStorage));
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [lastSavedHash, setLastSavedHash] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);

  const [planEq, setPlanEq] = useState<string | null>(null);
  const [arrIdx, setArrIdx] = useState(0);
  const [edits, setEdits] = useState<Record<string, Placement[]>>({});

  const hash = useMemo(() => scenarioHash(scenario), [scenario]);
  const issues = useMemo(
    () => [...validateRows(scenario.rows), ...validateEquipment(scenario.equipment.filter((e) => e.included))],
    [scenario.rows, scenario.equipment],
  );
  const stale = solver.state.solvedHash !== hash;
  const unsaved = lastSavedHash !== hash;

  // Debounced recompute on any input change (cancels in-flight work).
  useEffect(() => {
    if (readOnly || route.page !== 'app') return;
    if (solver.state.solvedHash === hash && solver.state.phase === 'done') return;
    const t = setTimeout(() => solver.run(scenario), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, readOnly, route.page]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (unsaved && route.page === 'app' && scenario.rows.length) { e.preventDefault(); } };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [unsaved, route.page, scenario.rows.length]);

  // New results invalidate manual edits
  useEffect(() => { setEdits({}); setArrIdx(0); }, [solver.state.solvedHash]);

  const results = solver.state.results;
  const units = useMemo(() => expandUnits(scenario.rows), [scenario.rows]);

  const setScenarioSafe = useCallback((fn: (s: Scenario) => Scenario) => {
    if (readOnly) { notify('warn', 'Read-only plan. Use “Open as editable copy” first.'); return; }
    setScenario(fn);
  }, [readOnly, notify]);

  const loadScenario = useCallback((s: Scenario, id: string | null = null, savedHash: string | null = null) => {
    setReadOnly(null);
    setScenario(s);
    setCurrentId(id);
    setLastSavedHash(savedHash);
    setPlanEq(null);
    setEdits({});
    setBaseline(null);
  }, []);

  const doSave = useCallback((note: string) => {
    if (readOnly) { notify('warn', 'Read-only plans cannot be saved as scenarios.'); return; }
    if (stale || solver.state.phase !== 'done') { notify('warn', 'Wait for the plan to finish computing, then save so the revision matches its results.'); return; }
    try {
      const { saved: sc, revision } = saveRevision(window.localStorage, currentId, scenario, hash, results, results.map(summarize), note);
      setSaved(loadAll(window.localStorage));
      setCurrentId(sc.id);
      setLastSavedHash(hash);
      notify('ok', `Saved revision ${revision.rev} of “${sc.name}” to this browser (verified by read-back).`);
    } catch (e) {
      notify('err', `NOT saved: ${(e as Error).message}`);
    }
  }, [readOnly, stale, solver.state.phase, currentId, scenario, hash, results, notify]);

  const openPlanFile = useCallback((text: string) => {
    const r = readPlanFile(text);
    if (!r.ok) { notify('err', `Could not open plan: ${r.error}`); return; }
    const p = r.plan;
    const prof = p.scenario.equipment.find((e) => e.id === p.equipmentId)!;
    const eq = normalizeEquipment(prof)!;
    const us = expandUnits(p.scenario.rows);
    const placedIds = new Set(p.placements.map((x) => x.unitId));
    const known = ['FEASIBLE_UNDER_MODELED_CONSTRAINTS', 'PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS', 'NOT_FOUND_WITHIN_SEARCH_BUDGET', 'INCOMPLETE_INPUT', 'NEEDS_PHYSICAL_REVIEW'];
    const metrics = computeMetrics(us, eq, p.placements);
    const res: EquipmentResult = {
      equipmentId: p.equipmentId, equipmentName: prof.name,
      status: (known.includes(p.status) ? p.status : 'NEEDS_PHYSICAL_REVIEW') as EquipmentResult['status'],
      geometryFeasible: p.placements.length === us.length, reasons: p.reasons ?? [],
      arrangements: [{ name: p.arrangementName, placements: p.placements, unplacedIds: us.filter((u) => !placedIds.has(u.id)).map((u) => u.id) }],
      best: 0, metrics, violations: r.violations, checks: buildChecks(eq, metrics.unknownWeightUnits, r.violations.length === 0),
      solver: { version: p.engineVersion, seed: p.scenario.settings.seed, attempts: 0, budget: 0, stopReason: 'no_solve', ms: 0 },
    };
    setScenario(p.scenario);
    setReadOnly(p);
    setCurrentId(null);
    setLastSavedHash(null);
    setPlanEq(p.equipmentId);
    setEdits({});
    solver.restore([res], scenarioHash(p.scenario));
    notify(r.violations.length ? 'warn' : 'ok', r.violations.length
      ? `Plan opened read-only. Re-validation found ${r.violations.length} violation(s).`
      : 'Plan opened read-only and re-validated: no violations of the modeled constraints.');
    window.location.hash = '#/app/plan';
  }, [notify, solver]);

  const api: AppApi = {
    scenario, setScenario: setScenarioSafe, readOnly, issues, units, hash, stale, unsaved, solver,
    results, notify, go, saved, setSaved, currentId, doSave, loadScenario, baseline, setBaseline,
    planEq, setPlanEq, arrIdx, setArrIdx, edits, setEdits, openPlanFile,
    leaveReadOnly: () => { setReadOnly(null); solver.run(scenario); notify('ok', 'Editable copy opened. Plans are recomputing from the inputs.'); },
  };

  if (route.page === 'landing') {
    return <Landing
      onSample={(id) => { loadScenario(sampleScenario(id)); window.location.hash = '#/app/cargo'; }}
      onBlank={() => { loadScenario(blankScenario()); window.location.hash = '#/app/cargo'; }}
      hasSaved={saved.length > 0}
      onOpenSaved={() => { window.location.hash = '#/app/versions'; }}
    />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Cargo Fit home"><span className="mark" aria-hidden="true" />Cargo Fit<span className="tag">Product 01 · working title</span></a>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          <a href={getFreightPricingBaseUrl()} target="_blank" rel="noreferrer" className="btn sm ghost" title="Open Product 02: Freight Pricing & Telemetry HUD">💰 Pricing ↗</a>
          <a href={typeof window !== 'undefined' && window.location.hostname.includes('pages.dev') ? 'https://hosdispatch.pages.dev' : 'http://localhost:5175/'} target="_blank" rel="noreferrer" className="btn sm ghost" title="Open Product 03: HOS & Corridor Legality Planner">⏱️ HOS ↗</a>
        </div>
        <input className="name" aria-label="Scenario name" value={scenario.name} disabled={!!readOnly}
          onChange={(e) => setScenarioSafe((s) => ({ ...s, name: e.target.value }))} />
        <div className="chips" aria-live="polite">
          {readOnly && <span className="chip warn">Read-only plan</span>}
          <span className={`chip ${solver.state.phase === 'running' ? 'run' : stale ? 'warn' : 'ok'}`}>
            {solver.state.phase === 'running' ? `Computing ${solver.state.progress.done}/${solver.state.progress.total}…` : solver.state.phase === 'cancelled' ? 'Cancelled' : stale ? 'Results stale' : 'Plans up to date'}
          </span>
          {!readOnly && <span className={`chip ${unsaved ? 'warn' : 'ok'}`}>{unsaved ? 'Unsaved' : 'Saved'}</span>}
          {solver.state.phase === 'running' && <button className="btn sm" onClick={solver.cancel}>Cancel</button>}
          {(solver.state.phase === 'cancelled' || (stale && solver.state.phase !== 'running' && !readOnly)) && <button className="btn sm" onClick={() => solver.run(scenario)}>Recompute</button>}
        </div>
      </header>
      <nav className="rail" aria-label="Workflow steps">
        {STEPS.map((s) => (
          <a key={s.id} href={`#/app/${s.id}`} className={route.step === s.id ? 'on' : ''} aria-current={route.step === s.id ? 'page' : undefined}>
            <span className="n">{s.n}</span><span className="l">{s.label}<small>{s.hint}</small></span>
          </a>
        ))}
        <div className="rail-foot">Geometric planning aid. Not a safety, axle or legal certificate.</div>
      </nav>
      <main className="main" id="main">
        {readOnly && (
          <div className="banner warn" role="status">
            <b>Read-only plan.</b> Opened from a plan file and re-validated here. Editing and saving are disabled.
            <button className="btn sm" onClick={api.leaveReadOnly}>Open as editable copy</button>
          </div>
        )}
        {route.step === 'cargo' && <CargoStep {...api} />}
        {route.step === 'equipment' && <EquipmentStep {...api} />}
        {route.step === 'decision' && <DecisionStep {...api} />}
        {route.step === 'plan' && <PlanStep {...api} />}
        {route.step === 'versions' && <VersionsStep {...api} />}
      </main>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
    </div>
  );
}

/** One prop contract shared by every step component (no context needed). */
export interface AppApi {
  scenario: Scenario;
  setScenario: (fn: (s: Scenario) => Scenario) => void;
  readOnly: PlanFile | null;
  issues: ReturnType<typeof validateRows>;
  units: ReturnType<typeof expandUnits>;
  hash: string;
  stale: boolean;
  unsaved: boolean;
  solver: ReturnType<typeof useSolver>;
  results: EquipmentResult[];
  notify: (tone: Toast['tone'], text: string) => void;
  go: (s: StepId) => void;
  saved: SavedScenario[];
  setSaved: (s: SavedScenario[]) => void;
  currentId: string | null;
  doSave: (note: string) => void;
  loadScenario: (s: Scenario, id?: string | null, savedHash?: string | null) => void;
  baseline: Baseline | null;
  setBaseline: (b: Baseline | null) => void;
  planEq: string | null;
  setPlanEq: (id: string | null) => void;
  arrIdx: number;
  setArrIdx: (n: number) => void;
  edits: Record<string, Placement[]>;
  setEdits: (e: Record<string, Placement[]>) => void;
  openPlanFile: (text: string) => void;
  leaveReadOnly: () => void;
}
