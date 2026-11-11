import { describe, it, expect } from 'vitest';
import {
  evaluateCargoVoidsAndDunnage,
} from '../src/engine/dunnageVoidCalculator';

describe('49 CFR § 393.106 Cargo Void & Dunnage Airbag Evaluation Engine', () => {
  const standard53FtVan = {
    lengthMm: 16154, // 53 ft
    widthMm: 2540,   // 100 in
    heightMm: 2794,  // 110 in
  };

  it('reports 100% compliant when trailer is empty with zero cargo voids', () => {
    const report = evaluateCargoVoidsAndDunnage({
      equipment: standard53FtVan,
      placements: [],
      deckFrictionMu: 0.55,
    });

    expect(report.statutoryCompliant).toBe(true);
    expect(report.totalVoidsDetected).toBe(0);
    expect(report.unsecuredVoidsCount).toBe(0);
    expect(report.requiresFrictionMats).toBe(false);
  });

  it('detects rear-door void exceeding 6 inches when trailer is partially loaded', () => {
    // 10 pallets loaded up to 20 feet (6096 mm), leaving ~33 feet empty at rear
    const placements = [
      {
        unitId: 'U1',
        label: 'GMA Pallet 1',
        xMm: 0,
        yMm: 0,
        zMm: 0,
        dxMm: 1219,
        dyMm: 1016,
        dzMm: 1500,
        weightKg: 800,
      },
      {
        unitId: 'U2',
        label: 'GMA Pallet 2',
        xMm: 4876,
        yMm: 0,
        zMm: 0,
        dxMm: 1219,
        dyMm: 1016,
        dzMm: 1500,
        weightKg: 800,
      },
    ];

    const report = evaluateCargoVoidsAndDunnage({
      equipment: standard53FtVan,
      placements,
      deckFrictionMu: 0.35,
    });

    expect(report.statutoryCompliant).toBe(false);
    expect(report.unsecuredVoidsCount).toBeGreaterThanOrEqual(1);

    const rearVoid = report.voidRegions.find((v) => v.type === 'REAR_DROP_VOID');
    expect(rearVoid).toBeDefined();
    expect(rearVoid!.gapInches).toBeGreaterThan(6.0);
    expect(rearVoid!.recommendedDunnage.type).toBe('INFLATABLE_AIRBAG_LEVEL_2');
    expect(report.regulatoryNotice).toContain('illustrative');
    expect(report.regulatoryNotice).not.toContain('statutory 6.0');
    expect(report.requiresFrictionMats).toBe(true); // friction < 0.5
  });

  it('recommends Level 1 airbags and friction mats for tight lateral gaps with smooth floors', () => {
    // Two rows of 40-inch pallets in 100-inch trailer leaves 20 inches total void
    const placements = [
      {
        unitId: 'U-LEFT',
        label: 'Left Pallet',
        xMm: 1000,
        yMm: 0,
        zMm: 0,
        dxMm: 1219,
        dyMm: 1016, // 40 inches
        dzMm: 1500,
        weightKg: 650,
      },
    ];

    const report = evaluateCargoVoidsAndDunnage({
      equipment: standard53FtVan,
      placements,
      deckFrictionMu: 0.40,
    });

    const lateralVoid = report.voidRegions.find((v) => v.type === 'LATERAL_VOID');
    expect(lateralVoid).toBeDefined();
    expect(lateralVoid!.gapInches).toBeGreaterThan(6.0);
    expect(lateralVoid!.recommendedDunnage.type).toBe('INFLATABLE_AIRBAG_LEVEL_1');
    expect(report.airbagSummary.frictionMatsCount).toBeGreaterThan(0);
  });
});
