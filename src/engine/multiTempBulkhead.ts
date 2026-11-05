/**
 * 53-ft Multi-Temperature Compartment Bulkhead Engine & Thermal Load Balancer
 *
 * Simulates moveable insulated bulkheads (R-14 composite foam, 3-inch thickness)
 * partitioning a refrigerated trailer into multi-temperature zones (Frozen, Chilled, Ambient).
 * Validates volume capacity, pallet footprints, thermal leakage, and cargo temperature compliance.
 */

export type TempClassification = 'frozen' | 'chilled' | 'ambient';

export interface TempZoneConfig {
  id: string;
  name: string;
  classification: TempClassification;
  targetTempF: number;
  /** Acceptable temperature range [minF, maxF] */
  rangeF: [number, number];
  /** Longitudinal start from trailer nose (inches) */
  startIn: number;
  /** Longitudinal end from trailer nose (inches) */
  endIn: number;
}

export interface BulkheadWall {
  id: string;
  /** Longitudinal distance from trailer front/nose in inches */
  positionIn: number;
  thicknessIn: number;
  /** R-value thermal insulation rating */
  rValue: number;
  /** Ceiling track locking pin hole (e.g. 1 to 50) */
  trackPinHole: number;
}

export interface ZoneCapacityMetrics {
  zoneId: string;
  name: string;
  classification: TempClassification;
  targetTempF: number;
  lengthIn: number;
  usableCuFt: number;
  estimatedGmaPalletCapacity: number;
  /** Estimated steady-state heat leak rate in BTU/hr at ambient external temp */
  heatLeakBtuHr: number;
}

export interface PerishableCargoItem {
  id: string;
  description: string;
  qty: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLb: number;
  requiredTempClass: TempClassification;
  /** Assigned zone ID */
  assignedZoneId?: string;
}

export interface MultiTempValidationViolation {
  code: 'TEMP_MISMATCH' | 'VOLUME_OVERFLOW' | 'PALLET_OVERFLOW' | 'UNINSULATED_LEAK' | 'INVALID_BULKHEAD_SPACING';
  message: string;
  severity: 'CRITICAL_OOS' | 'WARNING';
  affectedItemIds?: string[];
  affectedZoneId?: string;
}

export interface MultiTempPlanResult {
  valid: boolean;
  trailerInternalLengthIn: number;
  trailerInternalWidthIn: number;
  trailerInternalHeightIn: number;
  ambientExternalTempF: number;
  bulkheads: BulkheadWall[];
  zones: ZoneCapacityMetrics[];
  totalVolumeCuFt: number;
  usedVolumeCuFt: number;
  overallVolumeUtilizationPct: number;
  totalHeatLoadBtuHr: number;
  violations: MultiTempValidationViolation[];
  recommendations: string[];
}

/** Standard 53ft Reefer internal dimensions (inches) */
export const STANDARD_53FT_REEFER = {
  lengthIn: 630, // 52.5 ft internal
  widthIn: 98,   // 8.16 ft internal
  heightIn: 102, // 8.5 ft internal
  totalCuFt: Math.round((630 * 98 * 102) / 1728), // ~3,640 cu ft
  wallUFactor: 0.045, // BTU / (hr * sq ft * °F) for high-spec polyurethane foam walls
  bulkheadThicknessIn: 3,
  bulkheadRValue: 14,
};

/**
 * Automatically infers temperature classification from description if not explicitly set.
 */
export function inferTemperatureClassification(description: string): TempClassification {
  const desc = description.toLowerCase();
  if (
    desc.includes('ice cream') ||
    desc.includes('frozen') ||
    desc.includes('popsicle') ||
    desc.includes('deep freeze') ||
    desc.includes('cryo')
  ) {
    return 'frozen';
  }
  if (
    desc.includes('milk') ||
    desc.includes('dairy') ||
    desc.includes('cheese') ||
    desc.includes('butter') ||
    desc.includes('produce') ||
    desc.includes('lettuce') ||
    desc.includes('berry') ||
    desc.includes('berries') ||
    desc.includes('strawberr') ||
    desc.includes('fruit') ||
    desc.includes('meat') ||
    desc.includes('poultry') ||
    desc.includes('chilled') ||
    desc.includes('refrigerated') ||
    desc.includes('salad') ||
    desc.includes('vaccine')
  ) {
    return 'chilled';
  }
  return 'ambient';
}

