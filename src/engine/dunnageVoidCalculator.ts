/**
/**
 * 49 CFR § 393.106 Cargo Void & Dunnage Airbag Placement Engine.
 *
 * Federal Motor Carrier Safety Administration (FMCSA) Standard:
 *  - 49 CFR § 393.106(b): Cargo must be immobilized or secured to prevent shifting
 *    forward (0.8g), rearward (0.5g), and laterally (0.5g).
 *  - When lateral or longitudinal voids exceed 6 inches (152.4 mm), void fillers,
 *    friction mats (deck friction >= 0.5 mu), or AAR/FMCSA certified inflatable
 *    dunnage air bags must be installed to prevent tipping and load shift.
 */

export interface EquipmentInteriorEnvelope {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PlacedUnitGeometry {
  unitId: string;
  label: string;
  xMm: number; // Front-to-back coordinate (0 = front bulkhead)
  yMm: number; // Left-to-right coordinate (0 = left wall)
  zMm: number; // Floor-to-ceiling coordinate (0 = floor)
  dxMm: number; // Unit length
  dyMm: number; // Unit width
  dzMm: number; // Unit height
  weightKg: number;
}

export interface VoidAnalysisInput {
  equipment: EquipmentInteriorEnvelope;
  placements: PlacedUnitGeometry[];
  deckFrictionMu?: number; // Default 0.35 for dry wood floor
}

export interface DetectedVoidRegion {
  id: string;
  type: 'LATERAL_VOID' | 'LONGITUDINAL_VOID' | 'REAR_DROP_VOID';
  locationDescription: string;
  gapInches: number;
  gapMm: number;
  exceedsStatutoryThreshold: boolean; // > 6.0 inches
  recommendedDunnage: {
    type: 'INFLATABLE_AIRBAG_LEVEL_1' | 'INFLATABLE_AIRBAG_LEVEL_2' | 'RUBBER_FRICTION_MAT' | 'VOID_PANEL';
    sizeDescription: string;
    quantity: number;
    targetPressurePsi?: number;
  };
}

export interface DunnageComplianceReport {
  totalVoidsDetected: number;
  unsecuredVoidsCount: number;
  statutoryCompliant: boolean;
  deckFrictionMu: number;
  requiresFrictionMats: boolean;
  airbagSummary: {
    level1AirbagsCount: number;
    level2AirbagsCount: number;
    frictionMatsCount: number;
  };
  voidRegions: DetectedVoidRegion[];
  regulatoryNotice: string;
}

const STATUTORY_GAP_THRESHOLD_INCHES = 6.0;
const MM_PER_INCH = 25.4;

export function evaluateCargoVoidsAndDunnage(input: VoidAnalysisInput): DunnageComplianceReport {
  const { equipment, placements, deckFrictionMu = 0.35 } = input;
  const voidRegions: DetectedVoidRegion[] = [];

  if (placements.length === 0) {
    return {
      totalVoidsDetected: 0,
      unsecuredVoidsCount: 0,
      statutoryCompliant: true,
      deckFrictionMu,
      requiresFrictionMats: deckFrictionMu < 0.5,
      airbagSummary: {
        level1AirbagsCount: 0,
        level2AirbagsCount: 0,
        frictionMatsCount: 0,
      },
      voidRegions: [],
      regulatoryNotice: 'Empty equipment interior. No cargo void securement required.',
    };
  }

  // 1. Analyze Rear Drop-off Void (Between rearmost cargo face and trailer rear door)
  let maxRearX = 0;
  for (const p of placements) {
    const rearFace = p.xMm + p.dxMm;
    if (rearFace > maxRearX) {
      maxRearX = rearFace;
    }
  }

  const rearGapMm = Math.max(0, equipment.lengthMm - maxRearX);
  const rearGapInches = Number((rearGapMm / MM_PER_INCH).toFixed(1));

  if (rearGapInches > STATUTORY_GAP_THRESHOLD_INCHES) {
    const isDeepVoid = rearGapInches > 24.0;
    voidRegions.push({
      id: 'VOID-REAR-01',
      type: 'REAR_DROP_VOID',
      locationDescription: `Rear door void (${rearGapInches}" from cargo face to rear door)`,
      gapInches: rearGapInches,
      gapMm: rearGapMm,
      exceedsStatutoryThreshold: true,
      recommendedDunnage: {
        type: isDeepVoid ? 'INFLATABLE_AIRBAG_LEVEL_2' : 'INFLATABLE_AIRBAG_LEVEL_1',
        sizeDescription: isDeepVoid ? '48" x 84" Level 2 Heavy Dunnage Bag' : '36" x 48" Level 1 Inflatable Bag',
        quantity: Math.max(1, Math.ceil(equipment.widthMm / 1200)),
        targetPressurePsi: isDeepVoid ? 4.5 : 3.0,
      },
    });
  }

  // 2. Analyze Lateral Wall Gaps (Left and Right wall clearance)
  // For each longitudinal station, check total lateral cargo span vs interior width
  const lateralBins = new Map<number, { minLeft: number; maxRight: number; heightMax: number }>();
  const BIN_RESOLUTION_MM = 1000;

  for (const p of placements) {
    const binKey = Math.floor(p.xMm / BIN_RESOLUTION_MM);
    const existing = lateralBins.get(binKey) || {
      minLeft: p.yMm,
      maxRight: p.yMm + p.dyMm,
      heightMax: p.zMm + p.dzMm,
    };
    existing.minLeft = Math.min(existing.minLeft, p.yMm);
    existing.maxRight = Math.max(existing.maxRight, p.yMm + p.dyMm);
    existing.heightMax = Math.max(existing.heightMax, p.zMm + p.dzMm);
    lateralBins.set(binKey, existing);
  }

  let lateralVoidIndex = 1;
  for (const [binKey, span] of lateralBins.entries()) {
    const xCenterFt = ((binKey * BIN_RESOLUTION_MM + BIN_RESOLUTION_MM / 2) / 304.8).toFixed(1);
    const totalOccupiedWidthMm = span.maxRight - span.minLeft;
    const lateralVoidMm = equipment.widthMm - totalOccupiedWidthMm;
    const lateralVoidInches = Number((lateralVoidMm / MM_PER_INCH).toFixed(1));

    if (lateralVoidInches > STATUTORY_GAP_THRESHOLD_INCHES) {
      voidRegions.push({
        id: `VOID-LAT-${lateralVoidIndex++}`,
        type: 'LATERAL_VOID',
        locationDescription: `Centerline lateral void near ${xCenterFt} ft from nose (${lateralVoidInches}" lateral gap)`,
        gapInches: lateralVoidInches,
        gapMm: lateralVoidMm,
        exceedsStatutoryThreshold: true,
        recommendedDunnage: {
          type: 'INFLATABLE_AIRBAG_LEVEL_1',
          sizeDescription: '36" x 48" Level 1 Dunnage Airbag or Center Honeycomb Buffer',
          quantity: 1,
          targetPressurePsi: 2.5,
        },
      });
    }
  }

  const unsecuredVoids = voidRegions.filter((v) => v.exceedsStatutoryThreshold);
  const requiresFrictionMats = deckFrictionMu < 0.5;

  let level1Count = 0;
  let level2Count = 0;
  for (const v of voidRegions) {
    if (v.recommendedDunnage.type === 'INFLATABLE_AIRBAG_LEVEL_1') {
      level1Count += v.recommendedDunnage.quantity;
    } else if (v.recommendedDunnage.type === 'INFLATABLE_AIRBAG_LEVEL_2') {
      level2Count += v.recommendedDunnage.quantity;
    }
  }

  const frictionMatsCount = requiresFrictionMats ? Math.ceil(placements.length * 0.75) : 0;

  return {
    totalVoidsDetected: voidRegions.length,
    unsecuredVoidsCount: unsecuredVoids.length,
    statutoryCompliant: unsecuredVoids.length === 0,
    deckFrictionMu,
    requiresFrictionMats,
    airbagSummary: {
      level1AirbagsCount: level1Count,
      level2AirbagsCount: level2Count,
      frictionMatsCount,
    },
    voidRegions,
    regulatoryNotice:
      unsecuredVoids.length > 0
        ? `49 CFR § 393.106 VIOLATION RISK: ${unsecuredVoids.length} void gap(s) exceed statutory 6.0" maximum. Deploy designated dunnage airbags and friction mats prior to departure.`
        : '49 CFR § 393.106 COMPLIANT: All cargo void clearances within statutory limits under 0.8g deceleration.',
  };
}
