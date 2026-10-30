import { buildChecks, computeMetrics } from './analyze';
import { expandUnits, normalizeEquipment, validateEquipment, validateRows } from './normalize';
import { analyzeScenario, DEFAULT_SETTINGS, scenarioHash } from './scenario';
import type { EquipmentProfile, EquipmentResult, Placement, Scenario, Violation } from './types';
import { KG_PER, MM_PER } from './units';
import { validatePlacements } from './validator';
import type { HandlingUnit, Shipment, ShipmentAdapter, StageResult } from '../suite/types';

const connectedLimit = 'The connected workflow supports the existing identified ambient units, quantity 1, upright rotation and destination stop 1. Other native scenarios remain available in standalone Cargo Fit.';
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The selected Asset Studio observation owns connected equipment capacity. */
function equipmentForShipment(shipment: Shipment): EquipmentProfile {
  const asset = shipment.results.asset;
  if (!asset?.ok || asset.inputRevision !== shipment.inputRevision) throw new Error('Publish the current equipment snapshot in Asset Studio first.');
  const d = asset.details;
  if (d.equipmentId !== shipment.input.equipmentId || !['lengthIn', 'widthIn', 'heightIn', 'doorWidthIn', 'doorHeightIn', 'payloadLbs'].every(key => positive(d[key]))) {
    throw new Error('The selected equipment snapshot is incomplete or belongs to another asset. Review and publish it in Asset Studio.');
  }
  return {
    id: shipment.input.equipmentId, name: String(d.name ?? shipment.input.equipmentId),
    length: d.lengthIn as number, width: d.widthIn as number, height: d.heightIn as number, unit: 'in',
    doorWidth: d.doorWidthIn as number, doorHeight: d.doorHeightIn as number, payload: d.payloadLbs as number,
    massUnit: 'lb', cost: null, currency: 'USD', costSource: 'none', source: String(d.source ?? 'Published Asset Studio snapshot'), included: true,
  };
}

export function scenarioForShipment(shipment: Shipment): Scenario {
  const scenario: Scenario = {
    name: shipment.reference, equipment: [equipmentForShipment(shipment)], settings: { ...DEFAULT_SETTINGS, maxMs: 2000 },
    rows: shipment.input.units.map(u => ({
      uid: u.id, physicalUnitId: u.id, barcode: u.barcode, label: u.description, qty: 1,
      length: u.lengthIn, width: u.widthIn, height: u.heightIn, dimUnit: 'in', weight: u.weightLbs, weightUnit: 'lb',
      rotation: 'upright', stackable: u.stackable, stop: 1,
    })),
  };
  unitsForScenario(shipment, scenario);
  return scenario;
}

/**
 * Convert the native editor without inventing identities or dropping constraints.
 * Direct conversions deliberately bypass rounded solver normalization: an inch/lb
 * row must retain the exact entered values when persisted back to the manifest.
 */
export function unitsForScenario(shipment: Shipment, scenario: Scenario): HandlingUnit[] {
  const originals = new Map(shipment.input.units.map(unit => [unit.id, unit]));
  if (!originals.size || originals.size !== shipment.input.units.length || new Set(shipment.input.units.map(unit => unit.barcode)).size !== originals.size) {
    throw new Error('The manifest must contain unique identified handling units and original barcodes. Repair it in the manifest workflow.');
  }
  if (scenario.rows.length !== originals.size) throw new Error(`Retain every existing identified handling unit exactly once. Register or remove units through the manifest workflow. ${connectedLimit}`);
  const mapped = new Map<string, HandlingUnit>();
  for (const row of scenario.rows) {
    const original = row.physicalUnitId === undefined ? undefined : originals.get(row.physicalUnitId);
    if (!original || mapped.has(original.id)) throw new Error(`Every row must retain one unique original manifest identity. Reopen the shipment to restore its identified rows. ${connectedLimit}`);
    if (row.barcode !== original.barcode) throw new Error('Original handling-unit barcodes must be preserved. Reopen the shipment to restore its scan identities.');
    if (row.qty !== 1) throw new Error(`Quantity must remain 1 for each registered physical unit. ${connectedLimit}`);
    if (row.rotation !== 'upright') throw new Error(`Connected cargo must retain upright rotation. ${connectedLimit}`);
    if (row.stop !== 1) throw new Error(`Connected cargo must retain destination stop 1. ${connectedLimit}`);
    if (original.temperatureClass !== 'ambient') throw new Error(`Temperature-controlled cargo needs additional qualification. ${connectedLimit}`);
    const errors = validateRows([row]).filter(issue => issue.severity === 'error');
    if (errors.length || !positive(row.weight)) throw new Error(`Repair ${original.id} before saving: ${errors.map(issue => issue.message).join(' ') || 'A positive declared weight is required.'}`);
    const lengthFactor = row.dimUnit === 'in' ? 1 : MM_PER[row.dimUnit] / MM_PER.in;
    const weightFactor = row.weightUnit === 'lb' ? 1 : KG_PER[row.weightUnit] / KG_PER.lb;
    const unit: HandlingUnit = {
      ...original, description: row.label, lengthIn: row.length! * lengthFactor, widthIn: row.width! * lengthFactor,
      heightIn: row.height! * lengthFactor, weightLbs: row.weight! * weightFactor, stackable: row.stackable,
    };
    if (![unit.lengthIn, unit.widthIn, unit.heightIn, unit.weightLbs].every(positive) || typeof unit.stackable !== 'boolean') throw new Error(`Dimensions, mass and stacking for ${original.id} must be finite valid values before saving.`);
    mapped.set(original.id, unit);
  }
  // Reordering editor rows is not a manifest amendment.
  return shipment.input.units.map(unit => mapped.get(unit.id)!);
}

