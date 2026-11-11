/**
 * NMFC Density & Freight Classification Engine (LTL / 49 CFR Part 1033).
 * Product 01 — Cargo Fit & Load Planning
 *
 * Evaluates cargo cubic dimensions, pallet packaging density, and dimensional weight
 * to determine standard National Motor Freight Classification (NMFC) classes (50 to 500)
 * and prevent carrier re-classification audits and re-weigh penalties.
 */

export interface NmfcTier {
  classNumber: number;
  minDensityPcf: number;
  maxDensityPcf: number;
  description: string;
  representativeGoods: string;
}

export const NMFC_STANDARD_TIERS: NmfcTier[] = [
  { classNumber: 50, minDensityPcf: 50.0, maxDensityPcf: Infinity, description: 'Clean Dense Freight', representativeGoods: 'Steel bolts, lead bars, dense hardware, metal castings' },
  { classNumber: 55, minDensityPcf: 35.0, maxDensityPcf: 50.0, description: 'Dense Hard Goods', representativeGoods: 'Bricks, mortar, hardwood lumber, heavy fasteners' },
  { classNumber: 60, minDensityPcf: 30.0, maxDensityPcf: 35.0, description: 'Heavy Manufactured Freight', representativeGoods: 'Car parts, canned goods in crates, drummed chemicals' },
  { classNumber: 65, minDensityPcf: 22.5, maxDensityPcf: 30.0, description: 'Medium-Dense Industrial', representativeGoods: 'Bottled beverages, ceramic tile, dense food items' },
  { classNumber: 70, minDensityPcf: 15.0, maxDensityPcf: 22.5, description: 'Standard General Freight', representativeGoods: 'Boxed foods, automobile engines, machine parts' },
  { classNumber: 77.5, minDensityPcf: 13.5, maxDensityPcf: 15.0, description: 'Medium Freight', representativeGoods: 'Tires, snowplows, bathroom fixtures, plumbing' },
  { classNumber: 85, minDensityPcf: 12.0, maxDensityPcf: 13.5, description: 'Sub-Medium General Goods', representativeGoods: 'Packaged transmission parts, cast iron cookware' },
  { classNumber: 92.5, minDensityPcf: 10.5, maxDensityPcf: 12.0, description: 'Standard Machinery & Electronics', representativeGoods: 'Computers, office machines, small appliances' },
  { classNumber: 100, minDensityPcf: 9.0, maxDensityPcf: 10.5, description: 'Light Medium Goods', representativeGoods: 'Wine coolers, boat covers, heavy canvas, cookware' },
  { classNumber: 110, minDensityPcf: 8.0, maxDensityPcf: 9.0, description: 'Light-Medium Bulk', representativeGoods: 'Cabinets, framed mirrors, lighting fixtures' },
  { classNumber: 125, minDensityPcf: 7.0, maxDensityPcf: 8.0, description: 'Light Bulk Household', representativeGoods: 'Small household appliances, light electronics' },
  { classNumber: 150, minDensityPcf: 6.0, maxDensityPcf: 7.0, description: 'Bulky Sheet Goods', representativeGoods: 'Sheet metal parts, assembled metal furniture' },
  { classNumber: 175, minDensityPcf: 5.0, maxDensityPcf: 6.0, description: 'Light Bulky Goods', representativeGoods: 'Clothing on hangers, light machinery' },
  { classNumber: 200, minDensityPcf: 4.0, maxDensityPcf: 5.0, description: 'Low Density Bulky', representativeGoods: 'Packaged aluminum doors, aircraft parts, boxed bikes' },
  { classNumber: 250, minDensityPcf: 3.0, maxDensityPcf: 4.0, description: 'Very Low Density', representativeGoods: 'Mattresses, foam padding, wicker furniture' },
  { classNumber: 300, minDensityPcf: 2.0, maxDensityPcf: 3.0, description: 'High Cube Bulky', representativeGoods: 'Wood cabinets, model airplanes, light display cases' },
  { classNumber: 400, minDensityPcf: 1.0, maxDensityPcf: 2.0, description: 'Extremely Low Density', representativeGoods: 'Lightweight kayaks, large stuffed animal mounts' },
  { classNumber: 500, minDensityPcf: 0.0, maxDensityPcf: 1.0, description: 'Maximum Cube Low Density', representativeGoods: 'Ping pong balls, uncompressed bulk fiber, feathers' },
];

