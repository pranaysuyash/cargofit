import { describe, expect, it } from 'vitest';
import { buildVicsBolHtml } from '../src/engine/vicsBol';
import type { PlanFile } from '../src/engine/report';

describe('VICS Standard Bill of Lading (BOL) Generator', () => {
  const mockPlan: PlanFile = {
    format: 'cargo-fit-plan',
    version: 1,
    engineVersion: '0.1.0',
    createdAt: '2026-10-21T10:00:00Z',
    inputHash: 'abcdef0123456789',
    scenario: {
      name: 'Interstate Pallet Consignment',
      rows: [],
      equipment: [],
      settings: { seed: 1, maxAttempts: 1, maxMs: 1000, minSupportPct: 75 },
    },
    equipmentId: 'van-53',
    arrangementName: 'Standard Front Load',
    edited: false,
    status: 'FEASIBLE_UNDER_MODELED_CONSTRAINTS',
    metrics: {
      placedUnits: 14,
      totalUnits: 14,
      occupiedVolumePct: 72.5,
      loadedWeightKg: 8500, // ~18,739 lbs
      unknownWeightUnits: 0,
      payloadKg: 20000,
      payloadRemainingKg: 11500,
      usedLengthMm: 12000,
      cogXPct: 48,
    },
    placements: [
      { unitId: 'u1', rowUid: 'r1', label: 'Commercial Electronics', x: 0, y: 0, z: 0, dx: 1200, dy: 1000, dz: 1500, order: 1, stop: 1 },
      { unitId: 'u2', rowUid: 'r1', label: 'Commercial Electronics', x: 1200, y: 0, z: 0, dx: 1200, dy: 1000, dz: 1500, order: 2, stop: 1 },
      { unitId: 'u3', rowUid: 'r2', label: 'UN1993 Flammable Liquids', x: 2400, y: 0, z: 0, dx: 1200, dy: 1000, dz: 1200, order: 3, stop: 2 },
    ],
    unplacedUnitIds: [],
    reasons: [],
    checks: [],
    validation: { passed: true, violations: [], validatedAt: '2026-10-21T10:00:00Z' },
    limitations: [],
  };

  it('generates compliant VICS HTML bill of lading with barcode and carrier certification', () => {
    const html = buildVicsBolHtml(mockPlan, {
      bolNumber: 'BOL-99881122',
      carrierName: 'SWIFT TRANSPORT',
      scac: 'SWFT',
      shipperName: 'Texas Distribution Center',
      consigneeName: 'Midwest Fulfillment Hub',
      trailerNumber: 'TRL-8822',
      sealNumber: 'SEAL-4401',
      emergencyPhone: '1-800-535-5053 (INFOTRAC)',
    });

    expect(html).toContain('Standard Bill of Lading (VICS)');
    expect(html).toContain('BOL-99881122');
    expect(html).toContain('SWIFT TRANSPORT');
    expect(html).toContain('SWFT');
    expect(html).toContain('Texas Distribution Center');
    expect(html).toContain('Midwest Fulfillment Hub');
    expect(html).toContain('TRL-8822');
    expect(html).toContain('SEAL-4401');
    expect(html).toContain('1-800-535-5053 (INFOTRAC)');
    expect(html).toContain('<svg'); // Barcode SVG present
    expect(html).toContain('FMCSA 49 CFR Parts 392 &amp; 393');
  });

  it('embeds digital signature data URLs and flags hazardous materials (H.M.)', () => {
    const fakeSig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const html = buildVicsBolHtml(mockPlan, {
      shipperSignatureDataUrl: fakeSig,
      driverSignatureDataUrl: fakeSig,
      driverLoadAndCount: true,
    });

    expect(html).toContain(fakeSig);
    expect(html).toContain('[X] Driver Load & Count');
    expect(html).toContain('UN1993 Flammable Liquids');
    expect(html).toContain('X'); // Hazmat flag
  });
});
