/**
 * Federal Bridge Formula B & Axle Spacing Compliance Engine.
 * Evaluates allowable gross weights across multi-axle configurations
 * pursuant to US FMCSA 23 CFR § 658.17 / Bridge Formula B and statutory caps.
 */

export interface AxleGroup {
  id: string;
  name: string;
  axleCount: number; // N
  spacingFt: number; // L (distance between outer axles in feet)
  actualWeightLbs: number;
  statutoryCapLbs: number;
  bridgeFormulaAllowedLbs: number;
  maxLegalWeightLbs: number;
  compliant: boolean;
  marginLbs: number;
  utilizationPct: number;
}

export interface BridgeComplianceReport {
  overallGvwLbs: number;
  maxLegalGvwLbs: number;
  gvwCompliant: boolean;
  gvwMarginLbs: number;
  groups: AxleGroup[];
  allCompliant: boolean;
  kpraFt: number | null; // Kingpin to rear axle distance in feet
  kpraCompliant: boolean; // California STAA 40ft rule
  kpraMaxFt: number;
  reasons: string[];
}

/**
 * FMCSA Bridge Formula B:
 * W = 500 * [ (L * N) / (N - 1) + 12*N + 36 ]
 * Rounded to nearest 500 lbs.
 */
export function calculateBridgeFormulaWeight(spacingFt: number, axleCount: number): number {
  if (axleCount < 2) return 20000;
  const raw = 500 * ((spacingFt * axleCount) / (axleCount - 1) + 12 * axleCount + 36);
  return Math.round(raw / 500) * 500;
}

export interface VehicleGeometryInput {
  equipmentLengthMm: number;
  cargoWeightKg: number;
  cargoCogXMm: number; // mm from front interior bulkhead
  tareSteerLbs?: number;
  tareDriveLbs?: number;
  tareTrailerLbs?: number;
  tractorWheelbaseIn?: number;
  trailerWheelbaseIn?: number; // Kingpin to trailer tandem center
  kpraIn?: number; // Kingpin to center of rearmost axle
}

const KG_TO_LBS = 2.2046226218;

/**
 * Evaluates Federal Bridge Formula B and axle group compliance for a loaded vehicle.
 */