export interface NmfcClassificationInput {
  totalWeightLbs: number;
  totalVolumeCuFt: number; // or computed from width/length/height inches
  lengthInches?: number;
  widthInches?: number;
  heightInches?: number;
  dimFactor?: number; // 166 default for domestic freight, 139 for air/express, 250 for low-density LTL
}

export interface NmfcClassificationResult {
  actualWeightLbs: number;
  volumeCuFt: number;
  densityPcf: number;
  recommendedNmfcClass: number;
  tier: NmfcTier;
  dimFactor: number;
  dimWeightLbs: number;
  billableWeightLbs: number;
  isDimWeightPenaltyActive: boolean;
  dimWeightOverageLbs: number;
  auditExplanation: string;
}

/**
 * Calculates freight packaging density (lbs/ft³) and recommends statutory NMFC class.
 */
export function classifyFreightDensity(input: NmfcClassificationInput): NmfcClassificationResult {
  const actualWeight = Math.max(1, input.totalWeightLbs);
  const dimFactor = input.dimFactor ?? 166;

  let cuFt = input.totalVolumeCuFt;
  if (!cuFt && input.lengthInches && input.widthInches && input.heightInches) {
    const cuIn = input.lengthInches * input.widthInches * input.heightInches;
    cuFt = cuIn / 1728; // 1728 cu inches = 1 cu foot
  }
  cuFt = Math.max(0.1, Math.round((cuFt || 1) * 100) / 100);

  const densityPcf = Math.round((actualWeight / cuFt) * 100) / 100;

  // Match NMFC Tier
  const tier = NMFC_STANDARD_TIERS.find(
    (t) => densityPcf >= t.minDensityPcf && densityPcf < t.maxDensityPcf
  ) ?? (densityPcf >= 50 ? NMFC_STANDARD_TIERS[0] : NMFC_STANDARD_TIERS[NMFC_STANDARD_TIERS.length - 1]);

  // Dimensional weight calculation: (L * W * H in inches) / DIM factor
  // or (cuFt * 1728) / DIM factor
  const totalCuInches = cuFt * 1728;
  const dimWeightLbs = Math.round(totalCuInches / dimFactor);
  const billableWeightLbs = Math.max(actualWeight, dimWeightLbs);
  const isDimWeightPenaltyActive = dimWeightLbs > actualWeight;
  const dimWeightOverageLbs = isDimWeightPenaltyActive ? dimWeightLbs - actualWeight : 0;

  let auditExplanation = `Density: ${densityPcf.toFixed(1)} lbs/ft³ maps to statutory NMFC Class ${tier.classNumber} (${tier.description}).`;
  if (isDimWeightPenaltyActive) {
    auditExplanation += ` DIM weight penalty active: Cube-out exceeds weight limit by ${dimWeightOverageLbs.toLocaleString()} lbs (DIM factor ${dimFactor}). Carrier will bill ${billableWeightLbs.toLocaleString()} lbs.`;
  } else {
    auditExplanation += ` Actual weight governs billing (${actualWeight.toLocaleString()} lbs billable).`;
  }

  return {
    actualWeightLbs: actualWeight,
    volumeCuFt: cuFt,
    densityPcf,
    recommendedNmfcClass: tier.classNumber,
    tier,
    dimFactor,
    dimWeightLbs,
    billableWeightLbs,
    isDimWeightPenaltyActive,
    dimWeightOverageLbs,
    auditExplanation,
  };
}
