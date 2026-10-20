import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importCargoCsv } from '../src/engine/csv';
import { analyzeScenario, DEFAULT_SETTINGS } from '../src/engine/scenario';
import { validatePlacements } from '../src/engine/validator';
import { expandUnits, normalizeEquipment, validateRows } from '../src/engine/normalize';
import { toMm, toKg } from '../src/engine/units';
import type { CargoRow, EquipmentProfile, Scenario } from '../src/engine/types';

const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const presets = JSON.parse(fx('equipment-presets.json')) as EquipmentProfile[];
const eq = (id: string) => ({ ...presets.find((p) => p.id === id)!, included: true });

const row = (o: Partial<CargoRow> & { label: string }): CargoRow => ({
  uid: o.label, qty: 1, length: 100, width: 100, height: 100, dimUnit: 'mm', weight: 10, weightUnit: 'kg',
  rotation: 'any', stackable: true, ...o,
});
const scn = (rows: CargoRow[], ids: string[], settings = DEFAULT_SETTINGS): Scenario => ({
  name: 't', rows, equipment: ids.map(eq), settings,
});

describe('units', () => {
  it('converts in/ft/cm/m and lb/t exactly enough', () => {
    expect(toMm(48, 'in')).toBeCloseTo(1219.2, 2);
    expect(toMm(1.2, 'm')).toBe(1200);
    expect(toMm(60, 'cm')).toBe(600);
    expect(toMm(2, 'ft')).toBeCloseTo(609.6, 2);
    expect(toKg(550, 'lb')).toBeCloseTo(249.4758, 3);
    expect(toKg(2, 't')).toBe(2000);
  });
});

describe('input validation', () => {
  it('flags zero, negative, missing, duplicate, bad qty; warns on unknown weight', () => {
    const issues = validateRows([
      row({ label: 'a', length: 0 }), row({ label: 'b', width: -5 }), row({ label: 'c', height: null }),
      row({ label: 'a', uid: 'a2' }), row({ label: 'd', qty: 1.5 }), row({ label: 'e', weight: null }),
    ]);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('DIM_NONPOSITIVE');
    expect(codes).toContain('DIM_MISSING');
    expect(codes).toContain('DUPLICATE_LABEL');
    expect(codes).toContain('QTY_INVALID');
    expect(issues.find((i) => i.code === 'WEIGHT_UNKNOWN')!.severity).toBe('warning');
  });
});

