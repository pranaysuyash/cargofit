import { describe, expect, it } from 'vitest';
import { assessBolReadiness, buildVicsBolHtml, UNDECLARED } from '../src/engine/vicsBol';
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

  const fullOpts = {
    bolNumber: 'BOL-99881122',
    carrierName: 'SWIFT TRANSPORT',
    scac: 'SWFT',
    shipperName: 'Texas Distribution Center',
    shipperAddress: '1 Main St',
    consigneeName: 'Midwest Fulfillment Hub',
    consigneeAddress: '2 Dock Rd',
    trailerNumber: 'TRL-8822',
    sealNumber: 'SEAL-4401',
    emergencyPhone: '1-800-535-5053 (INFOTRAC)',
    humanApproved: true,
    lineDeclarations: {
      'Commercial Electronics': { nmfc: '62580', freightClass: '85', packageType: 'PLT' },
      'UN1993 Flammable Liquids': { nmfc: '43940', freightClass: '85', packageType: 'PLT', hazmat: true },
    },
  };

  it('issues a final BOL only when every field is declared, weights are known and a human approved', () => {
    const html = buildVicsBolHtml(mockPlan, fullOpts);
    expect(assessBolReadiness(mockPlan, fullOpts).isFinal).toBe(true);
    expect(html).toContain('Standard Bill of Lading (VICS)');
    expect(html).not.toContain('DRAFT — NOT A VALID BILL OF LADING');
    expect(html).toContain('SWIFT TRANSPORT');
    expect(html).toContain('TRL-8822');
    expect(html).toContain('1-800-535-5053 (INFOTRAC)');
    expect(html).toContain('<svg');
    expect(html).toContain('FMCSA 49 CFR Parts 392 &amp; 393');
    expect(html).toContain('62580');
  });

  it('never invents carrier, SCAC, parties, seal, NMFC or class: renders a DRAFT with UNDECLARED markers', () => {
    const html = buildVicsBolHtml(mockPlan, {});
    expect(html).toContain('Draft Load Manifest');
    expect(html).toContain('DRAFT — NOT A VALID BILL OF LADING');
    expect(html).toContain(UNDECLARED);
    expect(html).not.toContain('CARGOFIT MOTOR FREIGHT');
    expect(html).not.toContain('ACME LOGISTICS');
    expect(html).not.toContain('CRGO');
    expect(html).not.toMatch(/SEAL-[0-9A-F]{6}/);
    expect(html).not.toContain('Class 70');
    expect(html).toContain('NO CERTIFICATION.');
  });

  it('requires human approval even when all fields are declared', () => {
    const r = assessBolReadiness(mockPlan, { ...fullOpts, humanApproved: false });
    expect(r.isFinal).toBe(false);
    expect(r.blockers.join(' ')).toContain('Human approval');
  });

  it('blocks final issuance and shows unknown (not estimated) weight when a unit weight is unknown', () => {
    const plan = { ...mockPlan, metrics: { ...mockPlan.metrics, unknownWeightUnits: 2 } };
    const r = assessBolReadiness(plan, fullOpts);
    expect(r.isFinal).toBe(false);
    const html = buildVicsBolHtml(plan, fullOpts);
    expect(html).toContain('UNKNOWN');
  });

  it('uses actual per-unit manifest weights instead of an average', () => {
    const plan: PlanFile = {
      ...mockPlan,
      scenario: {
        ...mockPlan.scenario,
        rows: [
          { uid: 'r1', label: 'Commercial Electronics', qty: 2, length: 1200, width: 1000, height: 1500, dimUnit: 'mm', weight: 100, weightUnit: 'kg', rotation: 'any', stackable: false, stop: 1 },
          { uid: 'r2', label: 'UN1993 Flammable Liquids', qty: 1, length: 1200, width: 1000, height: 1200, dimUnit: 'mm', weight: 900, weightUnit: 'kg', rotation: 'any', stackable: false, stop: 2 },
        ] as unknown as PlanFile['scenario']['rows'],
      },
      placements: [
        { ...mockPlan.placements[0], unitId: 'Commercial Electronics#1' },
        { ...mockPlan.placements[1], unitId: 'Commercial Electronics#2' },
        { ...mockPlan.placements[2], unitId: 'UN1993 Flammable Liquids' },
      ],
      metrics: { ...mockPlan.metrics, loadedWeightKg: 1100 },
    };
    const html = buildVicsBolHtml(plan, fullOpts);
    // flammable line: 900 kg = 1,984 lbs (not an average share of the total)
    expect(html).toContain('1,984');
  });

  it('escapes HTML in every operator-controlled field (XSS)', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const html = buildVicsBolHtml(mockPlan, {
      ...fullOpts,
      carrierName: payload,
      shipperName: payload,
      consigneeName: payload,
      specialInstructions: payload,
      trailerNumber: payload,
      sealNumber: payload,
      emergencyPhone: payload,
      bolNumber: 'BOL-1',
    });
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes hostile cargo labels', () => {
    const plan = { ...mockPlan, placements: [{ ...mockPlan.placements[0], label: '<script>alert(1)</script>' }] };
    const html = buildVicsBolHtml(plan, fullOpts);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops non-image signature data URLs', () => {
    const html = buildVicsBolHtml(mockPlan, { ...fullOpts, shipperSignatureDataUrl: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:alert(1)');
  });

  it('embeds digital signature data URLs and flags hazardous materials (H.M.)', () => {
    const fakeSig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const html = buildVicsBolHtml(mockPlan, {
      ...fullOpts,
      shipperSignatureDataUrl: fakeSig,
      driverSignatureDataUrl: fakeSig,
      driverLoadAndCount: true,
    });
    expect(html).toContain(fakeSig);
    expect(html).toContain('[X] Driver Load &amp; Count');
    expect(html).toContain('UN1993 Flammable Liquids');
  });
});