/** Publish exactly the selected current arrangement, including manual edits. */
export function resultForPlan(shipment: Shipment, scenario: Scenario, result: EquipmentResult, placements: Placement[]): StageResult {
  const manifestUnits = unitsForScenario(shipment, scenario);
  if (JSON.stringify(manifestUnits) !== JSON.stringify(shipment.input.units)) throw new Error('Save the reviewed cargo inputs together with this loading plan before publishing.');
  const expected = normalizeEquipment(equipmentForShipment(shipment))!;
  const matching = scenario.equipment.filter(profile => profile.id === expected.id && profile.included);
  const profile = matching.length === 1 ? matching[0] : undefined;
  const equipment = profile ? normalizeEquipment(profile) : null;
  if (!profile || !equipment || result.equipmentId !== expected.id || JSON.stringify(equipment) !== JSON.stringify(expected) || validateEquipment([profile]).some(issue => issue.severity === 'error')) {
    throw new Error('The reviewed equipment differs from the current Asset Studio snapshot. Reopen the selected equipment, or publish the capacity change in Asset Studio first.');
  }
  if (!Number.isFinite(scenario.settings.minSupportPct) || scenario.settings.minSupportPct < 0 || scenario.settings.minSupportPct > 100) throw new Error('Minimum support must be a finite percentage from 0 to 100 before publishing.');
  const units = expandUnits(scenario.rows);
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const malformed: Violation[] = [];
  for (const placement of placements) {
    const unit = byId.get(placement.unitId);
    if (!['x', 'y', 'z', 'dx', 'dy', 'dz'].every(key => Number.isFinite(placement[key as keyof Placement])) || !positive(placement.dx) || !positive(placement.dy) || !positive(placement.dz) || !Number.isInteger(placement.order) || placement.order < 1) {
      malformed.push({ code: 'OUT_OF_BOUNDS', unitIds: [placement.unitId], message: `${placement.unitId} needs finite coordinates, positive dimensions and a positive loading order.` });
    }
    if (unit && (placement.rowUid !== unit.rowUid || placement.stop !== unit.stop)) {
      malformed.push({ code: 'UNKNOWN_UNIT', unitIds: [placement.unitId], message: `${placement.unitId} placement identity or delivery stop differs from the reviewed cargo row.` });
    }
  }
  const validationViolations = [...malformed, ...validatePlacements(units, equipment, placements, scenario.settings)];
  const placedIds = new Set(placements.map(placement => placement.unitId));
  const missingIds = units.filter(unit => !placedIds.has(unit.id)).map(unit => unit.id);
  const complete = placements.length === units.length && placedIds.size === units.length && missingIds.length === 0;
  const ok = complete && validationViolations.length === 0;
  const metrics = malformed.length ? null : computeMetrics(units, equipment, placements);
  const checks = buildChecks(equipment, units.filter(unit => unit.weightKg === null).length, ok);
  const status = ok ? 'FEASIBLE_UNDER_MODELED_CONSTRAINTS' : complete ? 'NEEDS_PHYSICAL_REVIEW' : 'NOT_FOUND_WITHIN_SEARCH_BUDGET';
  const problem = [missingIds.length ? `Missing units: ${missingIds.join(', ')}.` : '', ...validationViolations.map(violation => violation.message)].filter(Boolean).join(' ');
  return {
    ok,
    summary: `${placements.length}/${units.length} handling units placed. ${ok ? 'Independent geometric checks passed for the reviewed native arrangement under declared constraints.' : problem || 'Place each original handling unit exactly once before publishing.'}`,
    details: {
      geometryFeasible: ok, violations: validationViolations.length, validationViolations, missingUnitIds: missingIds,
      unitIds: placements.map(placement => placement.unitId), placements: structuredClone(placements), status,
      solverVersion: result.solver.version, solver: structuredClone(result.solver), solverStatus: result.status, solverReasons: structuredClone(result.reasons),
      checks, metrics, settings: structuredClone(scenario.settings), nativeScenario: structuredClone(scenario), scenarioHash: scenarioHash(scenario),
      equipmentSnapshot: equipment,
      nativeResult: { ...structuredClone(result), geometryFeasible: ok, status, metrics: metrics ?? result.metrics, checks, violations: validationViolations,
        arrangements: [{ name: 'Saved reviewed shipment arrangement', placements: structuredClone(placements), unplacedIds: missingIds }], best: 0 },
      provenance: { source: 'reviewed_native_arrangement', productId: 'product-01-cargo-fit', shipmentId: shipment.id, reviewedBaseInputRevision: shipment.inputRevision, assetRecordedAt: shipment.results.asset!.recordedAt, assetProductId: shipment.results.asset!.productId },
      limitation: 'Declared scenario geometry only. No physical scale, restraint or road-legal certification.',
    },
  };
}

export const shipmentAdapter: ShipmentAdapter = {
  stage: 'fit',
  evaluate(shipment) {
    const scenario = scenarioForShipment(shipment);
    const result = analyzeScenario(scenario).results[0];
    return resultForPlan(shipment, scenario, result, result.arrangements[result.best]?.placements ?? []);
  },
};
