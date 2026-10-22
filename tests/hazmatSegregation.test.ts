import { describe, it, expect } from 'vitest';
import {
  auditHazmatManifest,
  evaluateHazmatPair,
  HazmatManifestItem,
} from '../src/engine/hazmatSegregation';

describe('P01 49 CFR § 177.848 Hazardous Materials Segregation Engine', () => {
  it('detects prohibited co-loading of Class 1.1 Explosives and Class 3 Flammable Liquids', () => {
    const itemA: HazmatManifestItem = {
      id: 'HAZ-EXP-01',
      description: 'Dynamite Blasting Caps (Class 1.1D)',
      classCode: '1.1',
      weightLbs: 1200,
    };
    const itemB: HazmatManifestItem = {
      id: 'HAZ-FLAM-02',
      description: 'Lacquer Thinner Paint Solvent (Class 3)',
      classCode: '3',
      weightLbs: 2400,
    };

    const conflict = evaluateHazmatPair(itemA, itemB);
    expect(conflict).toBeDefined();
    expect(conflict!.verdict).toBe('PROHIBITED');
    expect(conflict!.cfrCitation).toContain('177.848');
  });

  it('enforces statutory prohibition of Cyanides co-loaded with Acids', () => {
    const cyanideItem: HazmatManifestItem = {
      id: 'HAZ-CYANIDE-01',
      description: 'Sodium Cyanide Solid Pellets',
      classCode: '6.1',
      isCyanide: true,
      weightLbs: 1800,
    };
    const acidItem: HazmatManifestItem = {
      id: 'HAZ-ACID-02',
      description: 'Hydrochloric Acid Solution (Class 8)',
      classCode: '8',
      isAcid: true,
      weightLbs: 3200,
    };

    const conflict = evaluateHazmatPair(cyanideItem, acidItem);
    expect(conflict).toBeDefined();
    expect(conflict!.verdict).toBe('PROHIBITED');
    expect(conflict!.description.toLowerCase()).toContain('cyanide');
  });

  it('flags conditional spatial segregation for Class 2.3 Toxic Gas and Class 3 Flammable Liquids', () => {
    const toxicGas: HazmatManifestItem = {
      id: 'HAZ-GAS-01',
      description: 'Chlorine Gas Cylinders (Class 2.3)',
      classCode: '2.3',
      weightLbs: 1500,
    };
    const flammableLiquid: HazmatManifestItem = {
      id: 'HAZ-LIQ-02',
      description: 'Acetone Industrial Solvent (Class 3)',
      classCode: '3',
      weightLbs: 2200,
    };

    const conflict = evaluateHazmatPair(toxicGas, flammableLiquid);
    expect(conflict).toBeDefined();
    expect(conflict!.verdict).toBe('SEPARATION_REQUIRED');
    expect(conflict!.recommendedAction).toContain('10-ft separation');
  });

  it('audits an entire multi-item manifest and summarizes legal co-load status', () => {
    const cleanManifest: HazmatManifestItem[] = [
      { id: '1', description: 'Paint Drums', classCode: '3', weightLbs: 2000 },
      { id: '2', description: 'Lead Acid Batteries', classCode: '8', weightLbs: 3500 },
    ];
    const reportClean = auditHazmatManifest(cleanManifest);
    expect(reportClean.compliant).toBe(true);
    expect(reportClean.hasProhibitedCoLoading).toBe(false);

    const illegalManifest: HazmatManifestItem[] = [
      { id: '1', description: 'Blasting Powder', classCode: '1.1', weightLbs: 1000 },
      { id: '2', description: 'Acetone', classCode: '3', weightLbs: 2000 },
      { id: '3', description: 'Bleach Solution', classCode: '8', weightLbs: 1500 },
    ];
    const reportIllegal = auditHazmatManifest(illegalManifest);
    expect(reportIllegal.compliant).toBe(false);
    expect(reportIllegal.hasProhibitedCoLoading).toBe(true);
    expect(reportIllegal.summaryMessage).toContain('ILLEGAL CO-LOAD');
  });
});
