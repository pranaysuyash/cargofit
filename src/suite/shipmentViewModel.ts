import type { FlowEvent, FlowStage, HandlingUnit, Shipment, ShipmentInput, StageRecord } from './types';
import { reviewedGeometryIssue } from './reviewedGeometry.mjs';

const stageKeys: FlowStage[] = ['asset', 'fit', 'warehouse', 'yard', 'carrier', 'quote', 'hos'];
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export type StageState = 'missing' | 'stale' | 'rejected' | 'expired' | 'unknown freshness' | 'current';
export function stageState(shipment: Shipment, stage: FlowStage, now: string): StageState {
  const result = shipment.results[stage];
  if (!result) return 'missing';
  if (result.inputRevision !== shipment.inputRevision) return 'stale';
  if (!result.ok) return 'rejected';
  if (stage === 'carrier') {
    const expiry = result.details.expiresAt;
    if (typeof expiry !== 'string' || !finite(Date.parse(expiry)) || !finite(Date.parse(now))) return 'unknown freshness';
    if (Date.parse(expiry) <= Date.parse(now)) return 'expired';
  }
  return 'current';
}

function validInput(value: unknown): value is ShipmentInput {
  const v = record(value);
  if (!v || !['origin', 'destination', 'equipmentId', 'carrierDot', 'driverId', 'tractorId', 'trailerId'].every(k => nonempty(v[k])) || !positive(v.loadedMiles) || !finite(v.deadheadMiles) || v.deadheadMiles < 0 || !positive(v.priorRestHours) || !Array.isArray(v.units) || v.units.length === 0) return false;
  const units = v.units as HandlingUnit[];
  return new Set(units.map(u => u?.id)).size === units.length && new Set(units.map(u => u?.barcode)).size === units.length && units.every(u => u && nonempty(u.id) && nonempty(u.barcode) && nonempty(u.description) && [u.lengthIn, u.widthIn, u.heightIn, u.weightLbs].every(positive) && typeof u.stackable === 'boolean' && ['ambient', 'chilled', 'frozen'].includes(u.temperatureClass));
}

export interface InputReplay {
  input: ShipmentInput | null;
  inputRevision: number;
  event: FlowEvent | null;
  sourceEventIds: string[];
  reason: string;
}
/** Reconstruct only retained manifest facts. Never substitute today's input for an incomplete historical payload. */
export function inputAtEvent(shipment: Shipment, eventId: string): InputReplay {
  const end = shipment.events.findIndex(e => e.id === eventId);
  if (end < 0) return { input: null, inputRevision: 0, event: null, sourceEventIds: [], reason: 'The selected event is not retained in this shipment.' };
  let input: ShipmentInput | null = null, revision = 0;
  let sources: string[] = [];
  let reason = 'A complete historical manifest has not been retained.';
  for (const event of shipment.events.slice(0, end + 1)) {
    const p = event.payload ?? {};
    if (event.type === 'created' || event.type === 'amend') {
      if (validInput(p.input)) {
        input = structuredClone(p.input); revision = event.inputRevision; sources = [event.id]; reason = 'Exact manifest reconstructed from retained event payloads.';
      } else {
        input = null; revision = event.inputRevision; sources = []; reason = `${event.type} does not retain a complete supported manifest. Historical inputs are unknown.`;
      }
      continue;
    }
    const inputCommand = ['cargo.amend', 'cargo.publish', 'asset.publish', 'carrier.publish'].includes(event.type);
    if (inputCommand) {
      if (!input || (event.inputRevision !== revision && event.inputRevision !== revision + 1)) {
        input = null; revision = event.inputRevision; reason = 'A required earlier manifest or revision is missing. Historical inputs are unknown.'; continue;
      }
      const candidate: ShipmentInput = { ...input };
      if (event.type.startsWith('cargo.')) candidate.units = p.units as HandlingUnit[];
      else if (event.type === 'asset.publish') candidate.equipmentId = p.equipmentId as string;
      else candidate.carrierDot = p.carrierDot as string;
      if (!validInput(candidate)) {
        input = null; reason = `${event.type} lacks its declared input fields. No current values are substituted.`;
      } else {
        input = structuredClone(candidate); sources.push(event.id);
      }
      revision = event.inputRevision;
    } else if (event.inputRevision !== revision) {
      input = null; revision = event.inputRevision; reason = 'An unexplained input revision prevents exact historical reconstruction.';
    }
  }
  return { input, inputRevision: shipment.events[end].inputRevision, event: shipment.events[end], sourceEventIds: sources, reason };
}

