import { analyzeEquipment } from './analyze';
import { expandUnits, hasErrors, normalizeEquipment, validateEquipment, validateRows } from './normalize';
import { newUid } from './csv';
import type {
  CargoRow, EquipmentProfile, EquipmentResult, InputIssue, Scenario, Settings, Unit,
} from './types';

export const DEFAULT_SETTINGS: Settings = { seed: 42, maxAttempts: 40, maxMs: 6000, minSupportPct: 100 };

export const blankRow = (): CargoRow => ({
  uid: newUid(), label: '', qty: 1, length: null, width: null, height: null, dimUnit: 'mm',
  weight: null, weightUnit: 'kg', rotation: 'upright', stackable: false,
});

export const blankEquipment = (): EquipmentProfile => ({
  id: newUid('e'), name: 'New equipment', length: null, width: null, height: null, unit: 'mm',
  doorWidth: null, doorHeight: null, payload: null, massUnit: 'kg', cost: null, currency: 'USD',
  costSource: 'none', source: 'User-entered', included: true,
});

/** Stable FNV-1a hash of everything that influences a solve (uids excluded from order sensitivity). */
export function scenarioHash(s: Scenario): string {
  const payload = JSON.stringify({
    r: s.rows.map((r) => [r.uid, r.label, r.qty, r.length, r.width, r.height, r.dimUnit, r.weight, r.weightUnit, r.rotation, r.stackable]),
    e: s.equipment.filter((e) => e.included).map((e) => [e.id, e.name, e.length, e.width, e.height, e.unit, e.doorWidth, e.doorHeight, e.payload, e.massUnit, e.cost, e.costSource]),
    s: [s.settings.seed, s.settings.maxAttempts, s.settings.minSupportPct],
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface ScenarioAnalysis {
  hash: string;
  issues: InputIssue[];
  units: Unit[];
  results: EquipmentResult[];
  cargoValid: boolean;
}

/** Synchronous orchestration (used by tests, the report, and the worker). */
export function analyzeScenario(
  s: Scenario,
  hooks: { shouldCancel?: () => boolean; onResult?: (r: EquipmentResult, done: number, total: number) => void } = {},
): ScenarioAnalysis {
  const issues = [...validateRows(s.rows), ...validateEquipment(s.equipment.filter((e) => e.included))];
  const cargoValid = !issues.some((i) => i.scope === 'cargo' && i.severity === 'error');
  const units = expandUnits(s.rows);
  const eqs = s.equipment.filter((e) => e.included);
  const results: EquipmentResult[] = [];
  for (const e of eqs) {
    if (hooks.shouldCancel?.()) break;
    const r = analyzeEquipment(units, normalizeEquipment(e), e.name, s.settings, { cargoValid, shouldCancel: hooks.shouldCancel });
    r.equipmentId = e.id;
    results.push(r);
    hooks.onResult?.(r, results.length, eqs.length);
  }
  return { hash: scenarioHash(s), issues, units, results, cargoValid };
}

export const inputBlocked = (issues: InputIssue[]) => hasErrors(issues);

/* ---------- what-if diff ---------- */

export interface RowChange { uid: string; label: string; kind: 'added' | 'removed' | 'changed'; fields: string[] }

export function diffRows(before: CargoRow[], after: CargoRow[]): RowChange[] {
  const out: RowChange[] = [];
  const b = new Map(before.map((r) => [r.uid, r]));
  const a = new Map(after.map((r) => [r.uid, r]));
  for (const r of after) {
    const o = b.get(r.uid);
    if (!o) { out.push({ uid: r.uid, label: r.label, kind: 'added', fields: [] }); continue; }
    const fields = (['label', 'qty', 'length', 'width', 'height', 'dimUnit', 'weight', 'weightUnit', 'rotation', 'stackable'] as const)
      .filter((f) => o[f] !== r[f]);
    if (fields.length) out.push({ uid: r.uid, label: r.label, kind: 'changed', fields });
  }
  for (const r of before) if (!a.has(r.uid)) out.push({ uid: r.uid, label: r.label, kind: 'removed', fields: [] });
  return out;
}

export interface ResultSummary {
  equipmentId: string;
  equipmentName: string;
  status: EquipmentResult['status'];
  placed: number;
  total: number;
  occupiedVolumePct: number;
  loadedWeightKg: number;
  payloadRemainingKg: number | null;
}

export const summarize = (r: EquipmentResult): ResultSummary => ({
  equipmentId: r.equipmentId, equipmentName: r.equipmentName, status: r.status,
  placed: r.metrics.placedUnits, total: r.metrics.totalUnits, occupiedVolumePct: r.metrics.occupiedVolumePct,
  loadedWeightKg: r.metrics.loadedWeightKg, payloadRemainingKg: r.metrics.payloadRemainingKg,
});

export interface ResultDelta {
  equipmentName: string;
  before: ResultSummary | null;
  after: ResultSummary | null;
  statusChanged: boolean;
  placedDelta: number;
  weightDeltaKg: number;
}

export function diffResults(before: ResultSummary[], after: ResultSummary[]): ResultDelta[] {
  const out: ResultDelta[] = [];
  const b = new Map(before.map((r) => [r.equipmentId, r]));
  const ids = new Set([...before.map((r) => r.equipmentId), ...after.map((r) => r.equipmentId)]);
  for (const id of ids) {
    const bb = b.get(id) ?? null;
    const aa = after.find((r) => r.equipmentId === id) ?? null;
    out.push({
      equipmentName: (aa ?? bb)!.equipmentName, before: bb, after: aa,
      statusChanged: bb?.status !== aa?.status,
      placedDelta: (aa?.placed ?? 0) - (bb?.placed ?? 0),
      weightDeltaKg: (aa?.loadedWeightKg ?? 0) - (bb?.loadedWeightKg ?? 0),
    });
  }
  return out;
}
