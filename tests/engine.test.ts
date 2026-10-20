import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importCargoCsv, importCargoTable } from '../src/engine/csv';
import { analyzeScenario, DEFAULT_SETTINGS } from '../src/engine/scenario';
import { validatePlacements } from '../src/engine/validator';
import { expandUnits, normalizeEquipment, validateRows } from '../src/engine/normalize';
import { toMm, toKg } from '../src/engine/units';
import { computeMetrics, computeMultiStopStages } from '../src/engine/analyze';
import { buildHtmlReport, buildPlanFile } from '../src/engine/report';
import { recommendFleet } from '../src/engine/fleet';
import { renderIso, rowColors } from '../src/engine/viz';
import type { CargoRow, EquipmentProfile, Placement, Scenario, Unit } from '../src/engine/types';

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

  it('computes 3D CoG and beam-reaction axle load estimates accurately', () => {
    const eqn = normalizeEquipment(eq('trailer53'))!;
    const u1: Unit = { id: 'u1', rowUid: 'r1', label: 'Item 1', dims: [2000, 1000, 1000], weightKg: 5000, rotation: 'any', stackable: true };
    const u2: Unit = { id: 'u2', rowUid: 'r2', label: 'Item 2', dims: [2000, 1000, 1000], weightKg: 5000, rotation: 'any', stackable: true };
    const p1: Placement = { unitId: 'u1', rowUid: 'r1', label: 'Item 1', x: 2000, y: 0, z: 0, dx: 2000, dy: 1000, dz: 1000, order: 1 };
    const p2: Placement = { unitId: 'u2', rowUid: 'r2', label: 'Item 2', x: 8000, y: 0, z: 0, dx: 2000, dy: 1000, dz: 1000, order: 2 };

    const m = computeMetrics([u1, u2], eqn, [p1, p2]);
    expect(m.loadedWeightKg).toBe(10000);
    expect(m.cogX).toBeCloseTo(6000, 0);
    expect(m.cogY).toBeCloseTo(500, 0);
    expect(m.cogZ).toBeCloseTo(500, 0);
    expect(m.cogXPct).toBeCloseTo((6000 / eqn.L) * 100, 1);
    expect(m.axleEst).not.toBeNull();
    expect(m.axleEst!.steerKg + m.axleEst!.driveKg + m.axleEst!.trailerKg).toBe(10000);
  });

  it('renders isometric SVG with explode, cutaway, blueprint, and CoG markers', () => {
    const eqn = normalizeEquipment(eq('trailer53'))!;
    const u1: Unit = { id: 'u1', rowUid: 'r1', label: 'Item 1', dims: [1200, 800, 1000], weightKg: 500, rotation: 'any', stackable: true };
    const p1: Placement = { unitId: 'u1', rowUid: 'r1', label: 'Item 1', x: 1000, y: 500, z: 0, dx: 1200, dy: 800, dz: 1000, order: 1 };
    const colors = rowColors([row({ label: 'Item 1', qty: 1 })]);

    const svgNorm = renderIso({
      eq: eqn,
      placements: [p1],
      colors,
      explode: 0.25,
      sliceX: 0.5,
      blueprint: false,
      showCoG: true,
      units: [u1],
    });
    expect(svgNorm).toContain('DOOR ENTRY');
    expect(svgNorm).toContain('OPTIMAL CoG TARGET');
    expect(svgNorm).toContain('CoG:');

    const svgBp = renderIso({
      eq: eqn,
      placements: [p1],
      colors,
      blueprint: true,
      showCoG: true,
      units: [u1],
    });
    expect(svgBp).toContain('#08101e');
    expect(svgBp).toContain('#38bdf8');
  });

  it('detects multi-stop LIFO entrapment when earlier drop is blocked by later drop', () => {
    const eqn = normalizeEquipment(eq('trailer53'))!;
    const uStop1: Unit = { id: 'uStop1', rowUid: 'r1', label: 'Drop 1 Item', dims: [1200, 1000, 1000], weightKg: 500, rotation: 'any', stackable: true, stop: 1 };
    const uStop2: Unit = { id: 'uStop2', rowUid: 'r2', label: 'Drop 2 Item', dims: [1200, 1000, 1000], weightKg: 500, rotation: 'any', stackable: true, stop: 2 };
    // Stop 1 placed at x=1000, but Stop 2 placed at x=3000 (closer to the rear door along the same lateral corridor)
    const p1: Placement = { unitId: 'uStop1', rowUid: 'r1', label: 'Drop 1 Item', x: 1000, y: 500, z: 0, dx: 1200, dy: 1000, dz: 1000, order: 1, stop: 1 };
    const p2: Placement = { unitId: 'uStop2', rowUid: 'r2', label: 'Drop 2 Item', x: 3000, y: 500, z: 0, dx: 1200, dy: 1000, dz: 1000, order: 2, stop: 2 };

    const violations = validatePlacements([uStop1, uStop2], eqn, [p1, p2], DEFAULT_SETTINGS);
    const entrapment = violations.find((v) => v.code === 'STOP_ACCESS_BLOCKED');
    expect(entrapment).toBeDefined();
    expect(entrapment?.message).toContain('is blocked from rear door egress');
  });

  it('calculates multi-vehicle fleet split recommendations for oversized cargo', () => {
    const pallets: Unit[] = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i + 1}`,
      rowUid: 'r1',
      label: 'Pallet',
      dims: [1200, 1000, 1600],
      weightKg: 800,
      rotation: 'upright',
      stackable: true,
    }));

    const fleet = recommendFleet(pallets, [eq('trailer53'), eq('box7t'), eq('van')]);
    expect(fleet.totalVehicles).toBeGreaterThan(1);
    expect(fleet.allocations.length).toBeGreaterThan(0);
    expect(fleet.totalUnits).toBe(60);
    expect(fleet.summary).toContain('Recommended Fleet:');
  });

  it('imports 2D table array directly (underlying engine for Excel worksheets)', () => {
    const table = [
      ['sku', 'pcs', 'len', 'wid', 'hgt', 'uom', 'wt', 'mass_unit', 'drop'],
      ['Box A', '5', '1200', '800', '1000', 'mm', '450', 'kg', '1'],
      ['Box B', '10', '600', '400', '500', 'mm', '25', 'kg', '2'],
    ];
    const r = importCargoTable(table);
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].label).toBe('Box A');
    expect(r.rows[0].qty).toBe(5);
    expect(r.rows[0].stop).toBe(1);
    expect(r.rows[1].stop).toBe(2);
  });

  it('computes progressive multi-stop unload stages and detects axle shifts', () => {
    const eqn = normalizeEquipment(eq('trailer53'))!;
    const u1: Unit = { id: 'u1', rowUid: 'r1', label: 'Drop 1 (Rear)', dims: [1200, 1000, 1000], weightKg: 8000, rotation: 'upright', stackable: true, stop: 1 };
    const u2: Unit = { id: 'u2', rowUid: 'r2', label: 'Drop 2 (Front)', dims: [1200, 1000, 1000], weightKg: 8000, rotation: 'upright', stackable: true, stop: 2 };
    const p1: Placement = { unitId: 'u1', rowUid: 'r1', label: 'Drop 1', x: 12000, y: 0, z: 0, dx: 1200, dy: 1000, dz: 1000, order: 2, stop: 1 };
    const p2: Placement = { unitId: 'u2', rowUid: 'r2', label: 'Drop 2', x: 1000, y: 0, z: 0, dx: 1200, dy: 1000, dz: 1000, order: 1, stop: 2 };

    const stages = computeMultiStopStages([u1, u2], eqn, [p1, p2]);
    expect(stages).toHaveLength(3);
    expect(stages[0].remainingUnits).toBe(2);
    expect(stages[0].remainingWeightKg).toBe(16000);
    expect(stages[1].remainingUnits).toBe(1);
    expect(stages[1].remainingWeightKg).toBe(8000);
    expect(stages[1].cogX).toBeCloseTo(1600, 0);
    expect(stages[1].warning).toContain('Forward weight bias');
  });

  it('generates HTML report including 3D CoG and Axle distribution table', () => {
    const rows = [row({ label: 'Cargo 1', qty: 10, length: 1200, width: 800, height: 1000, weight: 500 })];
    const sc = scn(rows, ['trailer53']);
    const a = analyzeScenario(sc);
    const res = a.results[0];
    const planFile = buildPlanFile({
      scenario: sc,
      result: res,
      placements: res.arrangements[0].placements,
      arrangementName: res.arrangements[0].name,
      edited: false,
      inputHash: 'test-hash',
    });
    const html = buildHtmlReport(planFile);
    expect(html).toContain('Load plan');
    expect(html).toContain('Axle Load Distribution &amp; Balance');
    expect(html).toContain('Steer Axle');
    expect(html).toContain('Drive Tandem');
    expect(html).toContain('Trailer Tandem');
    expect(html).toContain('OPTIMAL CoG TARGET');
  });
});