export function evaluateBridgeCompliance(input: VehicleGeometryInput): BridgeComplianceReport {
  const cargoWeightLbs = input.cargoWeightKg * KG_TO_LBS;
  const equipLenFt = (input.equipmentLengthMm / 1000) * 3.28084;
  const cogFt = (input.cargoCogXMm / 1000) * 3.28084;

  const isClass8Semi = equipLenFt >= 40; // 40ft, 48ft, 53ft semitrailer

  if (!isClass8Semi) {
    // Single unit / box truck (2 or 3 axles)
    const tareSteer = input.tareSteerLbs ?? 8000;
    const tareDrive = input.tareDriveLbs ?? 9000;
    const cogRatio = Math.max(0, Math.min(1, cogFt / (equipLenFt || 24)));

    const driveCargoLbs = cargoWeightLbs * cogRatio;
    const steerCargoLbs = cargoWeightLbs * (1 - cogRatio);

    const actualSteer = Math.round(tareSteer + steerCargoLbs);
    const actualDrive = Math.round(tareDrive + driveCargoLbs);
    const totalGvw = actualSteer + actualDrive;

    const steerAllowed = 20000;
    const driveAllowed = 20000; // Single rear axle or 34,000 for tandem
    const gvwCap = 33000; // Standard Class 7/8 straight truck

    const steerGroup: AxleGroup = {
      id: 'steer',
      name: 'Steer Axle (1 axle)',
      axleCount: 1,
      spacingFt: 0,
      actualWeightLbs: actualSteer,
      statutoryCapLbs: steerAllowed,
      bridgeFormulaAllowedLbs: steerAllowed,
      maxLegalWeightLbs: steerAllowed,
      compliant: actualSteer <= steerAllowed,
      marginLbs: steerAllowed - actualSteer,
      utilizationPct: Math.round((actualSteer / steerAllowed) * 100),
    };

    const driveGroup: AxleGroup = {
      id: 'drive',
      name: 'Drive Axle (Single)',
      axleCount: 1,
      spacingFt: 0,
      actualWeightLbs: actualDrive,
      statutoryCapLbs: driveAllowed,
      bridgeFormulaAllowedLbs: driveAllowed,
      maxLegalWeightLbs: driveAllowed,
      compliant: actualDrive <= driveAllowed,
      marginLbs: driveAllowed - actualDrive,
      utilizationPct: Math.round((actualDrive / driveAllowed) * 100),
    };

    const reasons: string[] = [];
    if (!steerGroup.compliant) reasons.push(`Steer axle overloaded by ${Math.abs(steerGroup.marginLbs).toLocaleString()} lbs.`);
    if (!driveGroup.compliant) reasons.push(`Drive axle overloaded by ${Math.abs(driveGroup.marginLbs).toLocaleString()} lbs.`);
    if (totalGvw > gvwCap) reasons.push(`Gross Vehicle Weight (${totalGvw.toLocaleString()} lbs) exceeds maximum allowable ${gvwCap.toLocaleString()} lbs.`);

    return {
      overallGvwLbs: totalGvw,
      maxLegalGvwLbs: gvwCap,
      gvwCompliant: totalGvw <= gvwCap,
      gvwMarginLbs: gvwCap - totalGvw,
      groups: [steerGroup, driveGroup],
      allCompliant: steerGroup.compliant && driveGroup.compliant && totalGvw <= gvwCap,
      kpraFt: null,
      kpraCompliant: true,
      kpraMaxFt: 40,
      reasons,
    };
  }

  // 5-Axle Tractor-Semitrailer (1 Steer, 2 Drive, 2 Trailer Tandem)
  const tareSteer = input.tareSteerLbs ?? 10500;
  const tareDrive = input.tareDriveLbs ?? 14000;
  const tareTrailer = input.tareTrailerLbs ?? 10500;

  // Default geometry for 53ft trailer
  const trailerWheelbaseFt = (input.trailerWheelbaseIn ?? 456) / 12; // 38 ft (kingpin to tandem center)
  const driveTandemSpacingFt = 4.33; // 52 inches
  const trailerTandemSpacingFt = 4.08; // 49 inches
  const innerBridgeSpacingFt = 36.0; // drive center to trailer tandem center
  const outerBridgeSpacingFt = 51.0; // steer axle to rearmost trailer axle

  // Kingpin reaction & Trailer tandem reaction (Statics beam equilibrium)
  const trailerCogFt = Math.max(0, Math.min(trailerWheelbaseFt, cogFt));
  const trailerTandemCargoLbs = cargoWeightLbs * (trailerCogFt / trailerWheelbaseFt);
  const kingpinCargoLbs = cargoWeightLbs * ((trailerWheelbaseFt - trailerCogFt) / trailerWheelbaseFt);

  // Kingpin transfers to tractor steer & drive (assume fifth wheel centered over drive tandem)
  const driveCargoLbs = kingpinCargoLbs * 0.95;
  const steerCargoLbs = kingpinCargoLbs * 0.05;

  const actualSteer = Math.round(tareSteer + steerCargoLbs);
  const actualDrive = Math.round(tareDrive + driveCargoLbs);
  const actualTrailer = Math.round(tareTrailer + trailerTandemCargoLbs);
  const totalGvw = actualSteer + actualDrive + actualTrailer;

  // Bridge Formula calculations
  // 1. Steer (1 axle)
  const steerStatutoryCap = 20000; // Tire cap usually 12,000-13,200, federal highway cap 20,000
  const steerGroup: AxleGroup = {
    id: 'steer',
    name: 'Steering Axle (Single)',
    axleCount: 1,
    spacingFt: 0,
    actualWeightLbs: actualSteer,
    statutoryCapLbs: 12500, // Practical fleet tire rating limit
    bridgeFormulaAllowedLbs: steerStatutoryCap,
    maxLegalWeightLbs: 12500,
    compliant: actualSteer <= 12500,
    marginLbs: 12500 - actualSteer,
    utilizationPct: Math.round((actualSteer / 12500) * 100),
  };

  // 2. Drive Tandem (2 axles, L = 4.33 ft)
  const driveBridge = calculateBridgeFormulaWeight(driveTandemSpacingFt, 2);
  const driveCap = 34000;
  const driveMax = Math.min(driveCap, driveBridge);
  const driveGroup: AxleGroup = {
    id: 'drive_tandem',
    name: 'Tractor Drive Tandem (2 axles)',
    axleCount: 2,
    spacingFt: driveTandemSpacingFt,
    actualWeightLbs: actualDrive,
    statutoryCapLbs: driveCap,
    bridgeFormulaAllowedLbs: driveBridge,
    maxLegalWeightLbs: driveMax,
    compliant: actualDrive <= driveMax,
    marginLbs: driveMax - actualDrive,
    utilizationPct: Math.round((actualDrive / driveMax) * 100),
  };

  // 3. Trailer Tandem (2 axles, L = 4.08 ft)
  const trailerBridge = calculateBridgeFormulaWeight(trailerTandemSpacingFt, 2);
  const trailerCap = 34000;
  const trailerMax = Math.min(trailerCap, trailerBridge);
  const trailerGroup: AxleGroup = {
    id: 'trailer_tandem',
    name: 'Trailer Tandem (2 axles)',
    axleCount: 2,
    spacingFt: trailerTandemSpacingFt,
    actualWeightLbs: actualTrailer,
    statutoryCapLbs: trailerCap,
    bridgeFormulaAllowedLbs: trailerBridge,
    maxLegalWeightLbs: trailerMax,
    compliant: actualTrailer <= trailerMax,
    marginLbs: trailerMax - actualTrailer,
    utilizationPct: Math.round((actualTrailer / trailerMax) * 100),
  };

  // 4. Inner Bridge (Drive Tandem to Trailer Tandem, 4 axles, L = 36 ft)
  const innerBridgeWeight = actualDrive + actualTrailer;
  const innerBridgeAllowed = calculateBridgeFormulaWeight(innerBridgeSpacingFt, 4);
  const innerBridgeMax = Math.min(68000, innerBridgeAllowed);
  const innerBridgeGroup: AxleGroup = {
    id: 'inner_bridge',
    name: 'Inner Bridge (Drive to Trailer, 4 axles)',
    axleCount: 4,
    spacingFt: innerBridgeSpacingFt,
    actualWeightLbs: innerBridgeWeight,
    statutoryCapLbs: 68000,
    bridgeFormulaAllowedLbs: innerBridgeAllowed,
    maxLegalWeightLbs: innerBridgeMax,
    compliant: innerBridgeWeight <= innerBridgeMax,
    marginLbs: innerBridgeMax - innerBridgeWeight,
    utilizationPct: Math.round((innerBridgeWeight / innerBridgeMax) * 100),
  };

  // 5. Outer Bridge (Steer to Trailer Tandem, 5 axles, L = 51 ft)
  const outerBridgeAllowed = calculateBridgeFormulaWeight(outerBridgeSpacingFt, 5);
  const outerBridgeMax = Math.min(80000, outerBridgeAllowed);
  const outerBridgeGroup: AxleGroup = {
    id: 'outer_bridge',
    name: 'Outer Bridge (Steer to Rear, 5 axles)',
    axleCount: 5,
    spacingFt: outerBridgeSpacingFt,
    actualWeightLbs: totalGvw,
    statutoryCapLbs: 80000,
    bridgeFormulaAllowedLbs: outerBridgeAllowed,
    maxLegalWeightLbs: outerBridgeMax,
    compliant: totalGvw <= outerBridgeMax,
    marginLbs: outerBridgeMax - totalGvw,
    utilizationPct: Math.round((totalGvw / outerBridgeMax) * 100),
  };

  // California STAA 40ft Rule (Kingpin to center of rearmost axle)
  const kpraFt = (input.kpraIn ? input.kpraIn / 12 : 39.5); // standard setting
  const kpraMaxFt = 40.0;
  const kpraCompliant = kpraFt <= kpraMaxFt;

  const groups = [steerGroup, driveGroup, trailerGroup, innerBridgeGroup, outerBridgeGroup];
  const allGroupsCompliant = groups.every((g) => g.compliant);
  const gvwCompliant = totalGvw <= 80000;

  const reasons: string[] = [];
  if (!steerGroup.compliant) reasons.push(`Steer axle overloaded: ${actualSteer.toLocaleString()} lbs exceeds ${steerGroup.maxLegalWeightLbs.toLocaleString()} lbs limit.`);
  if (!driveGroup.compliant) reasons.push(`Drive tandem overloaded: ${actualDrive.toLocaleString()} lbs exceeds statutory 34,000 lbs limit.`);
  if (!trailerGroup.compliant) reasons.push(`Trailer tandem overloaded: ${actualTrailer.toLocaleString()} lbs exceeds statutory 34,000 lbs limit.`);
  if (!innerBridgeGroup.compliant) reasons.push(`Inner bridge group violation: ${innerBridgeWeight.toLocaleString()} lbs exceeds Bridge Formula B limit (${innerBridgeMax.toLocaleString()} lbs for 4 axles at ${innerBridgeSpacingFt}ft).`);
  if (!outerBridgeGroup.compliant || !gvwCompliant) reasons.push(`Gross Vehicle Weight violation: ${totalGvw.toLocaleString()} lbs exceeds statutory 80,000 lbs federal cap.`);
  if (!kpraCompliant) reasons.push(`California STAA Kingpin-to-Rear-Axle (KPRA) violation: ${kpraFt.toFixed(1)} ft exceeds 40.0 ft legal maximum.`);

  return {
    overallGvwLbs: totalGvw,
    maxLegalGvwLbs: 80000,
    gvwCompliant,
    gvwMarginLbs: 80000 - totalGvw,
    groups,
    allCompliant: allGroupsCompliant && gvwCompliant && kpraCompliant,
    kpraFt,
    kpraCompliant,
    kpraMaxFt,
    reasons,
  };
}
