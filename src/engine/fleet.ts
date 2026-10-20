/**
 * Multi-Vehicle Fleet Splitter & Allocation Engine.
 * When cargo exceeds a single trailer (or for multi-load distribution),
 * this module partitions units across an optimal combination of vehicles.
 */
import { normalizeEquipment } from './normalize';
import { solve } from './solver';
import { validatePlacements } from './validator';
import { computeMetrics } from './analyze';
import type {
  Arrangement,
  EquipmentProfile,
  Metrics,
  NormalizedEquipment,
  Placement,
  Settings,
  Unit,
  Violation,
} from './types';

export interface FleetVehicleAllocation {
  vehicleId: string;
  vehicleName: string;
  count: number;
  assignedUnitIds: string[];
  totalVolumeM3: number;
  totalWeightKg: number;
  volumeCapacityM3: number;
  payloadCapacityKg: number | null;
  volumeUtilizationPct: number;
  payloadUtilizationPct: number | null;
  estimatedCost: number | null;
  currency: string;
}

export interface FleetPlan {
  totalUnits: number;
  totalVolumeM3: number;
  totalWeightKg: number;
  allocations: FleetVehicleAllocation[];
  totalVehicles: number;
  totalCost: number | null;
  currency: string;
  summary: string;
}

const vol = (u: Unit) => (u.dims[0] * u.dims[1] * u.dims[2]) / 1e9;

/**
 * Recommends an optimal fleet combination to accommodate all units.
 */
