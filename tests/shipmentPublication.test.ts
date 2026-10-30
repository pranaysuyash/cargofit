import { describe, expect, it } from 'vitest';
import * as adapter from '../src/engine/shipmentAdapter';
import { analyzeScenario, scenarioHash } from '../src/engine/scenario';
import { expandUnits, validateRows } from '../src/engine/normalize';
import type { CargoRow } from '../src/engine/types';
import type { Shipment } from '../src/suite/types';

function shipment(): Shipment {
  return {
    id: 'shipment-fixture', reference: 'Native publication fixture', mode: 'local_scenario', revision: 3, inputRevision: 2,
    status: 'draft', events: [], exceptions: [], operations: {},
    input: {
      origin: 'Origin', destination: 'Destination', loadedMiles: 95, deadheadMiles: 12, equipmentId: 'dry-van-53',
      carrierDot: '389211', driverId: 'driver', tractorId: 'tractor', trailerId: 'trailer', priorRestHours: 10,
      units: [
        { id: 'HU-01', barcode: 'BC-01', description: 'Identical pallet', lengthIn: 48.123456, widthIn: 40, heightIn: 48, weightLbs: 1200.123456, stackable: false, temperatureClass: 'ambient' },
        { id: 'HU-02', barcode: 'BC-02', description: 'Identical pallet', lengthIn: 48, widthIn: 40, heightIn: 48, weightLbs: 1500, stackable: false, temperatureClass: 'ambient' },
      ],
    },
    results: { asset: {
      ok: true, summary: 'Selected declared equipment', inputRevision: 2, productId: 'product-04-asset-studio', recordedAt: '2026-10-22T14:00:00Z',
      details: { equipmentId: 'dry-van-53', name: 'Declared dry van', lengthIn: 630, widthIn: 100, heightIn: 100, doorWidthIn: 98, doorHeightIn: 98, payloadLbs: 45000, source: 'Declared fixture' },
    } },
  };
}
const prepared = () => {
  const s = shipment(); const scenario = adapter.scenarioForShipment(s);
  const result = analyzeScenario(scenario).results[0];
  return { s, scenario, result, placements: result.arrangements[result.best]?.placements ?? [] };
};

describe('connected native cargo identity', () => {
  it('accepts repeated descriptions while preserving original IDs and barcodes', () => {
    const { s, scenario, result, placements } = prepared();
    expect(validateRows(scenario.rows).filter(i => i.severity === 'error')).toEqual([]);
    expect(expandUnits(scenario.rows).map(u => [u.id, u.barcode])).toEqual([['HU-01', 'BC-01'], ['HU-02', 'BC-02']]);
    expect(placements.map(p => p.unitId).sort()).toEqual(['HU-01', 'HU-02']);
    expect(adapter.resultForPlan(s, scenario, result, placements).ok).toBe(true);
  });
  it('retains legacy duplicate identifier validation for standalone rows', () => {
    const { scenario } = prepared();
    const rows = scenario.rows.map(({ physicalUnitId: _id, barcode: _barcode, ...row }) => row);
    expect(validateRows(rows).some(i => i.code === 'DUPLICATE_LABEL')).toBe(true);
  });
  it('hashes physical identity, barcode and delivery stop so constraint changes invalidate a solve', () => {
    const { scenario } = prepared(); const original = scenarioHash(scenario);
    for (const update of [{ physicalUnitId: 'different' }, { barcode: 'different' }, { stop: 2 }]) {
      expect(scenarioHash({ ...scenario, rows: scenario.rows.map((r, i) => i ? r : { ...r, ...update }) })).not.toBe(original);
    }
  });
  it('preserves original entered inch/lb values with no normalized roundtrip drift', () => {
    const { s, scenario } = prepared();
    expect(adapter.unitsForScenario(s, scenario)).toEqual(s.input.units);
  });
  it('converts edited alternative units directly to shipment units', () => {
    const { s, scenario } = prepared();
    scenario.rows[0] = { ...scenario.rows[0], length: 1.23456789, width: 1, height: 1, dimUnit: 'm', weight: 123.456789, weightUnit: 'kg' };
    const unit = adapter.unitsForScenario(s, scenario)[0];
    expect(unit.lengthIn).toBeCloseTo(1.23456789 * 1000 / 25.4, 12);
    expect(unit.weightLbs).toBeCloseTo(123.456789 / 0.45359237, 12);
    expect(unit.barcode).toBe('BC-01');
  });
  it.each([
    ['quantity expansion', { qty: 2 }, /quantity|one physical|qty/i],
    ['non-upright rotation', { rotation: 'any' }, /upright|rotation/i],
    ['multiple stops', { stop: 2 }, /stop|destination/i],
    ['new identity', { physicalUnitId: 'NEW-ID' }, /identity|identified|manifest/i],
    ['changed barcode', { barcode: 'NEW-BARCODE' }, /barcode/i],
    ['lost identity', { physicalUnitId: undefined }, /identity|identified|manifest/i],
  ])('rejects unsupported connected %s instead of losing constraints', (_name, update, message) => {
    const { s, scenario } = prepared();
    scenario.rows[0] = { ...scenario.rows[0], ...update } as CargoRow;
    expect(() => adapter.unitsForScenario(s, scenario)).toThrow(message);
  });
  it('cannot silently remove a registered handling unit', () => {
    const { s, scenario } = prepared(); scenario.rows.pop();
    expect(() => adapter.unitsForScenario(s, scenario)).toThrow(/every|identified|remove|manifest/i);
  });
  it('does not promote chilled goods into an ambient-only connected workflow', () => {
    const s = shipment(); s.input.units[0].temperatureClass = 'chilled';
    expect(() => adapter.scenarioForShipment(s)).toThrow(/ambient|temperature/i);
  });
});

