/**
 * Corrugated Packaging Compressive Strength & Stacking Crush Limits Engine.
 * 
 * Implements the McKee Formula for Box Compression Test (BCT) estimation
 * and ASTM D4169 / ISTA 3A environmental degradation factors to prevent
 * bottom-tier corrugated carton collapse during freight transit.
 */

export interface CorrugatedBoardSpec {
  gradeName: string;
  ectRatingLbsPerIn: number; // Edge Crush Test (ECT) e.g., 32, 44, 48, 55
  fluteType: 'B' | 'C' | 'BC_DOUBLE_WALL';
  caliperInches: number; // Board thickness
}

export const STANDARD_BOARD_GRADES: Record<string, CorrugatedBoardSpec> = {
  '32_ECT_C': {
    gradeName: '32 ECT Single-Wall (C-Flute)',
    ectRatingLbsPerIn: 32,
    fluteType: 'C',
    caliperInches: 0.156,
  },
  '44_ECT_C': {
    gradeName: '44 ECT Single-Wall Heavy-Duty (C-Flute)',
    ectRatingLbsPerIn: 44,
    fluteType: 'C',
    caliperInches: 0.160,
  },
  '48_ECT_BC': {
    gradeName: '48 ECT Double-Wall Commercial (BC-Flute)',
    ectRatingLbsPerIn: 48,
    fluteType: 'BC_DOUBLE_WALL',
    caliperInches: 0.250,
  },
  '55_ECT_BC': {
    gradeName: '55 ECT Double-Wall Industrial Heavy-Duty (BC-Flute)',
    ectRatingLbsPerIn: 55,
    fluteType: 'BC_DOUBLE_WALL',
    caliperInches: 0.265,
  },
};

export interface PackagingStackEnvironment {
  relativeHumidityPct: number; // e.g. 50% to 90%
  storageDurationDays: number; // e.g. 1 to 90 days
  stackPattern: 'COLUMN_ALIGNED' | 'INTERLOCKED_BRICK';
  palletOverhangInches: number; // 0 for flush, > 0 for overhang
}

export interface CartonStackingAnalysis {
  cartonLengthIn: number;
  cartonWidthIn: number;
  cartonHeightIn: number;
  cartonPerimeterIn: number;
  singleCartonWeightLbs: number;
  tierCount: number;
  totalStackHeightIn: number;
  boardGrade: CorrugatedBoardSpec;
  mckeeBctLbs: number;
  environmentalSafetyFactor: number;
  safeWorkingBctLbs: number;
  bottomCartonLoadLbs: number;
  utilizationPct: number;
  maxSafeTierCount: number;
  status: 'SAFE' | 'ELEVATED' | 'CRUSH_HAZARD';
  warningMessage?: string;
}

/**
 * Calculates McKee Box Compression Test (BCT) in pounds:
 * BCT = 5.87 * ECT * sqrt(U * d)
 * where:
 *   ECT = Edge Crush Test (lbs/in)
 *   U = Box perimeter (in) = 2 * (Length + Width)
 *   d = Board caliper (in)
 */
export function calculateMcKeeBCT(
  lengthIn: number,
  widthIn: number,
  board: CorrugatedBoardSpec
): number {
  const perimeter = 2 * (lengthIn + widthIn);
  const bct = 5.87 * board.ectRatingLbsPerIn * Math.sqrt(perimeter * board.caliperInches);
  return Math.round(bct * 10) / 10;
}

/**
 * Evaluates the cumulative ASTM D4169 / ISTA environmental safety factor:
 * SF = Base (3.0) * HumidityFactor * DurationFactor * PatternFactor * OverhangFactor
 */
export function calculateEnvironmentalSafetyFactor(env: PackagingStackEnvironment): number {
  let sf = 3.0; // Baseline dynamic safety factor for trucking transit

  // 1. Humidity degradation factor
  if (env.relativeHumidityPct > 85) {
    sf *= 1.65;
  } else if (env.relativeHumidityPct > 70) {
    sf *= 1.40;
  } else if (env.relativeHumidityPct > 50) {
    sf *= 1.20;
  }

  // 2. Storage duration fatigue
  if (env.storageDurationDays > 30) {
    sf *= 1.30;
  } else if (env.storageDurationDays > 10) {
    sf *= 1.15;
  }

  // 3. Stacking alignment pattern (interlocking reduces corner alignment strength by ~40%)
  if (env.stackPattern === 'INTERLOCKED_BRICK') {
    sf *= 1.40;
  }

  // 4. Pallet edge overhang (overhang creates severe crease stress on lower cartons)
  if (env.palletOverhangInches > 0.5) {
    sf *= 1.35;
  } else if (env.palletOverhangInches > 0) {
    sf *= 1.15;
  }

  return Math.round(sf * 100) / 100;
}

/**
 * Analyzes carton compressive capacity and flags stacking crush hazards.
 */
export function analyzeCartonStacking(
  lengthIn: number,
  widthIn: number,
  heightIn: number,
  singleCartonWeightLbs: number,
  tierCount: number,
  board: CorrugatedBoardSpec = STANDARD_BOARD_GRADES['32_ECT_C'],
  env: PackagingStackEnvironment = {
    relativeHumidityPct: 65,
    storageDurationDays: 14,
    stackPattern: 'COLUMN_ALIGNED',
    palletOverhangInches: 0,
  }
): CartonStackingAnalysis {
  const perimeter = 2 * (lengthIn + widthIn);
  const mckeeBct = calculateMcKeeBCT(lengthIn, widthIn, board);
  const sf = calculateEnvironmentalSafetyFactor(env);
  const safeBct = Math.round((mckeeBct / sf) * 10) / 10;

  // The load on the bottom carton is the weight of all tiers resting above it
  const bottomLoad = Math.max(0, (tierCount - 1) * singleCartonWeightLbs);
  const utilization = safeBct > 0 ? Math.round((bottomLoad / safeBct) * 1000) / 10 : 0;

  // Calculate maximum safe tiers that can be stacked without exceeding safe BCT
  const maxSafeTiers = Math.max(1, Math.floor(safeBct / Math.max(1, singleCartonWeightLbs)) + 1);

  let status: CartonStackingAnalysis['status'] = 'SAFE';
  let warningMessage: string | undefined;

  if (utilization > 100) {
    status = 'CRUSH_HAZARD';
    warningMessage = `Bottom carton load (${bottomLoad} lbs) exceeds safe compressive limit (${safeBct} lbs) by ${(utilization - 100).toFixed(1)}%. Risk of bottom carton collapse! Limit stack to ${maxSafeTiers} tiers.`;
  } else if (utilization >= 85) {
    status = 'ELEVATED';
    warningMessage = `Bottom carton load is at ${utilization.toFixed(1)}% of safe capacity. Monitor moisture and avoid additional pallet stacking.`;
  }

  return {
    cartonLengthIn: lengthIn,
    cartonWidthIn: widthIn,
    cartonHeightIn: heightIn,
    cartonPerimeterIn: perimeter,
    singleCartonWeightLbs,
    tierCount,
    totalStackHeightIn: tierCount * heightIn,
    boardGrade: board,
    mckeeBctLbs: mckeeBct,
    environmentalSafetyFactor: sf,
    safeWorkingBctLbs: safeBct,
    bottomCartonLoadLbs: bottomLoad,
    utilizationPct: utilization,
    maxSafeTierCount: maxSafeTiers,
    status,
    warningMessage,
  };
}
