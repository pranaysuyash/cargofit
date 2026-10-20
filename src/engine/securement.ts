/**
 * Cargo Restraint & Tie-Down Securement Engine.
 * Evaluates minimum tie-down counts, working load limits (WLL),
 * friction resistance, and acceleration restraints under
 * US FMCSA 49 CFR § 393.100 - § 393.136 and AU NTC Load Restraint Guide.
 */

import type { Unit, Placement } from './types';

export type DeckMaterial = 'wood_hardwood' | 'smooth_steel' | 'anti_slip_rubber' | 'diamond_plate_steel';

export const DECK_FRICTION_COEFFICIENTS: Record<DeckMaterial, { label: string; mu: number }> = {
  wood_hardwood: { label: 'Clean Hardwood Deck', mu: 0.40 },
  smooth_steel: { label: 'Smooth Clean Steel', mu: 0.20 },
  diamond_plate_steel: { label: 'Diamond Plate Steel', mu: 0.30 },
  anti_slip_rubber: { label: 'High-Friction Rubber Mats (≥0.6μ)', mu: 0.60 },
};

export type TieDownHardwareType = 'strap_2in' | 'strap_4in' | 'chain_5_16_g70' | 'chain_3_8_g70';

export const HARDWARE_WLL: Record<TieDownHardwareType, { label: string; wllLbs: number; wllKg: number }> = {
  strap_2in: { label: '2-inch Synthetic Web Strap', wllLbs: 3333, wllKg: 1512 },
  strap_4in: { label: '4-inch Heavy Winch Strap', wllLbs: 5400, wllKg: 2449 },
  chain_5_16_g70: { label: '5/16" Grade 70 Transport Chain', wllLbs: 4700, wllKg: 2132 },
  chain_3_8_g70: { label: '3/8" Grade 70 Transport Chain', wllLbs: 6600, wllKg: 2994 },
};

export interface ArticleSecurement {
  unitId: string;
  label: string;
  weightKg: number;
  weightLbs: number;
  lengthM: number;
  lengthFt: number;
  blockedForward: boolean; // Positioned against front bulkhead or blocked
  minTieDownsCount: number;
  requiredAggregateWllLbs: number;
  requiredAggregateWllKg: number;
  recommendedHardware: TieDownHardwareType;
  hardwareCount: number;
  forwardRestraintRequiredLbs: number; // 0.8g
  rearRestraintRequiredLbs: number; // 0.5g
  lateralRestraintRequiredLbs: number; // 0.5g
  verticalRestraintRequiredLbs: number; // 0.2g
  frictionRestraintLbs: number;
  notes: string[];
}

export interface RestraintPlanReport {
  deckMaterial: DeckMaterial;
  deckFrictionMu: number;
  articles: ArticleSecurement[];
  totalTieDownsCount: number;
  totalRequiredWllLbs: number;
  totalRequiredWllKg: number;
  summaryHardware: Record<TieDownHardwareType, number>;
  unblockedForwardCount: number;
  recommendations: string[];
}

const KG_TO_LBS = 2.2046226218;

/**
 * Computes tie-down securement requirements for placed cargo units.
 * Pursuant to FMCSA 49 CFR § 393.106 and § 393.110.
 */