describe('publication validates the actual reviewed native plan', () => {
  it('publishes a valid manual arrangement verbatim without solving again', () => {
    const { s, scenario, result, placements } = prepared();
    const manual = placements.map(p => ({ ...p, x: p.x + 25 }));
    const published = adapter.resultForPlan(s, scenario, result, manual);
    expect(published.ok).toBe(true);
    expect(published.details.placements).toEqual(manual);
    expect(published.details.nativeScenario).toEqual(scenario);
    expect(published.details.unitIds).toEqual(manual.map(p => p.unitId));
    expect(published.details.metrics).not.toEqual(result.metrics);
    expect(published.details.settings).toEqual(scenario.settings);
  });
  it('rejects manual overlap even if the preceding solver result was feasible', () => {
    const { s, scenario, result, placements } = prepared();
    const bad = placements.map(p => ({ ...p, x: 0, y: 0, z: 0 }));
    const published = adapter.resultForPlan(s, scenario, result, bad);
    expect(published.ok).toBe(false);
    expect(published.details.geometryFeasible).toBe(false);
    expect((published.details.validationViolations as { code: string }[]).some(v => v.code === 'OVERLAP')).toBe(true);
  });
  it('requires each original physical identity exactly once', () => {
    const { s, scenario, result, placements } = prepared();
    expect(adapter.resultForPlan(s, scenario, result, placements.slice(1)).ok).toBe(false);
    expect(adapter.resultForPlan(s, scenario, result, [placements[0], placements[0]]).ok).toBe(false);
  });
  it('fails rather than publishing a locally modified selected equipment snapshot', () => {
    const { s, scenario, result, placements } = prepared(); scenario.equipment[0].width = 110;
    expect(() => adapter.resultForPlan(s, scenario, result, placements)).toThrow(/equipment|Asset Studio/i);
  });
  it('rejects non-finite coordinates and mismatched row identity', () => {
    const { s, scenario, result, placements } = prepared();
    expect(adapter.resultForPlan(s, scenario, result, placements.map((p, i) => i ? p : { ...p, x: NaN })).ok).toBe(false);
    expect(adapter.resultForPlan(s, scenario, result, placements.map((p, i) => i ? p : { ...p, rowUid: 'other-row' })).ok).toBe(false);
  });
  it('default evaluation uses the same canonical identity-preserving publication', () => {
    const s = shipment(); const published = adapter.shipmentAdapter.evaluate!(s, { warehouseSlotIds: [], yardDoorIds: [] });
    expect(published.ok).toBe(true);
    expect(published.details.unitIds).toEqual(expect.arrayContaining(s.input.units.map(u => u.id)));
    expect(published.details.nativeScenario).toBeDefined();
  });
});
