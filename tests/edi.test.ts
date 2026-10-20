import { describe, expect, it } from 'vitest';
import { parseEdi204 } from '../src/engine/edi204';
import { generateEdi214 } from '../src/engine/edi214';
import type { PlanFile } from '../src/engine/report';

const SAMPLE_EDI_204 = `
ISA*00*          *00*          *ZZ*ACMESHP        *ZZ*SWFT           *261020*1200*U*00401*000000001*0*P*>~
GS*SM*ACMESHP*SWFT*20261020*1200*1*X*004010~
ST*204*0001~
B2**SWFT*BOL-889912**PP~
B2A*00~
N1*SH*ACME Logistics Dallas Hub~
N3*4400 Interstate Blvd~
N4*Dallas*TX*75201*US~
N1*CN*Apex Distribution Center~
N3*990 Logistics Way~
N4*Chicago*IL*60601*US~
S5*1*LD*24000*L*1200*E*10*PLT~
L5*1*Consumer Electronics Pallets~
AT8*G*L*12000*6*PLT~
MEA*PD*LN*48*IN~
MEA*PD*WD*40*IN~
MEA*PD*HT*60*IN~
S5*2*UL*12000*L*600*E*5*PLT~
L5*2*Industrial Hardware 48x40x48 in~
AT8*G*L*8000*4*PLT~
SE*18*0001~
GE*1*1~
IEA*1*000000001~
`;

const SAMPLE_EDI_204_NO_DIMS = `
ST*204*0001~
B2**CRGO*BOL-112233**PP~
S5*1*LD*5000*L~
L5*1*Bulk Auto Parts Unmeasured~
AT8*G*L*5000*5*PLT~
SE*5*0001~
`;

describe('ANSI X12 EDI 204 Motor Carrier Load Tender Parser', () => {
  it('parses valid EDI 204 load tenders into structured cargo rows and multi-stop sequences', () => {
    const res = parseEdi204(SAMPLE_EDI_204);

    expect(res.bolNumber).toBe('BOL-889912');
    expect(res.scac).toBe('SWFT');
    expect(res.parties).toHaveLength(2);
    expect(res.parties[0].role).toBe('SH');
    expect(res.parties[0].city).toBe('Dallas');
    expect(res.parties[1].role).toBe('CN');
    expect(res.parties[1].city).toBe('Chicago');

    expect(res.rows).toHaveLength(2);

    // First row: from MEA segments
    const row1 = res.rows[0];
    expect(row1.label).toBe('Consumer Electronics Pallets');
    expect(row1.qty).toBe(6);
    expect(row1.length).toBe(48);
    expect(row1.width).toBe(40);
    expect(row1.height).toBe(60);
    expect(row1.dimUnit).toBe('in');
    expect(row1.weight).toBe(2000); // 12000 lbs total / 6 pallets = 2000 lbs each
    expect(row1.weightUnit).toBe('lb');
    expect(row1.stop).toBe(1);

    // Second row: from description extraction "48x40x48 in"
    const row2 = res.rows[1];
    expect(row2.label).toBe('Industrial Hardware 48x40x48 in');
    expect(row2.qty).toBe(4);
    expect(row2.length).toBe(48);
    expect(row2.width).toBe(40);
    expect(row2.height).toBe(48);
    expect(row2.weight).toBe(2000); // 8000 lbs / 4 = 2000 lbs each
    expect(row2.stop).toBe(2);

    expect(res.stopsCount).toBe(2);
    expect(res.totalDeclaredWeightLbs).toBe(20000); // (6*2000) + (4*2000)
  });

  it('adheres to zero-invention policy when dimensions are undeclared', () => {
    const res = parseEdi204(SAMPLE_EDI_204_NO_DIMS);

    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.label).toBe('Bulk Auto Parts Unmeasured');
    expect(row.qty).toBe(5);
    expect(row.length).toBeNull();
    expect(row.width).toBeNull();
    expect(row.height).toBeNull();
    expect(row.weight).toBe(1000); // 5000 / 5

    // Warning logged for missing dimensions
    const dimIssue = res.issues.find((i) => i.field === 'dimensions');
    expect(dimIssue).toBeDefined();
    expect(dimIssue?.severity).toBe('warning');
  });
});

describe('ANSI X12 EDI 214 Carrier Shipment Status Generator', () => {
  it('generates valid ANSI X12 EDI 214 status document with seal numbers and weight reconciliation', () => {
    const mockPlan: PlanFile = {
      format: 'cargo-fit-plan',
      version: 1,
      engineVersion: '0.1.0',
      createdAt: '2026-10-20T12:00:00Z',
      inputHash: 'abcdef0123456789',
      scenario: {
        name: 'Test Load 01',
        rows: [],
        equipment: [],
        settings: { seed: 1, maxAttempts: 1, maxMs: 1000, minSupportPct: 75 },
      },
      equipmentId: 'van-53',
      arrangementName: 'Arrangement 1',
      edited: false,
      status: 'FEASIBLE_UNDER_MODELED_CONSTRAINTS',
      metrics: {
        placedUnits: 2,
        totalUnits: 2,
        occupiedVolumePct: 4.1,
        loadedWeightKg: 1814.37, // ~4,000 lbs
        unknownWeightUnits: 0,
        payloadKg: 20000,
        payloadRemainingKg: 18185.63,
        usedLengthMm: 2400,
        cogXPct: 30,
      },
      placements: [
        { unitId: 'u1', rowUid: 'r1', label: 'Item 1', x: 0, y: 0, z: 0, dx: 1200, dy: 1000, dz: 1500, order: 1 },
        { unitId: 'u2', rowUid: 'r1', label: 'Item 2', x: 1200, y: 0, z: 0, dx: 1200, dy: 1000, dz: 1500, order: 2 },
      ],
      unplacedUnitIds: [],
      reasons: [],
      checks: [],
      validation: { passed: true, violations: [], validatedAt: '2026-10-20T12:00:00Z' },
      limitations: [],
    };

    const edi = generateEdi214(mockPlan, {
      carrierScac: 'SWFT',
      shipperId: 'ACME',
      bolNumber: 'BOL-998877',
      sealNumber: 'SEAL-445566',
      statusCode: 'X3',
      originCity: 'Dallas',
      originState: 'TX',
    });

    expect(edi).toContain('ISA*00*');
    expect(edi).toContain('GS*QM*SWFT*ACME');
    expect(edi).toContain('ST*214*0001');
    expect(edi).toContain('B10*SHP-ABCDEF01*BOL-998877*SWFT');
    expect(edi).toContain('L11*SEAL-445566*SE');
    expect(edi).toContain('L11*VAN-53*EQ');
    expect(edi).toContain('AT7*X3*NS*');
    expect(edi).toContain('MS1*Dallas*TX*USA');
    expect(edi).toContain('AT8*G*L*4000*2*PLT');
    expect(edi).toContain('SE*9*0001');
    expect(edi).toContain('GE*1*1');
    expect(edi).toContain('IEA*1*000000001');
  });
});