export function recommendFleet(units: Unit[], profiles: EquipmentProfile[]): FleetPlan {
  const activeProfiles = profiles.filter((p) => p.included);
  const normalizedMap = new Map<string, NormalizedEquipment>();
  for (const p of activeProfiles) {
    const norm = normalizeEquipment(p);
    if (norm) normalizedMap.set(p.id, norm);
  }

  const validProfiles = activeProfiles.filter((p) => normalizedMap.has(p.id));
  const totalVolumeM3 = units.reduce((s, u) => s + vol(u), 0);
  const totalWeightKg = units.reduce((s, u) => s + (u.weightKg ?? 0), 0);

  if (validProfiles.length === 0 || units.length === 0) {
    return {
      totalUnits: units.length,
      totalVolumeM3,
      totalWeightKg,
      allocations: [],
      totalVehicles: 0,
      totalCost: null,
      currency: 'USD',
      summary: 'No active equipment profiles or cargo available for fleet allocation.',
    };
  }

  // Rank profiles by volume capacity descending
  const sortedProfiles = validProfiles.slice().sort((a, b) => {
    const eqA = normalizedMap.get(a.id)!;
    const eqB = normalizedMap.get(b.id)!;
    const vA = (eqA.L * eqA.W * eqA.H) / 1e9;
    const vB = (eqB.L * eqB.W * eqB.H) / 1e9;
    return vB - vA;
  });

  // Sort units descending by volume for First-Fit Decreasing
  const sortedUnits = units.slice().sort((a, b) => vol(b) - vol(a));

  // Primary strategy: Fill largest vehicle first, then right-size the remainder
  interface VehicleBin {
    profile: EquipmentProfile;
    norm: NormalizedEquipment;
    unitIds: string[];
    usedVol: number;
    usedWeight: number;
    maxVol: number;
    maxWeight: number | null;
  }

  const bins: VehicleBin[] = [];

  const canFit = (bin: VehicleBin, u: Unit): boolean => {
    const uV = vol(u);
    // Allow up to 88% packing efficiency factor for realistic volume packing
    if (bin.usedVol + uV > bin.maxVol * 0.88) return false;
    if (bin.maxWeight !== null && u.weightKg !== null && bin.usedWeight + u.weightKg > bin.maxWeight) return false;
    return true;
  };

  const createBin = (p: EquipmentProfile): VehicleBin => {
    const norm = normalizedMap.get(p.id)!;
    return {
      profile: p,
      norm,
      unitIds: [],
      usedVol: 0,
      usedWeight: 0,
      maxVol: (norm.L * norm.W * norm.H) / 1e9,
      maxWeight: norm.payloadKg,
    };
  };

  for (const u of sortedUnits) {
    let placed = false;
    for (const b of bins) {
      if (canFit(b, u)) {
        b.unitIds.push(u.id);
        b.usedVol += vol(u);
        b.usedWeight += u.weightKg ?? 0;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Pick best fitting vehicle for remaining units
      const bestP = sortedProfiles.find((p) => {
        const testBin = createBin(p);
        return canFit(testBin, u);
      }) ?? sortedProfiles[0];

      const newBin = createBin(bestP);
      newBin.unitIds.push(u.id);
      newBin.usedVol += vol(u);
      newBin.usedWeight += u.weightKg ?? 0;
      bins.push(newBin);
    }
  }

  // Aggregate by profile
  const allocMap = new Map<string, FleetVehicleAllocation>();
  let totalCost: number | null = 0;
  const currency = validProfiles[0]?.currency || 'USD';

  for (const b of bins) {
    const cur = allocMap.get(b.profile.id);
    const estCost = b.profile.cost ?? null;
    if (estCost !== null && totalCost !== null) totalCost += estCost;
    else totalCost = null;

    if (!cur) {
      allocMap.set(b.profile.id, {
        vehicleId: b.profile.id,
        vehicleName: b.profile.name,
        count: 1,
        assignedUnitIds: [...b.unitIds],
        totalVolumeM3: b.usedVol,
        totalWeightKg: b.usedWeight,
        volumeCapacityM3: b.maxVol,
        payloadCapacityKg: b.maxWeight,
        volumeUtilizationPct: Math.round((b.usedVol / b.maxVol) * 100),
        payloadUtilizationPct: b.maxWeight ? Math.round((b.usedWeight / b.maxWeight) * 100) : null,
        estimatedCost: estCost,
        currency: b.profile.currency || 'USD',
      });
    } else {
      cur.count += 1;
      cur.assignedUnitIds.push(...b.unitIds);
      cur.totalVolumeM3 += b.usedVol;
      cur.totalWeightKg += b.usedWeight;
      cur.volumeCapacityM3 += b.maxVol;
      if (cur.payloadCapacityKg !== null && b.maxWeight !== null) cur.payloadCapacityKg += b.maxWeight;
      cur.volumeUtilizationPct = Math.round((cur.totalVolumeM3 / cur.volumeCapacityM3) * 100);
      cur.payloadUtilizationPct = cur.payloadCapacityKg ? Math.round((cur.totalWeightKg / cur.payloadCapacityKg) * 100) : null;
      if (cur.estimatedCost !== null && estCost !== null) cur.estimatedCost += estCost;
    }
  }

  const allocations = Array.from(allocMap.values());
  const totalVehicles = allocations.reduce((s, a) => s + a.count, 0);
  const fleetSummaryParts = allocations.map((a) => `${a.count}× ${a.vehicleName} (${a.assignedUnitIds.length} units)`);

  return {
    totalUnits: units.length,
    totalVolumeM3,
    totalWeightKg,
    allocations,
    totalVehicles,
    totalCost,
    currency,
    summary: `Recommended Fleet: ${fleetSummaryParts.join(' + ')}. Total ${totalVehicles} vehicle(s).`,
  };
}

export interface VehicleLoadPlan {
  vehicleIndex: number;
  vehicleId: string;
  vehicleName: string;
  profile: EquipmentProfile;
  norm: NormalizedEquipment;
  assignedUnits: Unit[];
  arrangement: Arrangement | null;
  metrics: Metrics | null;
  violations: Violation[];
  stagingBay: string;
  estimatedCost: number | null;
}

export interface FleetSolveResult {
  totalUnits: number;
  totalPlacedUnits: number;
  unplacedUnits: Unit[];
  plans: VehicleLoadPlan[];
  totalVehicles: number;
  totalCost: number | null;
  currency: string;
  summary: string;
}

/**
 * Solves individual 3D loading plans for every vehicle in the recommended fleet.
 */
export function solveFleet(
  units: Unit[],
  profiles: EquipmentProfile[],
  settings: Settings,
): FleetSolveResult {
  const activeProfiles = profiles.filter((p) => p.included);
  const normalizedMap = new Map<string, NormalizedEquipment>();
  for (const p of activeProfiles) {
    const norm = normalizeEquipment(p);
    if (norm) normalizedMap.set(p.id, norm);
  }

  const validProfiles = activeProfiles.filter((p) => normalizedMap.has(p.id));
  if (validProfiles.length === 0 || units.length === 0) {
    return {
      totalUnits: units.length,
      totalPlacedUnits: 0,
      unplacedUnits: units,
      plans: [],
      totalVehicles: 0,
      totalCost: null,
      currency: 'USD',
      summary: 'No valid equipment profiles or cargo units to plan.',
    };
  }

  // Pre-sort units for LIFO drop sequence: higher stops load first at the nose/front wall,
  // lower stops (earlier drops) load last at the rear doors for unblocked egress.
  const sortedUnits = units.slice().sort((a, b) => {
    const stopA = a.stop ?? 1;
    const stopB = b.stop ?? 1;
    if (stopA !== stopB) return stopB - stopA;
    return vol(b) - vol(a);
  });

  const sortedProfiles = validProfiles.slice().sort((a, b) => {
    const eqA = normalizedMap.get(a.id)!;
    const eqB = normalizedMap.get(b.id)!;
    return (eqB.L * eqB.W * eqB.H) - (eqA.L * eqA.W * eqA.H);
  });

  interface VehicleBin {
    profile: EquipmentProfile;
    norm: NormalizedEquipment;
    units: Unit[];
    usedVol: number;
    usedWeight: number;
    maxVol: number;
    maxWeight: number | null;
  }

  const bins: VehicleBin[] = [];

  const canFit = (bin: VehicleBin, u: Unit): boolean => {
    const uV = vol(u);
    if (bin.usedVol + uV > bin.maxVol * 0.88) return false;
    if (bin.maxWeight !== null && u.weightKg !== null && bin.usedWeight + u.weightKg > bin.maxWeight) return false;
    return true;
  };

  const createBin = (p: EquipmentProfile): VehicleBin => {
    const norm = normalizedMap.get(p.id)!;
    return {
      profile: p,
      norm,
      units: [],
      usedVol: 0,
      usedWeight: 0,
      maxVol: (norm.L * norm.W * norm.H) / 1e9,
      maxWeight: norm.payloadKg,
    };
  };

  for (const u of sortedUnits) {
    let placedInBin = false;
    for (const b of bins) {
      if (canFit(b, u)) {
        b.units.push(u);
        b.usedVol += vol(u);
        b.usedWeight += u.weightKg ?? 0;
        placedInBin = true;
        break;
      }
    }
    if (!placedInBin) {
      const bestP = sortedProfiles.find((p) => canFit(createBin(p), u)) ?? sortedProfiles[0];
      const newBin = createBin(bestP);
      newBin.units.push(u);
      newBin.usedVol += vol(u);
      newBin.usedWeight += u.weightKg ?? 0;
      bins.push(newBin);
    }
  }

  // Solve discrete 3D arrangement for each vehicle bin
  const plans: VehicleLoadPlan[] = [];
  let totalCost: number | null = 0;
  let totalPlacedUnits = 0;
  const unplacedUnits: Unit[] = [];

  bins.forEach((bin, idx) => {
    const estCost = bin.profile.cost ?? null;
    if (estCost !== null && totalCost !== null) totalCost += estCost;
    else totalCost = null;

    // Run solver on this bin's assigned units
    const solveOut = solve(bin.units, bin.norm, settings, { quick: true });
    const bestArr = solveOut.arrangements[0] || null;

    let metrics: Metrics | null = null;
    let violations: Violation[] = [];

    if (bestArr) {
      violations = validatePlacements(bin.units, bin.norm, bestArr.placements, settings);
      metrics = computeMetrics(bin.units, bin.norm, bestArr.placements);
      totalPlacedUnits += bestArr.placements.length;

      // Identify any units in this bin that could not be placed
      const placedIds = new Set(bestArr.placements.map((p: Placement) => p.unitId));
      for (const u of bin.units) {
        if (!placedIds.has(u.id)) unplacedUnits.push(u);
      }
    } else {
      unplacedUnits.push(...bin.units);
    }

    const bayLetter = String.fromCharCode(65 + (idx % 4));
    const bayNumber = String(idx + 1).padStart(2, '0');
    const stagingBay = `Dock ${bayLetter} · Bay ${bayNumber} (${idx % 2 === 0 ? 'North Staging' : 'South Cross-Dock'})`;

    plans.push({
      vehicleIndex: idx + 1,
      vehicleId: bin.profile.id,
      vehicleName: bin.profile.name,
      profile: bin.profile,
      norm: bin.norm,
      assignedUnits: bin.units,
      arrangement: bestArr,
      metrics,
      violations,
      stagingBay,
      estimatedCost: estCost,
    });
  });

  const currency = validProfiles[0]?.currency || 'USD';
  const summary = `Allocated ${totalPlacedUnits} / ${units.length} units across ${plans.length} vehicle(s).`;

  return {
    totalUnits: units.length,
    totalPlacedUnits,
    unplacedUnits,
    plans,
    totalVehicles: plans.length,
    totalCost,
    currency,
    summary,
  };
}
