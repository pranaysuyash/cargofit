import { solve, orientationsFor, usableOrientations } from './solver';
import { EPS, validatePlacements } from './validator';
import {
  SOLVER_VERSION,
  type Arrangement, type EquipmentResult, type Metrics, type ModeledCheck, type MultiStopStage, type NormalizedEquipment,
  type Placement, type Reason, type Settings, type Unit,
} from './types';

export function computeMetrics(units: Unit[], eq: NormalizedEquipment, placements: Placement[]): Metrics {
  const byId = new Map(units.map((u) => [u.id, u]));
  let vol = 0;
  let weight = 0;
  let momentX = 0;
  let momentY = 0;
  let momentZ = 0;
  let extent = 0;
  for (const p of placements) {
    vol += p.dx * p.dy * p.dz;
    const w = byId.get(p.unitId)?.weightKg ?? 0;
    weight += w;
    momentX += w * (p.x + p.dx / 2);
    momentY += w * (p.y + p.dy / 2);
    momentZ += w * (p.z + p.dz / 2);
    extent = Math.max(extent, p.x + p.dx);
  }
  const placedIds = new Set(placements.map((p) => p.unitId));
  const unknown = units.filter((u) => u.weightKg === null).length;
  const unknownPlaced = units.filter((u) => u.weightKg === null && placedIds.has(u.id)).length;
  const hasValidCoG = weight > 0 && unknownPlaced === 0;
  const cogX = hasValidCoG ? momentX / weight : null;
  const cogY = hasValidCoG ? momentY / weight : null;
  const cogZ = hasValidCoG ? momentZ / weight : null;
  const cogXPct = hasValidCoG && eq.L > 0 ? (100 * momentX) / weight / eq.L : null;

  let axleEst = null;
  if (hasValidCoG && cogX !== null && eq.L > 3000) {
    const xKp = 0.08 * eq.L;
    const xTb = 0.80 * eq.L;
    const span = Math.max(1, xTb - xKp);
    const fTandem = Math.max(0, Math.min(1, (cogX - xKp) / span));
    const fKp = 1 - fTandem;
    const trailerKg = Math.round(weight * fTandem);
    const steerKg = Math.round(weight * fKp * 0.20);
    const driveKg = Math.round(weight * fKp * 0.80);
    const steerLimit = 5443;
    const driveLimit = 15422;
    const tandemLimit = 15422;

    // US Federal Bridge Formula B (23 CFR § 658.17): W = 500 * (LN / (N - 1) + 12N + 36)
    // For 5-axle standard rig (N=5): W_lbs = 500 * (1.25 * L_ft + 96), capped at 80,000 lbs (36,287 kg)
    const lengthFt = eq.L / 304.8;
    const bridgeFormulaMaxLbs = Math.min(80000, 500 * (1.25 * lengthFt + 96));
    const bridgeFormulaLimitKg = Math.round(bridgeFormulaMaxLbs * 0.45359237);
    const bridgeFormulaCompliant = weight <= bridgeFormulaLimitKg && driveKg <= driveLimit && trailerKg <= tandemLimit && steerKg <= steerLimit;

    axleEst = {
      steerKg,
      driveKg,
      trailerKg,
      steerPct: Math.round((steerKg / steerLimit) * 100),
      drivePct: Math.round((driveKg / driveLimit) * 100),
      trailerPct: Math.round((trailerKg / tandemLimit) * 100),
      bridgeFormulaCompliant,
      bridgeFormulaLimitKg,
    };
  }

  return {
    totalUnits: units.length,
    placedUnits: placements.length,
    occupiedVolumePct: (100 * vol) / (eq.L * eq.W * eq.H),
    loadedWeightKg: weight,
    unknownWeightUnits: unknown,
    payloadKg: eq.payloadKg,
    payloadRemainingKg: eq.payloadKg === null ? null : eq.payloadKg - weight,
    usedLengthMm: extent,
    cogXPct,
    cogX,
    cogY,
    cogZ,
    axleEst,
  };
}

