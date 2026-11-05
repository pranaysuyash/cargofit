import { describe, it, expect } from 'vitest';
import {
  calculateMcKeeBCT,
  calculateEnvironmentalSafetyFactor,
  analyzeCartonStacking,
  STANDARD_BOARD_GRADES,
} from '../src/engine/cartonCompression';

describe('Carton Compressive Strength & Stacking Crush Limits (T-031)', () => {
  it('computes accurate McKee BCT for standard carton dimensions', () => {
    // 16" L x 12" W carton -> perimeter = 2*(16+12) = 56 inches
    const board = STANDARD_BOARD_GRADES['32_ECT_C'];
    const bct = calculateMcKeeBCT(16, 12, board);

    // Formula: 5.87 * 32 * sqrt(56 * 0.156) = 187.84 * sqrt(8.736) = 187.84 * 2.95567 = ~555.2 lbs
    expect(bct).toBeGreaterThan(500);
    expect(bct).toBeLessThan(600);
  });

  it('adjusts safety factor based on relative humidity and interlocking stack', () => {
    const idealEnv = {
      relativeHumidityPct: 40,
      storageDurationDays: 5,
      stackPattern: 'COLUMN_ALIGNED' as const,
      palletOverhangInches: 0,
    };
    const baseSF = calculateEnvironmentalSafetyFactor(idealEnv);
    expect(baseSF).toBe(3.0);

    const harshEnv = {
      relativeHumidityPct: 80, // factor 1.4
      storageDurationDays: 35, // factor 1.3
      stackPattern: 'INTERLOCKED_BRICK' as const, // factor 1.4
      palletOverhangInches: 0.75, // factor 1.35
    };
    const harshSF = calculateEnvironmentalSafetyFactor(harshEnv);
    expect(harshSF).toBeGreaterThan(baseSF * 2);
  });

  it('identifies safe stacking conditions for lightweight cartons', () => {
    // 5 tiers of 20 lb cartons (bottom load = 4 * 20 = 80 lbs)
    const analysis = analyzeCartonStacking(18, 14, 10, 20, 5, STANDARD_BOARD_GRADES['32_ECT_C']);

    expect(analysis.status).toBe('SAFE');
    expect(analysis.bottomCartonLoadLbs).toBe(80);
    expect(analysis.utilizationPct).toBeLessThan(85);
    expect(analysis.maxSafeTierCount).toBeGreaterThanOrEqual(5);
  });

  it('detects CRUSH_HAZARD when heavy cartons are over-stacked', () => {
    // 8 tiers of 65 lb cartons on standard 32 ECT board
    // Bottom load = 7 * 65 = 455 lbs
    const analysis = analyzeCartonStacking(
      16,
      12,
      12,
      65,
      8,
      STANDARD_BOARD_GRADES['32_ECT_C'],
      {
        relativeHumidityPct: 75,
        storageDurationDays: 20,
        stackPattern: 'INTERLOCKED_BRICK',
        palletOverhangInches: 0.5,
      }
    );

    expect(analysis.status).toBe('CRUSH_HAZARD');
    expect(analysis.utilizationPct).toBeGreaterThan(100);
    expect(analysis.warningMessage).toContain('Risk of bottom carton collapse');
    expect(analysis.maxSafeTierCount).toBeLessThan(8);
  });
});
