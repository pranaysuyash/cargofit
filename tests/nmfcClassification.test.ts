import { describe, it, expect } from 'vitest';
import { classifyFreightDensity } from '../src/engine/nmfcClassification';

describe('NMFC Freight Density & Classification Engine', () => {
  it('correctly maps dense heavy freight (> 50 pcf) to Class 50', () => {
    const result = classifyFreightDensity({
      totalWeightLbs: 2500,
      totalVolumeCuFt: 40, // 62.5 pcf
    });
    expect(result.densityPcf).toBe(62.5);
    expect(result.recommendedNmfcClass).toBe(50);
    expect(result.isDimWeightPenaltyActive).toBe(false);
    expect(result.billableWeightLbs).toBe(2500);
  });

  it('correctly maps standard general boxed freight (15 to 22.5 pcf) to Class 70', () => {
    const result = classifyFreightDensity({
      totalWeightLbs: 1800,
      totalVolumeCuFt: 100, // 18 pcf
    });
    expect(result.densityPcf).toBe(18);
    expect(result.recommendedNmfcClass).toBe(70);
    expect(result.tier.description).toContain('Standard General Freight');
  });

  it('correctly maps lightweight bulky goods (< 1 pcf) to Class 500 with DIM weight penalty', () => {
    const result = classifyFreightDensity({
      totalWeightLbs: 150,
      totalVolumeCuFt: 300, // 0.5 pcf
      dimFactor: 166,
    });
    expect(result.densityPcf).toBe(0.5);
    expect(result.recommendedNmfcClass).toBe(500);
    expect(result.isDimWeightPenaltyActive).toBe(true);
    // DIM Weight = 300 * 1728 / 166 = 518400 / 166 ≈ 3123 lbs
    expect(result.dimWeightLbs).toBeGreaterThan(3000);
    expect(result.billableWeightLbs).toBe(result.dimWeightLbs);
  });

  it('calculates volume accurately from length, width, and height in inches', () => {
    const result = classifyFreightDensity({
      totalWeightLbs: 600,
      totalVolumeCuFt: 0,
      lengthInches: 48,
      widthInches: 40,
      heightInches: 48, // 48*40*48 = 92,160 cu in / 1728 = 53.33 cu ft
    });
    expect(result.volumeCuFt).toBeCloseTo(53.33, 1);
    expect(result.densityPcf).toBeCloseTo(11.25, 1);
    expect(result.recommendedNmfcClass).toBe(92.5);
  });
});