export function computeMultiStopStages(
  units: Unit[],
  eq: NormalizedEquipment,
  placements: Placement[],
): MultiStopStage[] {
  const stops = Array.from(new Set(units.map((u) => u.stop).filter((s): s is number => typeof s === 'number' && s > 0))).sort((a, b) => a - b);
  if (stops.length < 2) return [];

  const stages: MultiStopStage[] = [];
  const byId = new Map(units.map((u) => [u.id, u]));

  const fullMetrics = computeMetrics(units, eq, placements);
  stages.push({
    stage: 0,
    stop: 0,
    label: 'Depart Origin (Full Load)',
    remainingUnits: placements.length,
    remainingWeightKg: fullMetrics.loadedWeightKg,
    cogX: fullMetrics.cogX ?? null,
    cogXPct: fullMetrics.cogXPct ?? null,
    axleEst: fullMetrics.axleEst ?? null,
    warning: null,
  });

  for (let sIdx = 0; sIdx < stops.length; sIdx++) {
    const currentStop = stops[sIdx];
    const remainingPlacements = placements.filter((p) => {
      const u = byId.get(p.unitId);
      const st = u?.stop ?? p.stop ?? null;
      return st === null || st > currentStop;
    });

    const remMetrics = computeMetrics(units, eq, remainingPlacements);
    let warning: string | null = null;
    if (remMetrics.axleEst) {
      if (remMetrics.axleEst.drivePct > 100) {
        warning = `Drive tandem overloaded (${remMetrics.axleEst.drivePct}% rating) after Stop ${currentStop} drop.`;
      } else if (remMetrics.axleEst.steerPct > 100) {
        warning = `Steer axle overloaded (${remMetrics.axleEst.steerPct}% rating) after Stop ${currentStop} drop.`;
      } else if (remMetrics.cogXPct !== null && remMetrics.cogXPct < 40) {
        warning = `Forward weight bias (CoG at ${Math.round(remMetrics.cogXPct)}% L) after rear cargo drop.`;
      }
    }

    stages.push({
      stage: sIdx + 1,
      stop: currentStop,
      label: sIdx === stops.length - 1 ? 'Final Destination (Empty)' : `En route to Stop ${stops[sIdx + 1]} (Post-Stop ${currentStop} Drop)`,
      remainingUnits: remainingPlacements.length,
      remainingWeightKg: remMetrics.loadedWeightKg,
      cogX: remMetrics.cogX ?? null,
      cogXPct: remMetrics.cogXPct ?? null,
      axleEst: remMetrics.axleEst ?? null,
      warning,
    });
  }

  return stages;
}

export function buildChecks(
  eq: NormalizedEquipment, unknownWeights: number, validated: boolean,
): ModeledCheck[] {
  const geom = (id: string, label: string, note: string): ModeledCheck => ({
    id, label, note, state: validated ? 'verified' : 'unknown',
  });
  return [
    geom('bounds', 'Inside interior dimensions', 'Every box lies within L × W × H of the declared interior.'),
    geom('overlap', 'No overlapping items', 'Pairwise axis-aligned box test by an independent validator.'),
    geom('orientation', 'Allowed orientations only', 'Each item uses an orientation permitted by its rotation rule.'),
    geom('support', 'Base support & no-stack', 'Each raised item rests on surfaces at its exact base height, none marked no-stack.'),
    eq.payloadKg === null
      ? { id: 'payload', label: 'Declared payload', state: 'not_declared', note: 'No payload declared, so weight is not checked.' }
      : unknownWeights > 0
        ? { id: 'payload', label: 'Declared payload', state: 'unknown', note: `${unknownWeights} unit(s) have unknown weight; total cannot be confirmed.` }
        : { id: 'payload', label: 'Declared payload', state: validated ? 'verified' : 'unknown', note: 'Sum of declared unit weights vs the declared payload figure.' },
    eq.doorW === null
      ? { id: 'door', label: 'Door opening', state: 'not_declared', note: 'No door opening declared, so door fit is not checked.' }
      : { id: 'door', label: 'Door opening', state: validated ? 'verified' : 'unknown', note: 'Each item\'s cross-section in its placed orientation fits the declared opening. Interior path and handling equipment are NOT modeled.' },
    { id: 'axle', label: 'Axle / axle-group loads & legal limits', state: 'not_modeled', note: 'Needs vehicle configuration, tare and jurisdiction. Verify with scales and a qualified person.' },
    { id: 'securement', label: 'Load securement', state: 'not_modeled', note: 'Depends on restraint equipment and applicable rules, not on box geometry.' },
    { id: 'handling', label: 'Forklift / manual handling access', state: 'not_modeled', note: 'Loading order, aisle and reach are not simulated.' },
    { id: 'stops', label: 'Multi-stop access order', state: 'not_modeled', note: 'Unload sequence is not modeled.' },
    { id: 'cog', label: 'Centre of gravity (height & lateral)', state: 'not_modeled', note: 'Longitudinal centroid is shown as information only.' },
  ];
}

const emptyMetrics = (units: Unit[], eq: NormalizedEquipment | null): Metrics => ({
  totalUnits: units.length, placedUnits: 0, occupiedVolumePct: 0, loadedWeightKg: 0,
  unknownWeightUnits: units.filter((u) => u.weightKg === null).length,
  payloadKg: eq?.payloadKg ?? null, payloadRemainingKg: eq?.payloadKg ?? null, usedLengthMm: 0, cogXPct: null,
  cogX: null, cogY: null, cogZ: null, axleEst: null,
});

