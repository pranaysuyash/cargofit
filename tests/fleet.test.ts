import { describe, expect, it } from 'vitest';
import { recommendFleet, solveFleet } from '../src/engine/fleet';
import type { EquipmentProfile, Settings, Unit } from '../src/engine/types';

const MOCK_PROFILES: EquipmentProfile[] = [
  {
    id: 'van-53',
    name: '53ft Dry Van',
    length: 16154,
    width: 2489,
    height: 2743,
    unit: 'mm',
    doorWidth: 2438,
    doorHeight: 2692,
    payload: 20412,
    massUnit: 'kg',
    cost: 2500,
    currency: 'USD',
    costSource: 'illustrative',
    source: 'Standard 53ft spec',
    included: true,
  },
  {
    id: 'box-26',
    name: '26ft Straight Truck',
    length: 7800,
    width: 2400,
    height: 2400,
    unit: 'mm',
    doorWidth: 2350,
    doorHeight: 2350,
    payload: 10000,
    massUnit: 'kg',
    cost: 1400,
    currency: 'USD',
    costSource: 'illustrative',
    source: 'Standard 26ft spec',
    included: true,
  },
];

const SETTINGS: Settings = {
  seed: 42,
  maxAttempts: 2,
  maxMs: 500,
  minSupportPct: 75,
};

function makeUnits(count: number, prefix: string, dims: [number, number, number], weightKg: number, stop = 1): Unit[] {
  const units: Unit[] = [];
  for (let i = 0; i < count; i++) {
    units.push({
      id: `${prefix}_${i + 1}`,
      rowUid: prefix,
      label: `Pallet ${prefix} #${i + 1}`,
      dims,
      weightKg,
      rotation: 'upright',
      stackable: true,
      stop,
    });
  }
  return units;
}

describe('Multi-Equipment Fleet Splitter & Allocation Engine', () => {
  it('allocates small cargo load into a single vehicle when volume fits', () => {
    // 10 standard pallets (1200x1000x1400mm, 500kg each)
    const units = makeUnits(10, 'p', [1200, 1000, 1400], 500);
    const plan = recommendFleet(units, MOCK_PROFILES);

    expect(plan.totalVehicles).toBe(1);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].assignedUnitIds).toHaveLength(10);
    expect(plan.allocations[0].volumeUtilizationPct).toBeLessThan(100);
  });

  it('partitions large cargo load exceeding 1 trailer across multiple vehicles', () => {
    // 50 pallets total (would exceed 53ft trailer volume)
    const units = makeUnits(50, 'bulk', [1200, 1000, 1600], 700);
    const plan = recommendFleet(units, MOCK_PROFILES);

    expect(plan.totalVehicles).toBeGreaterThan(1);
    const assignedCount = plan.allocations.reduce((s, a) => s + a.assignedUnitIds.length, 0);
    expect(assignedCount).toBe(50);
  });

  it('solves discrete 3D arrangement plans and dock staging bays for every vehicle in fleet', () => {
    // 40 pallets across 2 delivery stops
    const stop1Units = makeUnits(20, 's1', [1200, 1000, 1500], 600, 1);
    const stop2Units = makeUnits(20, 's2', [1200, 1000, 1500], 600, 2);
    const allUnits = [...stop1Units, ...stop2Units];

    const result = solveFleet(allUnits, MOCK_PROFILES, SETTINGS);

    expect(result.totalVehicles).toBeGreaterThanOrEqual(1);
    expect(result.plans.length).toBe(result.totalVehicles);

    // Each vehicle has discrete 3D plan and staging dock assignment
    for (const vp of result.plans) {
      expect(vp.stagingBay).toContain('Dock');
      expect(vp.stagingBay).toContain('Bay');
      expect(vp.assignedUnits.length).toBeGreaterThan(0);
      if (vp.arrangement) {
        expect(vp.arrangement.placements.length).toBeGreaterThan(0);
        expect(vp.metrics).toBeDefined();
        expect(vp.violations).toHaveLength(0); // Valid 3D packing without collisions or stop blockage
      }
    }

    expect(result.totalPlacedUnits).toBeGreaterThan(0);
  });
});
