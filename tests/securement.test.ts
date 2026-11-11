import { describe, it, expect } from 'vitest';
import { computeSecurementPlan } from '../src/engine/securement';
import type { Unit, Placement } from '../src/engine/types';

describe('P01 Cargo Securement & Restraint Engine (49 CFR § 393.100 - § 393.136)', () => {
  const sampleUnits: Unit[] = [
    {
      id: 'hu-nose-01',
      rowUid: 'row-1',
      label: 'Forward Blocked Pallet',
      dims: [1200, 1000, 1500],
      weightKg: 1000, // ~2,204 lbs
      rotation: 'fixed',
      stackable: false,
    },
    {
      id: 'hu-mid-02',
      rowUid: 'row-2',
      label: 'Unblocked Mid-Trailer Pallet',
      dims: [1200, 1000, 1500],
      weightKg: 800, // ~1,763 lbs
      rotation: 'fixed',
      stackable: false,
    },
    {
      id: 'hu-heavy-03',
      rowUid: 'row-3',
      label: 'Heavy Industrial Machinery',
      dims: [3500, 2000, 1800],
      weightKg: 5500, // ~12,125 lbs (≥10,000 lbs)
      rotation: 'fixed',
      stackable: false,
    },
  ];

  const samplePlacements: Placement[] = [
    {
      unitId: 'hu-nose-01',
      rowUid: 'row-1',
      label: 'Forward Blocked Pallet',
      order: 1,
      x: 0, // Flush against front bulkhead
      y: 0,
      z: 0,
      dx: 1200,
      dy: 1000,
      dz: 1500,
    },
    {
      unitId: 'hu-mid-02',
      rowUid: 'row-2',
      label: 'Unblocked Mid-Trailer Pallet',
      order: 2,
      x: 5000, // Unblocked forward
      y: 0,
      z: 0,
      dx: 1200,
      dy: 1000,
      dz: 1500,
    },
    {
      unitId: 'hu-heavy-03',
      rowUid: 'row-3',
      label: 'Heavy Industrial Machinery',
      order: 3,
      x: 8000, // Heavy equipment in well
      y: 0,
      z: 0,
      dx: 3500,
      dy: 2000,
      dz: 1800,
    },
  ];

  it('computes aggregate Working Load Limit (WLL) at >= 50% of cargo weight per § 393.106(d)', () => {
    const report = computeSecurementPlan(sampleUnits, samplePlacements);

    expect(report.articles).toHaveLength(3);
    for (const article of report.articles) {
      expect(article.requiredAggregateWllLbs).toBeGreaterThanOrEqual(Math.floor(article.weightLbs * 0.499));
      expect(article.requiredAggregateWllKg).toBeGreaterThanOrEqual(Math.floor(article.weightKg * 0.499));
    }
    expect(report.totalRequiredWllLbs).toBeGreaterThan(0);
  });

  it('correctly classifies blocked vs unblocked forward placement under 0.8g deceleration', () => {
    const report = computeSecurementPlan(sampleUnits, samplePlacements);

    const noseArticle = report.articles.find((a) => a.unitId === 'hu-nose-01')!;
    const midArticle = report.articles.find((a) => a.unitId === 'hu-mid-02')!;

    expect(noseArticle.blockedForward).toBe(true);
    expect(noseArticle.notes.some((n) => n.includes('bulkhead'))).toBe(true);

    expect(midArticle.blockedForward).toBe(false);
    expect(midArticle.notes.some((n) => n.includes('Uncontained forward motion'))).toBe(true);
    expect(report.unblockedForwardCount).toBe(2); // mid-02 and heavy-03
  });

  it('does not infer commodity-specific chain requirements solely from weight', () => {
    const report = computeSecurementPlan(sampleUnits, samplePlacements, {
      hardwarePreference: 'strap_2in',
    });

    const heavyArticle = report.articles.find((a) => a.unitId === 'hu-heavy-03')!;
    expect(heavyArticle.weightLbs).toBeGreaterThan(10000);
    expect(heavyArticle.recommendedHardware).toBe('strap_2in');
    expect(heavyArticle.notes.join(' ')).not.toContain('mandated');
    expect(heavyArticle.notes.join(' ')).toContain('commodity-specific');
  });

  it('only estimates placed units and exposes missing weights and unmatched placements', () => {
    const units = [sampleUnits[0], { ...sampleUnits[1], weightKg: null }, sampleUnits[2]];
    const placements = [samplePlacements[0], samplePlacements[1], { ...samplePlacements[2], unitId: 'missing-unit' }];
    const report = computeSecurementPlan(units, placements);
    expect(report.articles.map(article => article.unitId)).toEqual(['hu-nose-01']);
    expect(report.unknownWeightUnitIds).toEqual(['hu-mid-02']);
    expect(report.unmatchedPlacementUnitIds).toEqual(['missing-unit']);
    expect(report.complete).toBe(false);
  });

  it('evaluates deck friction coefficients and statutory restraint g-forces', () => {
    const rubberReport = computeSecurementPlan(sampleUnits, samplePlacements, {
      deckMaterial: 'anti_slip_rubber',
    });
    expect(rubberReport.deckFrictionMu).toBe(0.60);

    const steelReport = computeSecurementPlan(sampleUnits, samplePlacements, {
      deckMaterial: 'smooth_steel',
    });
    expect(steelReport.deckFrictionMu).toBe(0.20);

    const noseArticle = rubberReport.articles[0];
    expect(Math.abs(noseArticle.forwardRestraintRequiredLbs - noseArticle.weightLbs * 0.8)).toBeLessThanOrEqual(1);
    expect(Math.abs(noseArticle.lateralRestraintRequiredLbs - noseArticle.weightLbs * 0.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(noseArticle.rearRestraintRequiredLbs - noseArticle.weightLbs * 0.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(noseArticle.verticalRestraintRequiredLbs - noseArticle.weightLbs * 0.2)).toBeLessThanOrEqual(1);
  });

  it('produces actionable recommendations for non-compliant unblocked cargo', () => {
    const report = computeSecurementPlan(sampleUnits, samplePlacements);
    expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(report.recommendations.some((r) => r.includes('Deck Friction Rating'))).toBe(true);
    expect(report.recommendations.some((r) => r.includes('not flush against the front bulkhead'))).toBe(true);
  });
});