export interface AnalyzeOptions {
  cargoValid: boolean;
  shouldCancel?: () => boolean;
}

/** Sound (necessary-condition) bounds. Each one that trips proves infeasibility under modeled constraints. */
export function boundReasons(units: Unit[], eq: NormalizedEquipment): Reason[] {
  const reasons: Reason[] = [];
  const byRow = new Map<string, Unit>();
  for (const u of units) if (!byRow.has(u.rowUid)) byRow.set(u.rowUid, u);
  for (const u of byRow.values()) {
    const [l, w, h] = u.dims;
    const anyFitsInterior = orientationsForAny(u).some(([a, b, c]) => a <= eq.L + EPS && b <= eq.W + EPS && c <= eq.H + EPS);
    const anyUsable = orientationsForAny(u).some((o) => usableFor(o, eq));
    const permittedUsable = usableOrientations(u, eq).length > 0;
    const dimStr = `${Math.round(l)}×${Math.round(w)}×${Math.round(h)} mm`;
    if (permittedUsable) continue;
    if (!anyFitsInterior) {
      reasons.push({ code: 'ITEM_EXCEEDS_INTERIOR', severity: 'error', labels: [u.label],
        message: `${u.label} (${dimStr}) cannot fit inside ${Math.round(eq.L)}×${Math.round(eq.W)}×${Math.round(eq.H)} mm in any orientation.`,
        action: 'Choose larger equipment, or re-check the item dimensions.' });
    } else if (!anyUsable) {
      reasons.push({ code: 'ITEM_EXCEEDS_DOOR', severity: 'error', labels: [u.label],
        message: `${u.label} (${dimStr}) fits inside but cannot pass the ${Math.round(eq.doorW!)}×${Math.round(eq.doorH!)} mm door opening in any orientation.`,
        action: 'Use equipment with a larger opening, or split/tilt the item if it can be dismantled.' });
    } else {
      reasons.push({ code: 'ROTATION_FORBIDDEN_WOULD_FIT', severity: 'error', labels: [u.label],
        message: `${u.label} (${dimStr}) would fit if rotated further, but its rotation rule (${u.rotation}) forbids that orientation.`,
        action: 'If the item may be tilted or laid on its side, relax the rotation rule — the plan will update.' });
    }
  }
  const knownKg = units.reduce((s, u) => s + (u.weightKg ?? 0), 0);
  if (eq.payloadKg !== null && knownKg > eq.payloadKg + 1e-6) {
    reasons.push({ code: 'PAYLOAD_EXCEEDED', severity: 'error', labels: [],
      message: `Declared weights total ${knownKg.toFixed(0)} kg, above the declared payload of ${eq.payloadKg.toFixed(0)} kg${units.some((u) => u.weightKg === null) ? ' (and some weights are still unknown)' : ''}.`,
      action: 'Split the shipment across vehicles or use equipment with higher declared payload.' });
  }
  const vol = units.reduce((s, u) => s + u.dims[0] * u.dims[1] * u.dims[2], 0);
  if (vol > eq.L * eq.W * eq.H + 1) {
    reasons.push({ code: 'VOLUME_EXCEEDED', severity: 'error', labels: [],
      message: `Item bounding-box volume (${(vol / 1e9).toFixed(2)} m³) exceeds interior volume (${((eq.L * eq.W * eq.H) / 1e9).toFixed(2)} m³).`,
      action: 'Use larger equipment or reduce the shipment.' });
  }
  return reasons;
}

const orientationsForAny = (u: Unit) => orientationsFor({ ...u, rotation: 'any' });
const usableFor = (o: [number, number, number], eq: NormalizedEquipment) =>
  o[0] <= eq.L + EPS && o[1] <= eq.W + EPS && o[2] <= eq.H + EPS &&
  (eq.doorW === null || eq.doorH === null || (o[1] <= eq.doorW + EPS && o[2] <= eq.doorH + EPS));

