import type {
  CargoRow, EquipmentProfile, InputIssue, NormalizedEquipment, Unit,
} from './types';
import { toKg, toMm } from './units';

export const MAX_UNITS = 5000;

const pos = (v: number | null) => v !== null && Number.isFinite(v) && v > 0;

/** Validate cargo rows. Errors block solving; warnings do not. */
export function validateRows(rows: CargoRow[]): InputIssue[] {
  const issues: InputIssue[] = [];
  const seen = new Map<string, string>();
  const add = (
    r: CargoRow, severity: InputIssue['severity'], field: string, code: string, message: string,
  ) => issues.push({ severity, scope: 'cargo', rowUid: r.uid, field, code, message });

  let totalUnits = 0;
  for (const r of rows) {
    const lab = r.label.trim();
    if (!lab) add(r, 'error', 'label', 'LABEL_MISSING', 'Identifier is required.');
    else {
      const key = lab.toLowerCase();
      if (seen.has(key)) add(r, 'error', 'label', 'DUPLICATE_LABEL', `Duplicate identifier "${lab}" — merge the rows or rename one.`);
      else seen.set(key, r.uid);
    }
    if (r.qty === null || !Number.isInteger(r.qty) || r.qty < 1) {
      add(r, 'error', 'qty', 'QTY_INVALID', 'Quantity must be a whole number ≥ 1.');
    } else totalUnits += r.qty;
    (['length', 'width', 'height'] as const).forEach((f) => {
      const v = r[f];
      if (v === null) add(r, 'error', f, 'DIM_MISSING', `${f} is missing — never guessed. Enter or measure it.`);
      else if (!Number.isFinite(v) || v <= 0) add(r, 'error', f, 'DIM_NONPOSITIVE', `${f} must be > 0 (got ${v}).`);
    });
    if (r.weight === null) add(r, 'warning', 'weight', 'WEIGHT_UNKNOWN', 'Weight unknown — payload checks cannot be completed for this row.');
    else if (!Number.isFinite(r.weight) || r.weight <= 0) add(r, 'error', 'weight', 'WEIGHT_NONPOSITIVE', `weight must be > 0 (got ${r.weight}); leave empty if unknown.`);
    if (pos(r.length) && pos(r.width) && pos(r.height)) {
      const mm = [toMm(r.length!, r.dimUnit), toMm(r.width!, r.dimUnit), toMm(r.height!, r.dimUnit)];
      if (Math.max(...mm) > 20000) add(r, 'warning', 'length', 'DIM_IMPLAUSIBLE', `Longest side is ${Math.round(Math.max(...mm))} mm — check the unit.`);
      if (Math.min(...mm) < 5) add(r, 'warning', 'length', 'DIM_IMPLAUSIBLE', 'Shortest side is under 5 mm — check the unit.');
    }
  }
  if (rows.length === 0) {
    issues.push({ severity: 'error', scope: 'cargo', rowUid: '', field: 'rows', code: 'NO_CARGO', message: 'Add at least one cargo row.' });
  }
  if (totalUnits > MAX_UNITS) {
    issues.push({ severity: 'error', scope: 'cargo', rowUid: '', field: 'qty', code: 'TOO_MANY_UNITS', message: `Total ${totalUnits} units exceeds the ${MAX_UNITS} unit limit.` });
  }
  return issues;
}

export function validateEquipment(list: EquipmentProfile[]): InputIssue[] {
  const issues: InputIssue[] = [];
  for (const e of list) {
    const add = (severity: InputIssue['severity'], field: string, code: string, message: string) =>
      issues.push({ severity, scope: 'equipment', rowUid: e.id, field, code, message });
    (['length', 'width', 'height'] as const).forEach((f) => {
      if (!pos(e[f])) add('error', f, 'DIM_INVALID', `Internal ${f} must be a number > 0.`);
    });
    if (e.payload === null) add('warning', 'payload', 'PAYLOAD_NOT_DECLARED', 'No payload declared — weight limit is not modeled.');
    else if (e.payload <= 0) add('error', 'payload', 'PAYLOAD_INVALID', 'Payload must be > 0.');
    if (e.doorWidth === null || e.doorHeight === null) add('warning', 'door', 'DOOR_NOT_DECLARED', 'No door opening declared — door fit is not modeled.');
    else if (e.doorWidth <= 0 || e.doorHeight <= 0) add('error', 'door', 'DOOR_INVALID', 'Door dimensions must be > 0.');
    if (e.cost !== null && e.cost < 0) add('error', 'cost', 'COST_INVALID', 'Cost cannot be negative.');
  }
  return issues;
}

export function expandUnits(rows: CargoRow[]): Unit[] {
  const out: Unit[] = [];
  for (const r of rows) {
    if (!pos(r.length) || !pos(r.width) || !pos(r.height) || r.qty === null || r.qty < 1) continue;
    const dims: [number, number, number] = [
      toMm(r.length!, r.dimUnit), toMm(r.width!, r.dimUnit), toMm(r.height!, r.dimUnit),
    ];
    const w = r.weight !== null && r.weight > 0 ? toKg(r.weight, r.weightUnit) : null;
    for (let i = 1; i <= r.qty; i++) {
      out.push({
        id: r.qty === 1 ? r.label.trim() : `${r.label.trim()}#${i}`,
        rowUid: r.uid, label: r.label.trim(), dims, weightKg: w,
        rotation: r.rotation, stackable: r.stackable,
        stop: r.stop ?? null,
      });
      if (out.length > MAX_UNITS) return out;
    }
  }
  return out;
}

export function normalizeEquipment(e: EquipmentProfile): NormalizedEquipment | null {
  if (!pos(e.length) || !pos(e.width) || !pos(e.height)) return null;
  const hasDoor = e.doorWidth !== null && e.doorHeight !== null && e.doorWidth > 0 && e.doorHeight > 0;
  return {
    id: e.id, name: e.name,
    L: toMm(e.length!, e.unit), W: toMm(e.width!, e.unit), H: toMm(e.height!, e.unit),
    doorW: hasDoor ? toMm(e.doorWidth!, e.unit) : null,
    doorH: hasDoor ? toMm(e.doorHeight!, e.unit) : null,
    payloadKg: e.payload !== null && e.payload > 0 ? toKg(e.payload, e.massUnit) : null,
  };
}

export const hasErrors = (issues: InputIssue[]) => issues.some((i) => i.severity === 'error');