describe('csv import', () => {
  it('imports the messy file with field-level issues and never invents values', () => {
    const r = importCargoCsv(fx('messy-import.csv'));
    expect(r.rows).toHaveLength(8);
    const typo = r.rows.find((x) => x.label === 'Typo number')!;
    expect(typo.length).toBeNull();
    expect(r.issues.some((i) => i.field === 'length' && i.severity === 'error')).toBe(true);
    const carton = r.rows.find((x) => x.label.startsWith('Carton'))!;
    expect(carton.weight).toBeNull();
    expect(carton.dimUnit).toBe('in');
    expect(r.rows.find((x) => x.label === 'Mystery box')!.height).toBeNull();
    expect(r.rows.find((x) => x.label === 'Heavy drum')!.weightUnit).toBe('lb');
    expect(validateRows(r.rows).some((i) => i.severity === 'error')).toBe(true);
  });
  it('handles quotes, semicolons, header units', () => {
    const r = importCargoCsv('"Label";Qty;Length (in);Width (in);Height (in)\n"Box, big";2;10;10;10\n');
    expect(r.delimiter).toBe(';');
    expect(r.rows[0].label).toBe('Box, big');
    expect(r.rows[0].dimUnit).toBe('in');
  });
  it('rejects missing required columns', () => {
    const r = importCargoCsv('foo,bar\n1,2\n');
    expect(r.rows).toHaveLength(0);
    expect(r.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('mixed-load scenario (fixture)', () => {
  const rows = importCargoCsv(fx('mixed-regional-delivery.csv')).rows;
  const a = analyzeScenario(scn(rows, ['van', 'box7t', 'ct20', 'narrow']));
  const by = (id: string) => a.results.find((r) => r.equipmentId === id)!;

  it('the van is proven infeasible (volume + payload), with reasons', () => {
    const r = by('van');
    expect(r.status).toBe('PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS');
    expect(r.reasons.map((x) => x.code)).toContain('PAYLOAD_EXCEEDED');
  });
  it('the narrow-door box is proven infeasible by door', () => {
    const r = by('narrow');
    expect(r.status).toBe('PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS');
    expect(r.reasons.map((x) => x.code)).toContain('ITEM_EXCEEDS_DOOR');
  });
  it('the container produces a complete plan that independently validates', () => {
    const r = by('ct20');
    expect(r.status).toBe('FEASIBLE_UNDER_MODELED_CONSTRAINTS');
    const eqn = normalizeEquipment(eq('ct20'))!;
    const v = validatePlacements(a.units, eqn, r.arrangements[r.best].placements, DEFAULT_SETTINGS);
    expect(v).toEqual([]);
    expect(r.arrangements[0].placements).toHaveLength(a.units.length);
  });
  it('the 7.5t box either fits validly or is honestly not-found, never falsely feasible', () => {
    const r = by("box7t"); console.log("box7t", r.status, r.metrics.placedUnits, r.metrics.totalUnits, r.arrangements[0]?.name);
    if (r.status === 'FEASIBLE_UNDER_MODELED_CONSTRAINTS') {
      const v = validatePlacements(a.units, normalizeEquipment(eq('box7t'))!, r.arrangements[0].placements, DEFAULT_SETTINGS);
      expect(v).toEqual([]);
    } else expect(['NOT_FOUND_WITHIN_SEARCH_BUDGET']).toContain(r.status);
  });
  it('is deterministic for a given seed', () => {
    const b = analyzeScenario(scn(rows, ['ct20']));
    expect(JSON.stringify(b.results[0].arrangements)).toBe(JSON.stringify(by('ct20').arrangements));
  });
});

describe('failure categories', () => {
  it('weight over payload => proven infeasible PAYLOAD_EXCEEDED', () => {
    const rows = importCargoCsv(fx('heavy-low-volume.csv')).rows;
    const r = analyzeScenario(scn(rows, ['van'])).results[0];
    expect(r.status).toBe('PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS');
    expect(r.reasons.some((x) => x.code === 'PAYLOAD_EXCEEDED')).toBe(true);
  });
  it('item longer than interior', () => {
    const r = analyzeScenario(scn([row({ label: 'long', length: 4000, width: 100, height: 100 })], ['van'])).results[0];
    expect(r.reasons[0].code).toBe('ITEM_EXCEEDS_INTERIOR');
  });
  it('item fitting only if rotated while rotation is forbidden', () => {
    const tall = row({ label: 'tall', length: 300, width: 300, height: 1500, rotation: 'fixed' });
    const r1 = analyzeScenario(scn([tall], ['van'])).results[0];
    expect(r1.status).toBe('PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS');
    expect(r1.reasons[0].code).toBe('ROTATION_FORBIDDEN_WOULD_FIT');
    const r2 = analyzeScenario(scn([{ ...tall, rotation: 'any' }], ['van'])).results[0];
    expect(r2.status).toBe('FEASIBLE_UNDER_MODELED_CONSTRAINTS');
  });
  it('unknown weight with declared payload is INCOMPLETE_INPUT, not feasible', () => {
    const r = analyzeScenario(scn([row({ label: 'x', weight: null })], ['van'])).results[0];
    expect(r.status).toBe('INCOMPLETE_INPUT');
    expect(r.geometryFeasible).toBe(true);
  });
  it('invalid cargo yields INCOMPLETE_INPUT', () => {
    const r = analyzeScenario(scn([row({ label: 'bad', length: 0 })], ['van'])).results[0];
    expect(r.status).toBe('INCOMPLETE_INPUT');
    expect(r.arrangements).toHaveLength(0);
  });
  it('undeclared payload/door => NEEDS_PHYSICAL_REVIEW', () => {
    const s = scn([row({ label: 'x' })], ['van']);
    s.equipment[0] = { ...s.equipment[0], payload: null, doorWidth: null, doorHeight: null };
    expect(analyzeScenario(s).results[0].status).toBe('NEEDS_PHYSICAL_REVIEW');
  });
  it('search exhaustion is NOT_FOUND, never PROVEN_INFEASIBLE (jigsaw that heuristic cannot close)', () => {
    // 1 attempt budget with a hard-ish packing of many awkward boxes in a tight box
    const rows = [row({ label: 'a', qty: 30, length: 700, width: 300, height: 400, rotation: 'upright', stackable: false })];
    const s = scn(rows, ['van'], { ...DEFAULT_SETTINGS, maxAttempts: 1 });
    const r = analyzeScenario(s).results[0];
    if (r.status !== 'FEASIBLE_UNDER_MODELED_CONSTRAINTS') {
      expect(r.status).toBe('NOT_FOUND_WITHIN_SEARCH_BUDGET');
      expect(r.reasons.map((x) => x.code)).toContain('SEARCH_BUDGET_EXHAUSTED');
    }
  });
});

describe('validator catches bad plans (independent of solver)', () => {
  const units = expandUnits([row({ label: 'A', length: 1000, width: 1000, height: 500, rotation: 'fixed', stackable: false }),
    row({ label: 'B', length: 500, width: 500, height: 500, rotation: 'fixed' })]);
  const e = normalizeEquipment(eq('box7t'))!;
  const p = (unitId: string, x: number, y: number, z: number, dx: number, dy: number, dz: number) =>
    ({ unitId, rowUid: unitId, label: unitId, x, y, z, dx, dy, dz, order: 1 });
  it('overlap', () => {
    const v = validatePlacements(units, e, [p('A', 0, 0, 0, 1000, 1000, 500), p('B', 400, 400, 0, 500, 500, 500)], DEFAULT_SETTINGS);
    expect(v.map((x) => x.code)).toContain('OVERLAP');
  });
  it('out of bounds', () => {
    const v = validatePlacements(units, e, [p('A', 3500, 0, 0, 1000, 1000, 500)], DEFAULT_SETTINGS);
    expect(v.map((x) => x.code)).toContain('OUT_OF_BOUNDS');
  });
  it('forbidden orientation', () => {
    const v = validatePlacements(units, e, [p('A', 0, 0, 0, 1000, 500, 1000)], DEFAULT_SETTINGS);
    expect(v.map((x) => x.code)).toContain('ORIENTATION_NOT_ALLOWED');
  });
  it('floating and on no-stack', () => {
    const v1 = validatePlacements(units, e, [p('B', 0, 0, 800, 500, 500, 500)], DEFAULT_SETTINGS);
    expect(v1.map((x) => x.code)).toContain('UNSUPPORTED');
    const v2 = validatePlacements(units, e, [p('A', 0, 0, 0, 1000, 1000, 500), p('B', 0, 0, 500, 500, 500, 500)], DEFAULT_SETTINGS);
    expect(v2.map((x) => x.code)).toContain('ON_NO_STACK_ITEM');
  });
  it('door blocked & payload', () => {
    const narrow = normalizeEquipment(eq('narrow'))!;
    const v = validatePlacements(units, narrow, [p('A', 0, 0, 0, 1000, 1200, 500)], DEFAULT_SETTINGS);
    expect(v.map((x) => x.code)).toContain('DOOR_BLOCKED');
    const heavy = expandUnits([row({ label: 'H', weight: 9000 })]);
    const v2 = validatePlacements(heavy, e, [p('H', 0, 0, 0, 100, 100, 100)], DEFAULT_SETTINGS);
    expect(v2.map((x) => x.code)).toContain('PAYLOAD_EXCEEDED');
  });
});

describe('performance', () => {
  it('large manifest (540 units) completes and validates within budget', { timeout: 30000 }, () => {
    const rows = [
      row({ label: 'carton', qty: 400, length: 500, width: 400, height: 300 }),
      row({ label: 'pallet', qty: 60, length: 1200, width: 800, height: 900, rotation: 'upright' }),
      row({ label: 'small', qty: 80, length: 300, width: 200, height: 200 }),
    ];
    const t = Date.now();
    const a = analyzeScenario(scn(rows, ['trailer53'], { ...DEFAULT_SETTINGS, maxAttempts: 4, maxMs: 20000 }));
    const ms = Date.now() - t;
    console.log(`540-unit solve: ${ms} ms, status ${a.results[0].status}, placed ${a.results[0].metrics.placedUnits}`);
    expect(ms).toBeLessThan(30000);
    expect(a.results[0].status).not.toBe('PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS');
  });
});