export function computeSecurementPlan(
  units: Unit[],
  placements: Placement[],
  options?: {
    deckMaterial?: DeckMaterial;
    hardwarePreference?: TieDownHardwareType;
  }
): RestraintPlanReport {
  const deck = options?.deckMaterial ?? 'wood_hardwood';
  const hardware = options?.hardwarePreference ?? 'strap_2in';
  const mu = DECK_FRICTION_COEFFICIENTS[deck].mu;
  const hw = HARDWARE_WLL[hardware];

  const placementMap = new Map<string, Placement>();
  for (const pl of placements) {
    placementMap.set(pl.unitId, pl);
  }

  const articles: ArticleSecurement[] = [];
  const hardwareSummary: Record<TieDownHardwareType, number> = {
    strap_2in: 0,
    strap_4in: 0,
    chain_5_16_g70: 0,
    chain_3_8_g70: 0,
  };

  let unblockedCount = 0;

  for (const u of units) {
    const pl = placementMap.get(u.id);
    const weightKg = u.weightKg ?? 100; // fallback if undeclared
    const weightLbs = weightKg * KG_TO_LBS;
    const lengthM = (pl ? pl.dx : u.dims[0]) / 1000;
    const lengthFt = lengthM * 3.28084;

    // Check if blocked against front bulkhead (x === 0 or resting directly against front stack)
    const blockedForward = pl ? pl.x <= 50 : false;
    if (!blockedForward) unblockedCount++;

    // Statutory Acceleration requirements (49 CFR § 393.102)
    const forwardRestraintRequiredLbs = weightLbs * 0.8;
    const rearRestraintRequiredLbs = weightLbs * 0.5;
    const lateralRestraintRequiredLbs = weightLbs * 0.5;
    const verticalRestraintRequiredLbs = weightLbs * 0.2;
    const frictionRestraintLbs = weightLbs * mu;

    // Aggregate WLL requirement: 50% of cargo weight (49 CFR § 393.106(d))
    const requiredAggregateWllLbs = weightLbs * 0.5;
    const requiredAggregateWllKg = weightKg * 0.5;

    // Minimum tie-down count (49 CFR § 393.110):
    // 1 tie-down for article <= 5 ft and <= 1,100 lbs
    // 2 tie-downs for article <= 5 ft and > 1,100 lbs
    // 2 tie-downs for article > 5 ft but <= 10 ft
    // +1 tie-down for each additional 10 ft or fraction thereof
    let minCount = 1;
    if (lengthFt <= 5) {
      minCount = weightLbs > 1100 ? 2 : 1;
    } else if (lengthFt <= 10) {
      minCount = 2;
    } else {
      minCount = 2 + Math.ceil((lengthFt - 10) / 10);
    }

    // If unblocked forward, regulations recommend at least 2 tie-downs to prevent forward tipping/sliding
    if (!blockedForward && minCount < 2) {
      minCount = 2;
    }

    // Ensure tie-downs provide sufficient WLL
    const neededForWll = Math.ceil(requiredAggregateWllLbs / hw.wllLbs);
    const finalCount = Math.max(minCount, neededForWll);

    // Pick recommended hardware (heavy machinery > 10,000 lbs requires chains per § 393.126)
    let chosenHw = hardware;
    if (weightLbs >= 10000 && !(hardware as string).startsWith('chain')) {
      chosenHw = 'chain_3_8_g70';
    }

    hardwareSummary[chosenHw] = (hardwareSummary[chosenHw] ?? 0) + finalCount;

    const notes: string[] = [];
    if (blockedForward) {
      notes.push('Resting against front bulkhead / forward block (0.8g deceleration supported).');
    } else {
      notes.push('Uncontained forward motion; requires cross-strapping, chocking, or friction matting.');
    }
    if (weightLbs >= 10000) {
      notes.push('Heavy cargo (≥10,000 lbs): Grade 70 transport chain direct tie-downs mandated under § 393.126.');
    }

    articles.push({
      unitId: u.id,
      label: u.label,
      weightKg,
      weightLbs: Math.round(weightLbs),
      lengthM,
      lengthFt,
      blockedForward,
      minTieDownsCount: finalCount,
      requiredAggregateWllLbs: Math.round(requiredAggregateWllLbs),
      requiredAggregateWllKg: Math.round(requiredAggregateWllKg),
      recommendedHardware: chosenHw,
      hardwareCount: finalCount,
      forwardRestraintRequiredLbs: Math.round(forwardRestraintRequiredLbs),
      rearRestraintRequiredLbs: Math.round(rearRestraintRequiredLbs),
      lateralRestraintRequiredLbs: Math.round(lateralRestraintRequiredLbs),
      verticalRestraintRequiredLbs: Math.round(verticalRestraintRequiredLbs),
      frictionRestraintLbs: Math.round(frictionRestraintLbs),
      notes,
    });
  }

  const totalTieDownsCount = articles.reduce((s, a) => s + a.hardwareCount, 0);
  const totalRequiredWllLbs = articles.reduce((s, a) => s + a.requiredAggregateWllLbs, 0);
  const totalRequiredWllKg = articles.reduce((s, a) => s + a.requiredAggregateWllKg, 0);

  const recommendations: string[] = [
    `Deck Friction Rating: ${DECK_FRICTION_COEFFICIENTS[deck].label} (μ=${mu}).`,
    `Total Required Restraint Hardware: ${totalTieDownsCount} tie-downs across ${articles.length} cargo articles.`,
    `Total Minimum Working Load Limit: ${totalRequiredWllLbs.toLocaleString()} lbs (${Math.round(totalRequiredWllKg).toLocaleString()} kg).`,
  ];

  if (unblockedCount > 0) {
    recommendations.push(
      `${unblockedCount} cargo unit(s) are not flush against the front bulkhead. Install forward dunnage, friction mats, or x-brace ratchet straps to counteract 0.8g forward emergency braking forces.`
    );
  }

  return {
    deckMaterial: deck,
    deckFrictionMu: mu,
    articles,
    totalTieDownsCount,
    totalRequiredWllLbs,
    totalRequiredWllKg,
    summaryHardware: hardwareSummary,
    unblockedForwardCount: unblockedCount,
    recommendations,
  };
}
