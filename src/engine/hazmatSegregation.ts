/**
 * Hazardous Materials Segregation & Compatibility Engine (49 CFR § 177.848)
 * Validates highway transport co-loading compatibility across DOT HazMat placard classes.
 */

export type HazmatClassCode =
  | '1.1' // Explosives (mass explosion)
  | '1.2' // Explosives (projection hazard)
  | '1.3' // Explosives (fire/minor blast)
  | '1.4' // Minor explosion hazard
  | '1.5' // Very insensitive explosives
  | '2.1' // Flammable gas
  | '2.2' // Non-flammable, non-poisonous gas
  | '2.3' // Poisonous / Toxic gas
  | '3'   // Flammable liquids
  | '4.1' // Flammable solids
  | '4.2' // Spontaneously combustible
  | '4.3' // Dangerous when wet
  | '5.1' // Oxidizers
  | '5.2' // Organic peroxides
  | '6.1' // Poisonous / Toxic materials
  | '7'   // Radioactive materials
  | '8'   // Corrosive liquids & solids
  | '9';  // Miscellaneous hazardous materials

export type SegregationVerdict = 'PERMITTED' | 'SEPARATION_REQUIRED' | 'PROHIBITED';

export interface HazmatManifestItem {
  id: string;
  description: string;
  classCode: HazmatClassCode;
  unNumber?: string; // e.g. "UN1263", "UN1760"
  isCyanide?: boolean;
  isAcid?: boolean;
  isLiquid?: boolean;
  weightLbs: number;
}

export interface HazmatConflictRecord {
  itemAId: string;
  itemBId: string;
  classA: HazmatClassCode;
  classB: HazmatClassCode;
  verdict: SegregationVerdict;
  cfrCitation: string;
  description: string;
  recommendedAction: string;
}

export interface HazmatAuditReport {
  compliant: boolean;
  totalHazmatItems: number;
  hasProhibitedCoLoading: boolean;
  hasSeparationRequired: boolean;
  conflicts: HazmatConflictRecord[];
  summaryMessage: string;
}

/**
 * 49 CFR § 177.848(e) Segregation Table Matrix
 * Key: `${classA}:${classB}`
 * 'X' = Prohibited co-loading
 * 'O' = Separation required (must not commingle; 10ft separation recommended)
 */
const SEGREGATION_MATRIX: Record<string, 'X' | 'O'> = {
  // Class 1.1/1.2 prohibitions
  '1.1:2.1': 'X', '2.1:1.1': 'X',
  '1.1:2.2': 'X', '2.2:1.1': 'X',
  '1.1:2.3': 'X', '2.3:1.1': 'X',
  '1.1:3': 'X',   '3:1.1': 'X',
  '1.1:4.1': 'X', '4.1:1.1': 'X',
  '1.1:4.2': 'X', '4.2:1.1': 'X',
  '1.1:4.3': 'X', '4.3:1.1': 'X',
  '1.1:5.1': 'X', '5.1:1.1': 'X',
  '1.1:5.2': 'X', '5.2:1.1': 'X',
  '1.1:6.1': 'X', '6.1:1.1': 'X',
  '1.1:7': 'X',   '7:1.1': 'X',
  '1.1:8': 'X',   '8:1.1': 'X',

  // Class 1.3 prohibitions
  '1.3:2.1': 'X', '2.1:1.3': 'X',
  '1.3:2.3': 'X', '2.3:1.3': 'X',
  '1.3:3': 'X',   '3:1.3': 'X',
  '1.3:4.2': 'X', '4.2:1.3': 'X',
  '1.3:4.3': 'X', '4.3:1.3': 'X',
  '1.3:5.1': 'X', '5.1:1.3': 'X',
  '1.3:5.2': 'X', '5.2:1.3': 'X',
  '1.3:7': 'X',   '7:1.3': 'X',
  '1.3:8': 'X',   '8:1.3': 'X',

  // Class 2.3 (Toxic gas) vs Class 3 / 4 / 5
  '2.3:3': 'O',   '3:2.3': 'O',
  '2.3:4.2': 'O', '4.2:2.3': 'O',
  '2.3:5.1': 'O', '5.1:2.3': 'O',

  // Class 3 Flammable Liquids vs Class 5.1 Oxidizers
  '3:5.1': 'X',   '5.1:3': 'X',
  '3:5.2': 'O',   '5.2:3': 'O',

  // Class 4.2 Spontaneously Combustible vs Class 5.1 Oxidizers
  '4.2:5.1': 'X', '5.1:4.2': 'X',

  // Class 4.3 Dangerous when wet vs Class 8 Corrosive liquids
  '4.3:8': 'O',   '8:4.3': 'O',

  // Class 5.1 Oxidizers vs Class 8 Corrosives
  '5.1:8': 'O',   '8:5.1': 'O',
};

