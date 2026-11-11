import { describe, expect, it } from 'vitest';
import { bolReviewScope, scopedBolEvidence } from '../src/engine/bolReviewScope';
import type { PlanFile } from '../src/engine/report';

describe('BOL review and signature scope', () => {
  const plan = {
    createdAt: '2026-11-06T00:00:00Z', inputHash: 'one', equipmentId: 'truck', arrangementName: 'A',
    scenario: { name: 'Load A', rows: [] }, placements: [{ unitId: 'u1', x: 1 }],
    validation: { validatedAt: '2026-11-06T00:00:00Z', passed: true, violations: [] },
  } as unknown as PlanFile;
  const parties = { carrierName: 'Carrier A' };
  const lines = { Cargo: { nmfc: '100', freightClass: '70', packageType: 'PLT' } };

  it('retains evidence only for exactly the reviewed plan and declarations', () => {
    const scope = bolReviewScope(plan, parties, lines);
    const signed = { scope, value: 'signature' };
    expect(scopedBolEvidence(signed, scope)).toBe('signature');
    expect(scopedBolEvidence(signed, bolReviewScope({ ...plan, equipmentId: 'other' }, parties, lines))).toBeNull();
    expect(scopedBolEvidence(signed, bolReviewScope({ ...plan, placements: [{ ...plan.placements[0], x: 2 }] }, parties, lines))).toBeNull();
    expect(scopedBolEvidence(signed, bolReviewScope(plan, { carrierName: 'Carrier B' }, lines))).toBeNull();
    expect(scopedBolEvidence(signed, bolReviewScope(plan, parties, { Cargo: { ...lines.Cargo, freightClass: '85' } }))).toBeNull();
    expect(scopedBolEvidence(signed, null)).toBeNull();
  });

  it('does not invalidate the same document solely because it was rendered later', () => {
    const later = { ...plan, createdAt: '2026-11-06T01:00:00Z', validation: { ...plan.validation, validatedAt: '2026-11-06T01:00:00Z' } };
    expect(bolReviewScope(later, parties, lines)).toBe(bolReviewScope(plan, parties, lines));
  });
});
