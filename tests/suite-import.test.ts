import { describe, expect, it } from 'vitest';
import { scenarioFromSuiteParams } from '../src/ui/suiteImport';

describe('suite import provenance', () => {
  it('leaves omitted measurements and quantities unknown', () => {
    const scenario = scenarioFromSuiteParams(new URLSearchParams('source=asset_studio_p04&eqName=Trailer'))!;
    expect(scenario.equipment[0]).toMatchObject({ length: null, width: null, height: null, doorWidth: null, doorHeight: null, payload: null });
    expect(scenario.rows[0]).toMatchObject({ qty: null, length: null, width: null, height: null, weight: null, stackable: false });
  });
  it('preserves declared zero for validation and does not divide a total weight by an unknown count', () => {
    const scenario = scenarioFromSuiteParams(new URLSearchParams('source=command_center_portal&eqW=0&cargoWeight=2200'))!;
    expect(scenario.equipment[0].width).toBe(0);
    expect(scenario.rows[0].weight).toBeNull();
  });
  it('converts declared unit aliases while rejecting unparseable values', () => {
    const scenario = scenarioFromSuiteParams(new URLSearchParams('source=asset_studio_p04&lengthFt=10&maxWeightLbs=1000&packageQty=2&cargoWeight=100&pkgL=oops'))!;
    expect(scenario.equipment[0].length).toBe(3048);
    expect(scenario.equipment[0].payload).toBeCloseTo(453.592, 3);
    expect(scenario.rows[0].weight).toBeCloseTo(22.6796, 4);
    expect(scenario.rows[0].length).toBeNull();
  });
});
