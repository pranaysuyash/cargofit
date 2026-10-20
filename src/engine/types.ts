/**
 * Typed domain contracts for Cargo Fit. All engine math runs on normalized
 * millimetres / kilograms; entered units are preserved on the draft rows.
 */

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type MassUnit = 'kg' | 'lb' | 't';

/** fixed = as entered, upright = yaw only (height stays vertical), any = all 6 orientations */
export type RotationRule = 'fixed' | 'upright' | 'any';

/** A user-editable cargo row. `null` numeric = missing/unparseable (never invented). */
export interface CargoRow {
  uid: string;
  label: string;
  qty: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimUnit: LengthUnit;
  /** weight PER UNIT, null = unknown */
  weight: number | null;
  weightUnit: MassUnit;
  rotation: RotationRule;
  /** false = nothing may be placed on top (fragile / no-stack) */
  stackable: boolean;
  /** Delivery drop sequence (1 = first stop / unloaded first; higher = later stops) */
  stop?: number | null;
}

export type CostSource = 'none' | 'user' | 'illustrative';

export interface EquipmentProfile {
  id: string;
  name: string;
  /** INTERNAL dimensions, expressed in `unit` */
  length: number | null;
  width: number | null;
  height: number | null;
  unit: LengthUnit;
  doorWidth: number | null;
  doorHeight: number | null;
  payload: number | null;
  massUnit: MassUnit;
  cost: number | null;
  currency: string;
  costSource: CostSource;
  /** provenance of the capacity values */
  source: string;
  included: boolean;
}

export interface Settings {
  seed: number;
  /** number of solver attempts (deterministic budget) */
  maxAttempts: number;
  /** wall-clock safety cap per equipment; hitting it is recorded and is NOT a proof */
  maxMs: number;
  /** percent of an item's base that must rest on surfaces at exactly its base height */
  minSupportPct: number;
}

export interface Scenario {
  name: string;
  rows: CargoRow[];
  equipment: EquipmentProfile[];
  settings: Settings;
}

export type Severity = 'error' | 'warning' | 'info';

export interface InputIssue {
  severity: Severity;
  scope: 'cargo' | 'equipment';
  rowUid: string;
  field: string;
  code: string;
  message: string;
}

/** One physical unit after qty expansion, normalized to mm / kg. */
export interface Unit {
  id: string;
  rowUid: string;
  label: string;
  dims: [number, number, number];
  weightKg: number | null;
  rotation: RotationRule;
  stackable: boolean;
  stop?: number | null;
}

export interface NormalizedEquipment {
  id: string;
  name: string;
  L: number;
  W: number;
  H: number;
  doorW: number | null;
  doorH: number | null;
  payloadKg: number | null;
}

export interface Placement {
  unitId: string;
  rowUid: string;
  label: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  /** loading order, 1-based; placement order in the solver */
  order: number;
  /** Delivery drop sequence (if declared) */
  stop?: number | null;
}

export type ResultStatus =
  | 'FEASIBLE_UNDER_MODELED_CONSTRAINTS'
  | 'PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS'
  | 'NOT_FOUND_WITHIN_SEARCH_BUDGET'
  | 'INCOMPLETE_INPUT'
  | 'NEEDS_PHYSICAL_REVIEW';

export type ReasonCode =
  | 'INPUT_INVALID'
  | 'ITEM_EXCEEDS_INTERIOR'
  | 'ITEM_EXCEEDS_DOOR'
  | 'ROTATION_FORBIDDEN_WOULD_FIT'
  | 'PAYLOAD_EXCEEDED'
  | 'VOLUME_EXCEEDED'
  | 'WEIGHT_UNKNOWN'
  | 'PAYLOAD_NOT_DECLARED'
  | 'DOOR_NOT_DECLARED'
  | 'SEARCH_BUDGET_EXHAUSTED'
  | 'UNPLACED_ITEMS'
  | 'PROFILE_INVALID';

export interface Reason {
  code: ReasonCode;
  severity: Severity;
  message: string;
  action: string;
  /** row labels involved */
  labels: string[];
}

export interface Violation {
  code:
    | 'OUT_OF_BOUNDS'
    | 'OVERLAP'
    | 'ORIENTATION_NOT_ALLOWED'
    | 'UNSUPPORTED'
    | 'ON_NO_STACK_ITEM'
    | 'PAYLOAD_EXCEEDED'
    | 'DOOR_BLOCKED'
    | 'DUPLICATE_PLACEMENT'
    | 'STOP_ACCESS_BLOCKED'
    | 'UNKNOWN_UNIT';
  unitIds: string[];
  message: string;
}

export interface Arrangement {
  name: string;
  placements: Placement[];
  unplacedIds: string[];
}

export interface AxleEstimate {
  steerKg: number;
  driveKg: number;
  trailerKg: number;
  steerPct: number;
  drivePct: number;
  trailerPct: number;
  /** US Federal Bridge Formula B statutory compliance flag (23 CFR § 658.17) */
  bridgeFormulaCompliant?: boolean;
  /** Maximum legal gross vehicle weight allowed by Bridge Formula B for this wheelbase */
  bridgeFormulaLimitKg?: number;
}

export interface Metrics {
  totalUnits: number;
  placedUnits: number;
  /** sum of placed items' bounding-box volume / interior volume */
  occupiedVolumePct: number;
  loadedWeightKg: number;
  unknownWeightUnits: number;
  payloadKg: number | null;
  payloadRemainingKg: number | null;
  /** furthest x extent used, mm (from the front wall toward the door) */
  usedLengthMm: number;
  /** informational only: weight-weighted x centroid as % of interior length */
  cogXPct: number | null;
  /** longitudinal centroid in mm from front wall */
  cogX?: number | null;
  /** lateral centroid in mm from left wall */
  cogY?: number | null;
  /** vertical centroid in mm from floor */
  cogZ?: number | null;
  /** preliminary beam-reaction axle load estimation for standard highway rigs */
  axleEst?: AxleEstimate | null;
}

export type CheckState = 'verified' | 'not_modeled' | 'not_declared' | 'unknown';
export interface ModeledCheck {
  id: string;
  label: string;
  state: CheckState;
  note: string;
}

export interface MultiStopStage {
  stage: number;
  stop: number;
  label: string;
  remainingUnits: number;
  remainingWeightKg: number;
  cogX: number | null;
  cogXPct: number | null;
  axleEst: AxleEstimate | null;
  warning?: string | null;
}

export interface EquipmentResult {
  equipmentId: string;
  equipmentName: string;
  status: ResultStatus;
  geometryFeasible: boolean;
  reasons: Reason[];
  arrangements: Arrangement[];
  /** index of the arrangement shown by default */
  best: number;
  metrics: Metrics;
  violations: Violation[];
  checks: ModeledCheck[];
  multiStopStages?: MultiStopStage[];
  solver: {
    version: string;
    seed: number;
    attempts: number;
    budget: number;
    stopReason: 'all_placed' | 'attempts_exhausted' | 'time_cap' | 'cancelled' | 'proven_bound' | 'no_solve';
    ms: number;
  };
}

export const SOLVER_VERSION = 'ep-heuristic-1.0';
