/**
 * Trailer Tandem Bogie & Fifth Wheel Pin Slider Engine
 * Simulates weight redistribution across Steer, Drive Tandem, and Trailer Tandem axles
 * and validates Kingpin-to-Rear-Axle (KPRA) statutory compliance (e.g., California 40-ft rule).
 */

import { VehicleGeometryInput, evaluateBridgeCompliance, BridgeComplianceReport } from './bridge';

export interface TandemSliderConfig {
  tandemHole: number; // 1 (rearmost) to 12 (forwardmost), default 6
  fifthWheelPosition: number; // -3 (rear) to +3 (forward), 0 = centered over drive tandem
  holeSpacingInches?: number; // standard 4.0 inches per pin hole
  weightShiftPerHoleLbs?: number; // empirical 300-450 lbs transfer per hole
}

export interface TandemSlideResult {
  config: TandemSliderConfig;
  kpraFt: number;
  kpraMaxFt: number;
  kpraCompliant: boolean;
  steerWeightLbs: number;
  driveWeightLbs: number;
  trailerWeightLbs: number;
  totalGvwLbs: number;
  bridgeReport: BridgeComplianceReport;
  allAxlesLegal: boolean;
  recommendation: string;
}

export interface TandemOptimizationResult {
  optimalHole: number | null;
  optimalFifthWheel: number | null;
  feasible: boolean;
  bestResult: TandemSlideResult;
  allHoleResults: TandemSlideResult[];
  explanation: string;
}

/**
 * Standard 53ft Trailer Tandem rail parameters:
 * Hole 1 = Tandem all the way to the rear (max KPRA ~43.5 ft, max weight on drive axles)
 * Hole 6 = Center bridge balance (~40 ft KPRA)
 * Hole 12 = Tandem all the way forward (min KPRA ~36 ft, max weight on trailer tandem)
 */
export function simulateTandemSlide(
  input: VehicleGeometryInput,
  config: TandemSliderConfig
): TandemSlideResult {
  const hole = Math.max(1, Math.min(12, config.tandemHole));
  const fwPos = Math.max(-3, Math.min(3, config.fifthWheelPosition));
  const spacingIn = config.holeSpacingInches ?? 4.0;

  // Base tandem center is at hole 6 (456 inches / 38 ft from kingpin)
  // Sliding forward (hole > 6) decreases wheelbase and moves weight to trailer tandem
  const deltaHoles = hole - 6;
  const wheelbaseDeltaIn = -deltaHoles * spacingIn;
  const effectiveTrailerWheelbaseIn = (input.trailerWheelbaseIn ?? 456) + wheelbaseDeltaIn;

  // Kingpin to center of rearmost axle (KPRA)
  // Rear axle is 24.5 inches behind tandem center for 49" tandem spacing
  const kpraIn = effectiveTrailerWheelbaseIn + 24.5;
  const kpraFt = Math.round((kpraIn / 12) * 10) / 10;
  const kpraMaxFt = 40.0; // California STAA statutory limit

  // Fifth wheel offset shifting steer vs drive
  // +1 fwPos moves fifth wheel forward, adding ~250 lbs to steer and taking from drive
  const fwWeightShiftLbs = fwPos * 250;

  // Run bridge compliance with modified geometry
  const adjustedInput: VehicleGeometryInput = {
    ...input,
    trailerWheelbaseIn: effectiveTrailerWheelbaseIn,
    kpraIn,
    tareSteerLbs: (input.tareSteerLbs ?? 10500) + fwWeightShiftLbs,
    tareDriveLbs: (input.tareDriveLbs ?? 14000) - fwWeightShiftLbs,
  };

  const bridgeReport = evaluateBridgeCompliance(adjustedInput);

  const steerGroup = bridgeReport.groups.find((g) => g.id.includes('steer'));
  const driveGroup = bridgeReport.groups.find((g) => g.id.includes('drive'));
  const trailerGroup = bridgeReport.groups.find((g) => g.id.includes('trailer'));

  const steerWeightLbs = steerGroup?.actualWeightLbs ?? 0;
  const driveWeightLbs = driveGroup?.actualWeightLbs ?? 0;
  const trailerWeightLbs = trailerGroup?.actualWeightLbs ?? 0;

  const kpraCompliant = kpraFt <= kpraMaxFt;
  const allAxlesLegal = bridgeReport.allCompliant && kpraCompliant;

  let recommendation = 'Tandem and fifth wheel positions achieve full statutory compliance.';
  if (!kpraCompliant) {
    recommendation = `KPRA of ${kpraFt} ft exceeds California statutory limit of ${kpraMaxFt} ft. Slide tandem forward (higher hole number).`;
  } else if (driveGroup && !driveGroup.compliant) {
    recommendation = `Drive tandem overloaded (${driveWeightLbs.toLocaleString()} lbs > ${driveGroup.maxLegalWeightLbs.toLocaleString()} lbs). Slide trailer tandem forward (higher hole number) to shift weight to trailer.`;
  } else if (trailerGroup && !trailerGroup.compliant) {
    recommendation = `Trailer tandem overloaded (${trailerWeightLbs.toLocaleString()} lbs > ${trailerGroup.maxLegalWeightLbs.toLocaleString()} lbs). Slide trailer tandem rearward (lower hole number) to shift weight to drives.`;
  } else if (steerGroup && !steerGroup.compliant) {
    recommendation = `Steer axle overloaded (${steerWeightLbs.toLocaleString()} lbs). Slide fifth wheel rearward.`;
  }

  return {
    config: { tandemHole: hole, fifthWheelPosition: fwPos },
    kpraFt,
    kpraMaxFt,
    kpraCompliant,
    steerWeightLbs,
    driveWeightLbs,
    trailerWeightLbs,
    totalGvwLbs: bridgeReport.overallGvwLbs,
    bridgeReport,
    allAxlesLegal,
    recommendation,
  };
}