/**
 * Evaluates pairwise compatibility between two hazardous cargo items.
 */
export function evaluateHazmatPair(
  itemA: HazmatManifestItem,
  itemB: HazmatManifestItem
): HazmatConflictRecord | null {
  // Special statutory rule: Cyanides vs Acids (49 CFR § 177.848(c))
  if ((itemA.isCyanide && itemB.isAcid) || (itemA.isAcid && itemB.isCyanide)) {
    return {
      itemAId: itemA.id,
      itemBId: itemB.id,
      classA: itemA.classCode,
      classB: itemB.classCode,
      verdict: 'PROHIBITED',
      cfrCitation: '49 CFR § 177.848(c)',
      description: 'Cyanide or cyanide mixtures may not be loaded with acids due to lethal hydrocyanic / hydrogen cyanide gas generation.',
      recommendedAction: 'Remove item from vehicle and dispatch on segregated transport.',
    };
  }

  // Corrosive liquids loaded above flammable or oxidizing materials
  if (itemA.isLiquid && itemA.classCode === '8' && (itemB.classCode === '4.1' || itemB.classCode === '4.2' || itemB.classCode === '5.1')) {
    return {
      itemAId: itemA.id,
      itemBId: itemB.id,
      classA: itemA.classCode,
      classB: itemB.classCode,
      verdict: 'SEPARATION_REQUIRED',
      cfrCitation: '49 CFR § 177.848(e)(3)',
      description: 'Class 8 corrosive liquids must not be loaded above Class 4 or Class 5 materials.',
      recommendedAction: 'Position Class 8 liquid on the floor, separated by at least 10 feet or non-combustible dunnage.',
    };
  }

  const lookupKey = `${itemA.classCode}:${itemB.classCode}`;
  const code = SEGREGATION_MATRIX[lookupKey];

  if (code === 'X') {
    return {
      itemAId: itemA.id,
      itemBId: itemB.id,
      classA: itemA.classCode,
      classB: itemB.classCode,
      verdict: 'PROHIBITED',
      cfrCitation: '49 CFR § 177.848(e) Table',
      description: `Class ${itemA.classCode} and Class ${itemB.classCode} are strictly prohibited from co-loading on the same vehicle.`,
      recommendedAction: 'Strict prohibition ("X"): These materials must be separated into different vehicles.',
    };
  }

  if (code === 'O') {
    return {
      itemAId: itemA.id,
      itemBId: itemB.id,
      classA: itemA.classCode,
      classB: itemB.classCode,
      verdict: 'SEPARATION_REQUIRED',
      cfrCitation: '49 CFR § 177.848(e) Table',
      description: `Class ${itemA.classCode} and Class ${itemB.classCode} require spatial segregation ("O").`,
      recommendedAction: 'Maintain a minimum 10-ft separation or install non-combustible intervening bulkhead.',
    };
  }

  return null;
}

/**
 * Audits an entire vehicle manifest for hazardous materials segregation violations.
 */
export function auditHazmatManifest(items: HazmatManifestItem[]): HazmatAuditReport {
  const conflicts: HazmatConflictRecord[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const conflict = evaluateHazmatPair(items[i], items[j]);
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }

  const hasProhibited = conflicts.some((c) => c.verdict === 'PROHIBITED');
  const hasSeparation = conflicts.some((c) => c.verdict === 'SEPARATION_REQUIRED');

  let summaryMessage = 'All hazardous materials on manifest comply with 49 CFR § 177.848 co-loading rules.';
  if (hasProhibited) {
    summaryMessage = `ILLEGAL CO-LOAD DETECTED: ${conflicts.filter((c) => c.verdict === 'PROHIBITED').length} strict prohibitions found under 49 CFR § 177.848. Vehicle dispatch must be blocked.`;
  } else if (hasSeparation) {
    summaryMessage = `CONDITIONAL SEGREGATION REQUIRED: ${conflicts.length} pairs require minimum 10-ft spatial buffering or bulkhead isolation.`;
  }

  return {
    compliant: !hasProhibited,
    totalHazmatItems: items.length,
    hasProhibitedCoLoading: hasProhibited,
    hasSeparationRequired: hasSeparation,
    conflicts,
    summaryMessage,
  };
}
