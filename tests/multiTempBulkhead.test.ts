import { describe, it, expect } from 'vitest';
import {
  calculateMultiTempBulkheads,
  inferTemperatureClassification,
  PerishableCargoItem,
} from '../src/engine/multiTempBulkhead';

describe('Multi-Temperature Reefer Bulkhead Engine', () => {
  it('correctly infers temperature classification from descriptions', () => {
    expect(inferTemperatureClassification('Organic Ice Cream Pails')).toBe('frozen');
    expect(inferTemperatureClassification('Frozen Salmon Fillets')).toBe('frozen');
    expect(inferTemperatureClassification('Fresh Whole Milk Carts')).toBe('chilled');
    expect(inferTemperatureClassification('California Strawberries')).toBe('chilled');
    expect(inferTemperatureClassification('Canned Sweet Corn Pallets')).toBe('ambient');
  });

  it('calculates dual-zone partition (Frozen Nose, Chilled Tail) with accurate volume and heat load', () => {
    // 53ft trailer: Bulkhead at 300 inches (~25 ft)
    const cargo: PerishableCargoItem[] = [
      {
        id: 'ITEM-1',
        description: 'Frozen Gelato',
        qty: 10,
        lengthIn: 48,
        widthIn: 40,
        heightIn: 60,
        weightLb: 12000,
        requiredTempClass: 'frozen',
      },
      {
        id: 'ITEM-2',
        description: 'Grade A Cheddar',
        qty: 12,
        lengthIn: 48,
        widthIn: 40,
        heightIn: 60,
        weightLb: 15000,
        requiredTempClass: 'chilled',
      },
    ];

    const result = calculateMultiTempBulkheads([300], ['frozen', 'chilled'], cargo, 85);

    expect(result.valid).toBe(true);
    expect(result.bulkheads.length).toBe(1);
    expect(result.bulkheads[0].positionIn).toBe(300);
    expect(result.zones.length).toBe(2);

    // Zone 1: Frozen Nose
    const z1 = result.zones[0];
    expect(z1.classification).toBe('frozen');
    expect(z1.targetTempF).toBe(-10);
    expect(z1.estimatedGmaPalletCapacity).toBe(12); // floor(297 / 48) * 2 = 6 * 2 = 12

    // Zone 2: Chilled Tail
    const z2 = result.zones[1];
    expect(z2.classification).toBe('chilled');
    expect(z2.targetTempF).toBe(34);
    expect(z2.estimatedGmaPalletCapacity).toBe(12);

    expect(result.totalHeatLoadBtuHr).toBeGreaterThan(0);
    expect(result.violations.length).toBe(0);
  });

  it('detects thermal mismatch violation when frozen cargo is placed in chilled zone', () => {
    const cargo: PerishableCargoItem[] = [
      {
        id: 'ITEM-BAD',
        description: 'Frozen Popsicles',
        qty: 4,
        lengthIn: 48,
        widthIn: 40,
        heightIn: 60,
        weightLb: 4000,
        requiredTempClass: 'frozen',
        assignedZoneId: 'ZONE-2', // Manually assigned to Zone 2 (Chilled)
      },
    ];

    const result = calculateMultiTempBulkheads([300], ['frozen', 'chilled'], cargo, 85);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === 'TEMP_MISMATCH')).toBe(true);
  });

  it('rejects invalid bulkhead positions too close to trailer nose or tail', () => {
    const result = calculateMultiTempBulkheads([24], ['frozen', 'chilled'], [], 85);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.code === 'INVALID_BULKHEAD_SPACING')).toBe(true);
  });
});