/**
 * Automatically searches all 12 tandem pin holes to find a legal axle configuration.
 */
export function solveOptimalTandemPosition(input: VehicleGeometryInput): TandemOptimizationResult {
  const allHoleResults: TandemSlideResult[] = [];
  let optimalHole: number | null = null;
  let bestResult: TandemSlideResult | null = null;

  for (let hole = 1; hole <= 12; hole++) {
    const res = simulateTandemSlide(input, { tandemHole: hole, fifthWheelPosition: 0 });
    allHoleResults.push(res);

    if (res.allAxlesLegal && optimalHole === null) {
      optimalHole = hole;
      bestResult = res;
    }
  }

  if (!bestResult) {
    // If neutral fifth wheel didn't solve it, try fifth wheel offsets
    for (let fw = -2; fw <= 2; fw += 2) {
      if (fw === 0) continue;
      for (let hole = 1; hole <= 12; hole++) {
        const res = simulateTandemSlide(input, { tandemHole: hole, fifthWheelPosition: fw });
        if (res.allAxlesLegal) {
          return {
            optimalHole: hole,
            optimalFifthWheel: fw,
            feasible: true,
            bestResult: res,
            allHoleResults,
            explanation: `Solved legal bridge compliance at Tandem Pin Hole #${hole} with Fifth Wheel Position ${fw > 0 ? '+' + fw : fw}.`,
          };
        }
      }
    }

    // Still infeasible (cargo weight inherently excessive or severely unbalanced)
    const fallback = allHoleResults[5]; // hole 6
    return {
      optimalHole: null,
      optimalFifthWheel: null,
      feasible: false,
      bestResult: fallback,
      allHoleResults,
      explanation: 'No legal pin combination found under current cargo weight and CG. Cargo must be physically repositioned or lightened.',
    };
  }

  return {
    optimalHole,
    optimalFifthWheel: 0,
    feasible: true,
    bestResult,
    allHoleResults,
    explanation: `Optimal legal setting: Tandem Pin Hole #${optimalHole} (KPRA: ${bestResult.kpraFt} ft, Drive: ${bestResult.driveWeightLbs.toLocaleString()} lbs, Trailer: ${bestResult.trailerWeightLbs.toLocaleString()} lbs).`,
  };
}
