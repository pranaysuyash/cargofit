import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { expandUnits, normalizeEquipment, validateEquipment, validateRows } from '../engine/normalize';
import { scenarioHash, summarize, type ResultSummary } from '../engine/scenario';
import { loadAll, saveRevision, SavedScenariosReadError, type SavedScenario } from '../engine/storage';
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
import { scenarioFromSuiteParams } from './suiteImport';
import type { ScopedArtifact, TandemArtifact, NmfcArtifact } from '../engine/modeledArtifacts';
import { useSolver } from './useSolver';
import { SuiteDock } from './SuiteDock';
import { platformBus } from '../engine/platformBus';
import { useShipmentContext } from '../suite/useShipmentContext';
import { scenarioForShipment, unitsForScenario, resultForPlan } from '../engine/shipmentAdapter';
import { useShipmentSession } from '../suite/ShipmentSession';
import type { Shipment } from '../suite/types';
import { StructuredValue } from '../suite/ShipmentInspector';

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

  const [scenario, setScenario] = useState<Scenario>(() =>
    scenarioFromSuiteParams(new URLSearchParams(window.location.search)) ?? sampleScenario('mixed'));
  const [readOnly, setReadOnly] = useState<PlanFile | null>(null);
  const session = useShipmentSession();
  const imported = useRef<{ id: string; revision: number; inputRevision: number; assetAt?: string; hash: string } | null>(null);
  const currentDraftHash = useRef(scenarioHash(scenario)); currentDraftHash.current = scenarioHash(scenario);
  const manualDraft = useRef(false);
  const [incoming, setIncoming] = useState<Shipment | null>(null);
  const [publicationMessage, setPublicationMessage] = useState('');
  function importShared(shipment: Shipment) {
    try {
      let next = scenarioForShipment(shipment);
      const savedFit = shipment.results.fit;
      if (savedFit?.ok && savedFit.inputRevision === shipment.inputRevision && savedFit.details.nativeScenario && savedFit.details.nativeResult) {
        const savedScenario = savedFit.details.nativeScenario as Scenario;
        const savedResult = savedFit.details.nativeResult as EquipmentResult;
        const mapped = unitsForScenario(shipment, savedScenario);
        if (JSON.stringify(mapped) !== JSON.stringify(shipment.input.units)) throw new Error('The saved native cargo inputs differ from the manifest. Inspect the saved fit before restoring it.');
        const checked = resultForPlan(shipment, savedScenario, savedResult, savedFit.details.placements as Placement[]);
        if (!checked.ok) throw new Error('The saved reviewed arrangement needs inspection before it can be restored.');
        next = structuredClone(savedScenario);
        solver.restore([structuredClone(savedResult)], scenarioHash(next));
      }
      imported.current = { id: shipment.id, revision: shipment.revision, inputRevision: shipment.inputRevision, assetAt: shipment.results.asset?.recordedAt, hash: scenarioHash(next) };
      setIncoming(null); setReadOnly(null);
      setEdits({}); setArrIdx(0); setPlanEq(null);
      if (currentDraftHash.current !== scenarioHash(next)) setScenario(next);
      if (route.page !== 'app') go('cargo');
    } catch (error) { setPublicationMessage(error instanceof Error ? error.message : 'Shipment import unavailable.'); }
  }
  useShipmentContext(shipment => {
    if (imported.current?.id === shipment.id && imported.current.revision === shipment.revision) return;
    if (imported.current?.id === shipment.id && (currentDraftHash.current !== imported.current.hash || manualDraft.current)) { setIncoming(shipment); return; }
    importShared(shipment);
  }, false, 'record');
  const solver = useSolver();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const notify = useCallback((tone: Toast['tone'], text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const [initialSaved] = useState(() => {
    try { return { scenarios: loadAll(window.localStorage), error: null as string | null }; }
    catch (e) { return { scenarios: [] as SavedScenario[], error: (e as Error).message }; }
  });
  const [saved, setSaved] = useState<SavedScenario[]>(initialSaved.scenarios);
  const [storageError, setStorageError] = useState<string | null>(initialSaved.error);
  const [tandemConfig, setTandemConfig] = useState<ScopedArtifact<TandemArtifact> | null>(null);
  const [nmfcSummary, setNmfcSummary] = useState<ScopedArtifact<NmfcArtifact> | null>(null);

  useEffect(() => {
    const unsub = platformBus.subscribe('VEHICLE_CHANGED', (payload) => {
      notify('ok', `Cross-tab Sync: Equipment updated to ${payload.vehicleName}`);
    });
    return () => unsub();
  }, [notify]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [lastSavedHash, setLastSavedHash] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);

  const [planEq, setPlanEq] = useState<string | null>(null);
  const [arrIdx, setArrIdx] = useState(0);
  const [edits, setEdits] = useState<Record<string, Placement[]>>({});
  manualDraft.current = Object.keys(edits).length > 0;

  const hash = useMemo(() => scenarioHash(scenario), [scenario]);
  useEffect(()=>setPublicationMessage(''),[hash,edits]);
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
      setStorageError(null);
      setCurrentId(sc.id);
      setLastSavedHash(hash);
      notify('ok', `Saved revision ${revision.rev} of “${sc.name}” to this browser (verified by read-back).`);
    } catch (e) {
      if (e instanceof SavedScenariosReadError) setStorageError(e.message);
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
    results, notify, go, saved, setSaved, storageError, setStorageError, currentId, doSave, loadScenario, baseline, setBaseline,
    planEq, setPlanEq, arrIdx, setArrIdx, edits, setEdits, openPlanFile,
    leaveReadOnly: () => { setReadOnly(null); solver.run(scenario); notify('ok', 'Editable copy opened. Plans are recomputing from the inputs.'); },
    tandemConfig, setTandemConfig, nmfcSummary, setNmfcSummary,
  };
  const sharedReview = useMemo(() => {
    if (!session?.shipment) return null;
    try {
      if (readOnly) throw new Error('Open an editable copy before publishing a loading plan.');
      if (!imported.current || imported.current.id !== session.shipment.id) throw new Error('Load the selected shipment into the native editor first.');
      if (imported.current.revision !== session.shipment.revision || imported.current.inputRevision !== session.shipment.inputRevision || imported.current.assetAt !== session.shipment.results.asset?.recordedAt) throw new Error('The shared record changed. Review the incoming shipment before publishing. Your local draft is retained.');
      if (stale || solver.state.phase !== 'done') throw new Error('Wait for current solver results before publishing.');
      const selected = results.find(r => r.equipmentId === planEq && r.arrangements.length) ?? results.find(r => r.arrangements.length);
      if (!selected) throw new Error('No current arrangement is available.');
      const index = Math.min(arrIdx, selected.arrangements.length - 1);
      const placements = edits[`${selected.equipmentId}:${index}`] ?? selected.arrangements[index].placements;
      const sharedUnits = unitsForScenario(session.shipment, scenario);
      const proposed = { ...session.shipment, input: { ...session.shipment.input, units: sharedUnits } };
      const result = resultForPlan(proposed, scenario, selected, placements);
      return { units: sharedUnits, result, error: result.ok ? '' : result.summary };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Publication unavailable.' }; }
  }, [session?.shipment, scenario, readOnly, stale, solver.state.phase, results, planEq, arrIdx, edits, incoming]);

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
      <a href="#main" className="skip-link">Skip to main content</a>
      <SuiteDock currentProductId="product-01-cargo-fit" />
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Cargo Fit home"><span className="mark" aria-hidden="true" />Cargo Fit<span className="tag">Product 01 · working title</span></a>
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
        {session?.shipment && <section className="shipment-product-actions" aria-label="Connected cargo publication">
          <strong>Review cargo and publish this loading plan</strong>
          {session.shipment.status !== 'draft' && <p>Shipment planning is locked after dispatch. Saved records remain available; use standalone tools to explore a detached copy.</p>}
          <p>Changes stay in this draft until you publish. Publishing saves the cargo and selected loading plan together; earlier pricing and receiving decisions then need review.</p>
          {incoming && <p role="status">Shared inputs changed while you were editing. Your draft is retained. Review the incoming record, then explicitly load it to replace this working draft.</p>}
          <div className="shipment-task-buttons">
            <button className="shipment-primary" disabled={session.busy || !session.online || session.shipment.status !== 'draft' || !sharedReview?.result?.ok || Boolean(sharedReview?.error)} onClick={async () => {
              if (!sharedReview?.result?.ok || !sharedReview.units) return;
              const next = await session.submit('cargo.publish', { units: sharedReview.units, result: sharedReview.result }, imported.current?.revision);
              if (next) { imported.current = { id: next.id, revision: next.revision, inputRevision: next.inputRevision, assetAt: next.results.asset?.recordedAt, hash }; setIncoming(null); setPublicationMessage('Reviewed cargo and loading plan saved to the shipment. Continue to Pricing.'); }
            }}>Publish reviewed loading plan</button>
            <button onClick={()=>session.inspect('stage:fit')}>Saved fit details</button>
            <button onClick={()=>session.inspect('shipment')}>Review shared inputs</button>
            <button disabled={session.busy || !session.online} onClick={()=>importShared(incoming ?? session.shipment!)}>Load current shared inputs</button>
            {session.shipment.results.fit?.ok && session.shipment.results.fit.inputRevision === session.shipment.inputRevision && <a href={session.productUrl('product-02-freight-pricing')}>Continue to Pricing</a>}
          </div>
          <p role="status">{sharedReview?.error || publicationMessage || sharedReview?.result?.summary || 'Load and review the shipment to begin.'}</p>
          {sharedReview?.result && <details className="shipment-draft-fields"><summary>Reviewed loading plan, checks and source inputs</summary><StructuredValue value={sharedReview.result.details} /></details>}
          <div className="shipment-native-units" aria-label="Saved handling-unit details">{session.shipment.input.units.map((unit,index)=><button key={unit.id} title={`${unit.id} · ${unit.barcode}`} onClick={()=>session.inspect(`unit:${unit.id}`)}>Unit {index+1}: {unit.description}</button>)}</div>
        </section>}
        {!session?.selectedId && imported.current && <p className="banner" role="status">Detached local copy. This native scenario remains editable; changes do not update the shared shipment.</p>}
        {scenario.equipment.some((e) => e.included && (e.id === 'portal-eq-1' || e.id === 'p04-eq-1')) && <p className="banner warn" role="status">Review imported measurements. Missing values remain blank. Fixed orientation and no-stack are conservative planning defaults, not declarations from the source.</p>}
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
  storageError: string | null;
  setStorageError: (error: string | null) => void;
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
  tandemConfig: ScopedArtifact<TandemArtifact> | null;
  setTandemConfig: (cfg: ScopedArtifact<TandemArtifact> | null) => void;
  nmfcSummary: ScopedArtifact<NmfcArtifact> | null;
  setNmfcSummary: (summary: ScopedArtifact<NmfcArtifact> | null) => void;
}