export function analyzeEquipment(
  units: Unit[], eq: NormalizedEquipment | null, name: string, settings: Settings, opts: AnalyzeOptions,
): EquipmentResult {
  const t0 = Date.now();
  const base = {
    equipmentId: eq?.id ?? '', equipmentName: name, arrangements: [] as Arrangement[], best: 0, violations: [],
    solver: { version: SOLVER_VERSION, seed: settings.seed, attempts: 0, budget: settings.maxAttempts, stopReason: 'no_solve' as const, ms: 0 },
  };
  if (!eq) {
    return { ...base, status: 'INCOMPLETE_INPUT', geometryFeasible: false, metrics: emptyMetrics(units, null), checks: [],
      reasons: [{ code: 'PROFILE_INVALID', severity: 'error', labels: [], message: 'Equipment profile has missing or invalid internal dimensions.', action: 'Enter positive internal length, width and height.' }] };
  }
  if (!opts.cargoValid || units.length === 0) {
    return { ...base, status: 'INCOMPLETE_INPUT', geometryFeasible: false, metrics: emptyMetrics(units, eq), checks: buildChecks(eq, 0, false),
      reasons: [{ code: 'INPUT_INVALID', severity: 'error', labels: [], message: 'Cargo input has errors, so no plan was attempted.', action: 'Open the Cargo step and repair the flagged cells.' }] };
  }

  const reasons = boundReasons(units, eq);
  const proven = reasons.length > 0;
  const solved = solve(units, eq, settings, { quick: proven, shouldCancel: opts.shouldCancel });

  // Keep only arrangements that the independent validator accepts.
  const arrangements: Arrangement[] = [];
  const dropped: string[] = [];
  for (const a of solved.arrangements) {
    const v = validatePlacements(units, eq, a.placements, settings);
    if (v.length === 0) arrangements.push(a);
    else dropped.push(a.name);
  }
  const best = arrangements[0] ?? { name: 'none', placements: [], unplacedIds: units.map((u) => u.id) };
  const metrics = computeMetrics(units, eq, best.placements);
  const unknownW = units.filter((u) => u.weightKg === null).length;
  const allPlaced = best.unplacedIds.length === 0 && best.placements.length === units.length;
  const placedSet = new Set(best.placements.map((p) => p.unitId));
  const unplacedLabels = [...new Set(units.filter((u) => !placedSet.has(u.id)).map((u) => u.label))];

  let status: EquipmentResult['status'];
  let stopReason: EquipmentResult['solver']['stopReason'] = solved.stopReason;
  if (proven) { status = 'PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS'; stopReason = 'proven_bound'; }
  else if (allPlaced) {
    if (unknownW > 0 && eq.payloadKg !== null) {
      status = 'INCOMPLETE_INPUT';
      reasons.push({ code: 'WEIGHT_UNKNOWN', severity: 'warning', labels: [...new Set(units.filter((u) => u.weightKg === null).map((u) => u.label))],
        message: `Geometry fits, but ${unknownW} unit(s) have unknown weight, so the payload check cannot be completed.`,
        action: 'Enter or measure the missing weights.' });
    } else if (eq.payloadKg === null || eq.doorW === null) {
      status = 'NEEDS_PHYSICAL_REVIEW';
      if (eq.payloadKg === null) reasons.push({ code: 'PAYLOAD_NOT_DECLARED', severity: 'warning', labels: [], message: 'Geometry fits, but no payload is declared for this equipment.', action: 'Add the declared payload from the vehicle plate or carrier.' });
      if (eq.doorW === null) reasons.push({ code: 'DOOR_NOT_DECLARED', severity: 'warning', labels: [], message: 'Geometry fits, but no door opening is declared, so door fit was not checked.', action: 'Add the door opening size.' });
    } else status = 'FEASIBLE_UNDER_MODELED_CONSTRAINTS';
  } else {
    status = 'NOT_FOUND_WITHIN_SEARCH_BUDGET';
    reasons.push({ code: 'UNPLACED_ITEMS', severity: 'warning', labels: unplacedLabels,
      message: `${units.length - best.placements.length} of ${units.length} units were not placed by the heuristic.`,
      action: 'This is NOT proof of impossibility. Raise the attempt budget, relax rules (rotation, stacking, support), or try other equipment.' });
    reasons.push({ code: 'SEARCH_BUDGET_EXHAUSTED', severity: 'warning', labels: [],
      message: `Search stopped (${solved.stopReason.replace('_', ' ')}) after ${solved.attempts} attempt(s) without a complete plan.`,
      action: 'Increase attempts in Settings, or review the placed partial plan.' });
  }
  if (dropped.length) {
    reasons.push({ code: 'UNPLACED_ITEMS', severity: 'warning', labels: [], message: `Internal check discarded ${dropped.length} candidate arrangement(s) that failed independent validation.`, action: 'Report this scenario — solver/validator disagreement.' });
  }

  const multiStopStages = computeMultiStopStages(units, eq, best.placements);

  return {
    ...base,
    status,
    geometryFeasible: allPlaced,
    reasons,
    arrangements,
    best: 0,
    metrics,
    violations: [],
    checks: buildChecks(eq, unknownW, arrangements.length > 0),
    multiStopStages,
    solver: { version: SOLVER_VERSION, seed: settings.seed, attempts: solved.attempts, budget: settings.maxAttempts, stopReason, ms: Date.now() - t0 },
  };
}