/**
 * Computes multi-temperature zone partition and validates thermal/volumetric cargo assignment.
 *
 * @param bulkheadPositionsIn Array of longitudinal positions (in inches from nose) for each moveable bulkhead.
 * @param zoneClasses Desired temperature classification for each resulting zone (length = bulkheadPositionsIn.length + 1).
 * @param cargoItems Manifest cargo items requiring transport.
 * @param ambientExternalTempF Outside ambient weather temperature (default: 85°F summer heat).
 */
export function calculateMultiTempBulkheads(
  bulkheadPositionsIn: number[],
  zoneClasses: TempClassification[],
  cargoItems: PerishableCargoItem[],
  ambientExternalTempF: number = 85
): MultiTempPlanResult {
  const trailer = STANDARD_53FT_REEFER;
  const violations: MultiTempValidationViolation[] = [];
  const recommendations: string[] = [];

  // Sort bulkhead positions
  const sortedBulkheads = [...bulkheadPositionsIn].sort((a, b) => a - b);

  // Validate bulkhead spacing and trailer boundaries
  for (let i = 0; i < sortedBulkheads.length; i++) {
    const pos = sortedBulkheads[i];
    if (pos <= 48) {
      violations.push({
        code: 'INVALID_BULKHEAD_SPACING',
        message: `Bulkhead ${i + 1} position (${pos}") is too close to nose; minimum clearance is 48" for primary evaporator airflow.`,
        severity: 'CRITICAL_OOS',
      });
    }
    if (pos >= trailer.lengthIn - 48) {
      violations.push({
        code: 'INVALID_BULKHEAD_SPACING',
        message: `Bulkhead ${i + 1} position (${pos}") is too close to rear door; minimum clearance is 48" for rear door swing and loading.`,
        severity: 'CRITICAL_OOS',
      });
    }
    if (i > 0 && pos - sortedBulkheads[i - 1] < 48) {
      violations.push({
        code: 'INVALID_BULKHEAD_SPACING',
        message: `Bulkheads ${i} and ${i + 1} are spaced only ${pos - sortedBulkheads[i - 1]}" apart; minimum zone length is 48" (one pallet length).`,
        severity: 'CRITICAL_OOS',
      });
    }
  }

  // Construct bulkhead wall models
  const bulkheads: BulkheadWall[] = sortedBulkheads.map((pos, idx) => ({
    id: `BH-${idx + 1}`,
    positionIn: pos,
    thicknessIn: trailer.bulkheadThicknessIn,
    rValue: trailer.bulkheadRValue,
    trackPinHole: Math.round(pos / 12), // 12-inch ceiling track intervals
  }));

  // Construct zones
  const zones: ZoneCapacityMetrics[] = [];
  let currentStartIn = 0;

  for (let z = 0; z <= sortedBulkheads.length; z++) {
    const endIn = z < sortedBulkheads.length ? sortedBulkheads[z] : trailer.lengthIn;
    const classification = zoneClasses[z] || 'chilled';
    const lengthIn = Math.max(0, endIn - currentStartIn - (z < sortedBulkheads.length ? trailer.bulkheadThicknessIn : 0));

    let targetTempF = 34;
    let name = `Zone ${z + 1}: Chilled`;
    if (classification === 'frozen') {
      targetTempF = -10;
      name = `Zone ${z + 1}: Deep Frozen (-10°F)`;
    } else if (classification === 'ambient') {
      targetTempF = 65;
      name = `Zone ${z + 1}: Controlled Ambient (65°F)`;
    }

    const usableCuFt = Math.round((lengthIn * trailer.widthIn * trailer.heightIn) / 1728);
    // Standard 40x48 GMA pallets turned side-by-side in 98" interior (2 wide)
    const estimatedGmaPalletCapacity = Math.floor(lengthIn / 48) * 2;

    // Heat leak calculation: surface area of zone walls, floor, roof
    const perimeterFt = 2 * (trailer.widthIn / 12) + 2 * (trailer.heightIn / 12);
    const wallAreaSqFt = perimeterFt * (lengthIn / 12);
    const deltaT = Math.max(0, ambientExternalTempF - targetTempF);
    const heatLeakBtuHr = Math.round(wallAreaSqFt * trailer.wallUFactor * deltaT);

    zones.push({
      zoneId: `ZONE-${z + 1}`,
      name,
      classification,
      targetTempF,
      lengthIn,
      usableCuFt,
      estimatedGmaPalletCapacity,
      heatLeakBtuHr,
    });

    currentStartIn = endIn;
  }

  // Verify cargo allocations
  let usedVolumeCuFt = 0;
  const zoneCargoMap: Record<string, PerishableCargoItem[]> = {};
  for (const z of zones) {
    zoneCargoMap[z.zoneId] = [];
  }

  for (const item of cargoItems) {
    const itemCuFt = (item.lengthIn * item.widthIn * item.heightIn * item.qty) / 1728;
    usedVolumeCuFt += itemCuFt;

    // Resolve assigned zone: explicit or auto-assign to matching temperature classification
    let targetZone = zones.find((z) => z.zoneId === item.assignedZoneId);
    if (!targetZone) {
      targetZone = zones.find((z) => z.classification === item.requiredTempClass);
    }

    if (!targetZone) {
      violations.push({
        code: 'TEMP_MISMATCH',
        message: `Cargo item "${item.description}" requires [${item.requiredTempClass.toUpperCase()}] temperature, but no matching zone is configured in the reefer.`,
        severity: 'CRITICAL_OOS',
        affectedItemIds: [item.id],
      });
      continue;
    }

    // Check classification compatibility
    if (targetZone.classification !== item.requiredTempClass) {
      violations.push({
        code: 'TEMP_MISMATCH',
        message: `Thermal Violation: "${item.description}" (${item.requiredTempClass.toUpperCase()}) is placed in ${targetZone.name} (${targetZone.classification.toUpperCase()}). High spoilage risk!`,
        severity: 'CRITICAL_OOS',
        affectedItemIds: [item.id],
        affectedZoneId: targetZone.zoneId,
      });
    }

    zoneCargoMap[targetZone.zoneId].push(item);
  }

  // Check volumetric and pallet overflow per zone
  for (const z of zones) {
    const assignedItems = zoneCargoMap[z.zoneId] || [];
    const zoneCargoVolCuFt = assignedItems.reduce(
      (acc, item) => acc + (item.lengthIn * item.widthIn * item.heightIn * item.qty) / 1728,
      0
    );
    const totalPallets = assignedItems.reduce((acc, item) => acc + item.qty, 0);

    if (zoneCargoVolCuFt > z.usableCuFt * 0.95) {
      violations.push({
        code: 'VOLUME_OVERFLOW',
        message: `${z.name} cargo volume (${Math.round(zoneCargoVolCuFt)} cu ft) exceeds 95% ceiling capacity (${z.usableCuFt} cu ft). Restricted ceiling airflow will cause hotspots!`,
        severity: 'WARNING',
        affectedZoneId: z.zoneId,
      });
    }

    if (totalPallets > z.estimatedGmaPalletCapacity) {
      violations.push({
        code: 'PALLET_OVERFLOW',
        message: `${z.name} floor footprint required (${totalPallets} pallets) exceeds rated floor capacity (${z.estimatedGmaPalletCapacity} pallets).`,
        severity: 'CRITICAL_OOS',
        affectedZoneId: z.zoneId,
      });
    }
  }

  const totalHeatLoadBtuHr = zones.reduce((sum, z) => sum + z.heatLeakBtuHr, 0);
  const overallVolumeUtilizationPct = Math.round((usedVolumeCuFt / trailer.totalCuFt) * 100);

  // Recommendations
  if (zones.some((z) => z.classification === 'frozen') && sortedBulkheads.length > 0) {
    recommendations.push(
      'Place Frozen Zone at Zone 1 (Nose) directly under primary high-capacity evaporator; place Chilled or Ambient in rear zones with secondary ceiling fans.'
    );
  }
  if (ambientExternalTempF >= 90) {
    recommendations.push(
      `Extreme ambient heat (${ambientExternalTempF}°F): Total heat infiltration is ${totalHeatLoadBtuHr.toLocaleString()} BTU/hr. Pre-cool trailer to target temperature for 60 minutes before loading.`
    );
  }
  if (violations.length === 0) {
    recommendations.push(
      'Multi-temperature compartment layout satisfies FSMA Sanitary Transportation of Food Rule (21 CFR Part 1 Subpart O).'
    );
  }

  return {
    valid: violations.filter((v) => v.severity === 'CRITICAL_OOS').length === 0,
    trailerInternalLengthIn: trailer.lengthIn,
    trailerInternalWidthIn: trailer.widthIn,
    trailerInternalHeightIn: trailer.heightIn,
    ambientExternalTempF,
    bulkheads,
    zones,
    totalVolumeCuFt: trailer.totalCuFt,
    usedVolumeCuFt: Math.round(usedVolumeCuFt),
    overallVolumeUtilizationPct,
    totalHeatLoadBtuHr,
    violations,
    recommendations,
  };
}
