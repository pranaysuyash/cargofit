import { describe, it, expect } from 'vitest';
import { computeMultiStopStages } from '../src/engine/analyze';
import type { NormalizedEquipment, Placement, Unit } from '../src/engine/types';

describe('P01 Multi-Stop Drop Axle Weight Redistribution Engine', () => {
  const mockEquipment: NormalizedEquipment = {
    id: 'dry-van-53',
    name: '53ft Dry Van',
    L: 16154, // mm
    W: 2489,
    H: 2743,
    doorW: 2438,
    doorH: 2692,
    payloadKg: 20412,
  };

  const mockUnits: Unit[] = [
    {
      id: 'pallet-stop1-A',
      rowUid: 'row-1',
      label: 'Stop 1 Rear Pallet A',
      dims: [1200, 1000, 1500],
      weightKg: 5000,
      rotation: 'fixed',
      stackable: false,
      stop: 1,
    },
    {
      id: 'pallet-stop1-B',
      rowUid: 'row-1',
      label: 'Stop 1 Rear Pallet B',
      dims: [1200, 1000, 1500],
      weightKg: 5000,
      rotation: 'fixed',
      stackable: false,
      stop: 1,
    },
    {
      id: 'pallet-stop2-Nose',
      rowUid: 'row-2',
      label: 'Stop 2 Nose Pallet',
      dims: [1200, 1000, 1500],
      weightKg: 9000,
      rotation: 'fixed',
      stackable: false,
      stop: 2,
    },
  ];

  // Placements: Stop 2 placed near front nose (x: 500), Stop 1 placed near rear door (x: 14000)
  const mockPlacements: Placement[] = [
    {
      unitId: 'pallet-stop2-Nose',
      rowUid: 'row-2',
      label: 'Stop 2 Nose Pallet',
      x: 500,
      y: 0,
      z: 0,
      dx: 1200,
      dy: 1000,
      dz: 1500,
      order: 1,
      stop: 2,
    },
    {
      unitId: 'pallet-stop1-A',
      rowUid: 'row-1',
      label: 'Stop 1 Rear Pallet A',
      x: 14000,
      y: 0,
      z: 0,
      dx: 1200,
      dy: 1000,
      dz: 1500,
      order: 2,
      stop: 1,
    },
    {
      unitId: 'pallet-stop1-B',
      rowUid: 'row-1',
      label: 'Stop 1 Rear Pallet B',
      x: 14000,
      y: 1200,
      z: 0,
      dx: 1200,
      dy: 1000,
      dz: 1500,
      order: 3,
      stop: 1,
    },
  ];

  it('computes initial stage at origin and sequential post-drop stages', () => {
    const stages = computeMultiStopStages(mockUnits, mockEquipment, mockPlacements);

    expect(stages.length).toBe(3); // Origin + Post-Stop 1 + Post-Stop 2 (Final)
    expect(stages[0].label).toContain('Depart Origin');
    expect(stages[0].remainingUnits).toBe(3);
    expect(stages[0].remainingWeightKg).toBe(19000);

    // Stage 1: After Stop 1 is dropped (only Stop 2 remains)
    expect(stages[1].stage).toBe(1);
    expect(stages[1].stop).toBe(1);
    expect(stages[1].remainingUnits).toBe(1);
    expect(stages[1].remainingWeightKg).toBe(9000);

    // Stage 2: Final Destination (empty)
    expect(stages[2].stage).toBe(2);
    expect(stages[2].remainingUnits).toBe(0);
    expect(stages[2].remainingWeightKg).toBe(0);
  });

  it('detects forward weight bias when rear cargo is unloaded leaving heavy nose cargo', () => {
    const stages = computeMultiStopStages(mockUnits, mockEquipment, mockPlacements);

    // After dropping rear cargo at Stop 1, only nose pallet remains (x: 500 mm / ~3-10% of length)
    const postStop1 = stages[1];
    expect(postStop1.cogXPct).not.toBeNull();
    expect(postStop1.cogXPct!).toBeLessThan(40);
    expect(postStop1.warning).toBeDefined();
    expect(postStop1.warning).toContain('Forward weight bias');
  });

  it('returns empty array when there is only a single destination stop', () => {
    const singleStopUnits = mockUnits.map((u) => ({ ...u, stop: 1 }));
    const singleStopPlacements = mockPlacements.map((p) => ({ ...p, stop: 1 }));

    const stages = computeMultiStopStages(singleStopUnits, mockEquipment, singleStopPlacements);
    expect(stages).toEqual([]);
  });
});