export interface SpatialPlacement {
  unitId: string;
  label: string;
  ordinal: number;
  x: number; y: number; z: number; dx: number; dy: number; dz: number;
}
export interface SpatialModel {
  available: boolean;
  reason: string;
  envelope: { length: number; width: number; height: number } | null;
  placements: SpatialPlacement[];
  recordedAt: string | null;
}
/** The reviewed native fit owns millimetre geometry. Unspecified legacy placement units cannot be guessed. */
export function spatialModel(shipment: Shipment): SpatialModel {
  const fit = shipment.results.fit;
  const unavailable = (reason: string): SpatialModel => ({ available: false, reason, envelope: null, placements: [], recordedAt: fit?.recordedAt ?? null });
  if (!fit?.ok || fit.inputRevision !== shipment.inputRevision) return unavailable('Publish a current accepted loading plan to display its arrangement.');
  const d = fit.details, equipment = record(d.equipmentSnapshot), provenance = record(d.provenance);
  if (!equipment || provenance?.source !== 'reviewed_native_arrangement' || ![equipment.L, equipment.W, equipment.H].every(positive)) return unavailable('This legacy result does not retain a supported equipment envelope and placement-unit provenance. Exact spatial drawing is unavailable; inspect the retained result.');
  const issue = reviewedGeometryIssue(shipment.input.units, d.placements, equipment);
  if (issue) return unavailable(issue);
  const length = equipment.L as number, width = equipment.W as number, height = equipment.H as number;
  if (!Array.isArray(d.placements) || d.placements.length !== shipment.input.units.length) return unavailable('The retained plan does not identify every manifest unit exactly once.');
  const seen = new Set<string>(), placements: SpatialPlacement[] = [];
  for (const value of d.placements) {
    const p = record(value), unit = shipment.input.units.find(u => u.id === p?.unitId);
    if (!p || !unit || seen.has(unit.id) || ![p.x, p.y, p.z].every(finite) || ![p.dx, p.dy, p.dz].every(positive)) return unavailable('Retained placement identity or geometry is incomplete. No inferred box is drawn.');
    const x = p.x as number, y = p.y as number, z = p.z as number, dx = p.dx as number, dy = p.dy as number, dz = p.dz as number;
    if (x < 0 || y < 0 || z < 0 || x + dx > length + 0.1 || y + dy > width + 0.1 || z + dz > height + 0.1) return unavailable('Retained geometry exceeds its declared envelope; inspect the plan before relying on the drawing.');
    seen.add(unit.id);
    placements.push({ unitId: unit.id, label: unit.description, ordinal: shipment.input.units.findIndex(u => u.id === unit.id) + 1, x, y, z, dx, dy, dz });
  }
  return { available: true, reason: 'Recorded native arrangement in millimetres; equal scale on both axes. This is planned placement, not observed physical location.', envelope: { length, width, height }, placements, recordedAt: fit.recordedAt };
}

export function filterUnits(units: HandlingUnit[], query: string): HandlingUnit[] {
  const needle = query.trim().toLocaleLowerCase();
  return needle ? units.filter(u => [u.id, u.barcode, u.description].some(v => v.toLocaleLowerCase().includes(needle))) : units;
}
export function filterEvents(events: FlowEvent[], query: string, type = 'all'): FlowEvent[] {
  const needle = query.trim().toLocaleLowerCase();
  return events.filter(e => (type === 'all' || e.type === type) && (!needle || [e.id, e.type, e.productId, e.note, e.at, String(e.inputRevision), JSON.stringify(e.payload ?? {})].some(v => v.toLocaleLowerCase().includes(needle))));
}
export function scenarioLocation(shipment: Shipment): string {
  if (shipment.status === 'in_transit') return `Scenario departure recorded from ${shipment.input.origin}. Current position and ETA are not recorded.`;
  if (['arrived', 'delivered', 'invoice_ready'].includes(shipment.status)) return `Scenario arrival recorded at ${shipment.input.destination}${shipment.delivery ? '; manually entered receipt retained' : ''}. No live position evidence.`;
  return `Planning origin: ${shipment.input.origin}. Physical loading and current position are not recorded.`;
}
export interface ModeledWaypoint { id: string; title: string; durationMinutes: number; cumulativeTimeMinutes: number; dutyStatus: string; location: string }
export function modeledWaypoints(result: StageRecord | undefined): ModeledWaypoint[] {
  const values = result?.details.waypoints;
  if (!Array.isArray(values)) return [];
  if (!values.every(v => { const r = record(v); return r && nonempty(r.id) && nonempty(r.title) && finite(r.durationMinutes) && r.durationMinutes >= 0 && finite(r.cumulativeTimeMinutes) && r.cumulativeTimeMinutes >= r.durationMinutes && nonempty(r.dutyStatus) && nonempty(r.location); })) return [];
  return structuredClone(values) as ModeledWaypoint[];
}
export const RELATIONS: { from: FlowStage | 'dispatch' | 'movement' | 'receipt'; to: FlowStage | 'dispatch' | 'movement' | 'receipt' | 'invoice'; label: string }[] = [
  { from: 'asset', to: 'fit', label: 'defines envelope' }, { from: 'fit', to: 'quote', label: 'anchors accepted terms' },
  { from: 'fit', to: 'warehouse', label: 'identifies receiving units' }, { from: 'warehouse', to: 'yard', label: 'precedes dock review' },
  ...stageKeys.map(from => ({ from, to: 'dispatch' as const, label: 'required decision' })),
  { from: 'dispatch', to: 'movement', label: 'authorizes scenario departure' }, { from: 'movement', to: 'receipt', label: 'arrival permits receipt' },
  { from: 'receipt', to: 'invoice', label: 'provides delivery evidence' }, { from: 'quote', to: 'invoice', label: 'reconciles exact cents' },
];
