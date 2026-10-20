/**
 * Independent geometric validator. Deliberately does NOT import the solver:
 * every plan (solver output, manual edit, imported file) is re-checked here
 * against exactly the constraints the product claims to model.
 */
import type { NormalizedEquipment, Placement, Settings, Unit, Violation } from './types';

export const EPS = 0.01;

const sortedDims = (a: number[]) => [...a].sort((p, q) => p - q);
const near = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** Is (dx,dy,dz) a permitted orientation of the unit under its rotation rule? */
export function orientationAllowed(u: Unit, dx: number, dy: number, dz: number): boolean {
  const [l, w, h] = u.dims;
  if (u.rotation === 'fixed') return near(dx, l) && near(dy, w) && near(dz, h);
  if (u.rotation === 'upright') {
    return near(dz, h) && ((near(dx, l) && near(dy, w)) || (near(dx, w) && near(dy, l)));
  }
  const a = sortedDims([l, w, h]);
  const b = sortedDims([dx, dy, dz]);
  return a.every((v, i) => near(v, b[i]));
}

export function validatePlacements(
  units: Unit[], eq: NormalizedEquipment, placements: Placement[], settings: Pick<Settings, 'minSupportPct'>,
): Violation[] {
  const out: Violation[] = [];
  const byId = new Map(units.map((u) => [u.id, u]));
  const seen = new Set<string>();
  const minSupport = settings.minSupportPct / 100;

  for (const p of placements) {
    const u = byId.get(p.unitId);
    if (!u) { out.push({ code: 'UNKNOWN_UNIT', unitIds: [p.unitId], message: `Placement refers to unknown unit ${p.unitId}.` }); continue; }
    if (seen.has(p.unitId)) out.push({ code: 'DUPLICATE_PLACEMENT', unitIds: [p.unitId], message: `${p.unitId} is placed more than once.` });
    seen.add(p.unitId);
    if (p.x < -EPS || p.y < -EPS || p.z < -EPS || p.x + p.dx > eq.L + EPS || p.y + p.dy > eq.W + EPS || p.z + p.dz > eq.H + EPS) {
      out.push({ code: 'OUT_OF_BOUNDS', unitIds: [p.unitId], message: `${p.unitId} extends outside the ${eq.name} interior.` });
    }
    if (!orientationAllowed(u, p.dx, p.dy, p.dz)) {
      out.push({ code: 'ORIENTATION_NOT_ALLOWED', unitIds: [p.unitId], message: `${p.unitId} is in an orientation its rotation rule (${u.rotation}) does not allow.` });
    }
    if (eq.doorW !== null && eq.doorH !== null && (p.dy > eq.doorW + EPS || p.dz > eq.doorH + EPS)) {
      out.push({ code: 'DOOR_BLOCKED', unitIds: [p.unitId], message: `${p.unitId} cross-section ${Math.round(p.dy)}×${Math.round(p.dz)} mm exceeds the door opening ${Math.round(eq.doorW)}×${Math.round(eq.doorH)} mm in its placed orientation.` });
    }
  }

  // Overlap: sweep over x
  const ps = placements.filter((p) => byId.has(p.unitId)).slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (b.x >= a.x + a.dx - EPS) break;
      if (b.y < a.y + a.dy - EPS && a.y < b.y + b.dy - EPS && b.z < a.z + a.dz - EPS && a.z < b.z + b.dz - EPS) {
        out.push({ code: 'OVERLAP', unitIds: [a.unitId, b.unitId], message: `${a.unitId} and ${b.unitId} occupy the same space.` });
      }
    }
  }

  // Support and no-stack
  for (const p of ps) {
    if (p.z <= EPS) continue;
    const area = p.dx * p.dy;
    let supported = 0;
    for (const q of ps) {
      if (q === p || !near(q.z + q.dz, p.z)) continue;
      const ox = Math.min(p.x + p.dx, q.x + q.dx) - Math.max(p.x, q.x);
      const oy = Math.min(p.y + p.dy, q.y + q.dy) - Math.max(p.y, q.y);
      if (ox > EPS && oy > EPS) {
        supported += ox * oy;
        if (!byId.get(q.unitId)!.stackable) {
          out.push({ code: 'ON_NO_STACK_ITEM', unitIds: [p.unitId, q.unitId], message: `${p.unitId} rests on no-stack item ${q.unitId}.` });
        }
      }
    }
    if (supported / area < minSupport - 1e-6) {
      out.push({ code: 'UNSUPPORTED', unitIds: [p.unitId], message: `${p.unitId} base is only ${(100 * supported / area).toFixed(0)}% supported (minimum ${settings.minSupportPct}%).` });
    }
  }

  // Payload (only known weights; unknown weights are reported elsewhere)
  if (eq.payloadKg !== null) {
    const w = placements.reduce((s, p) => s + (byId.get(p.unitId)?.weightKg ?? 0), 0);
    if (w > eq.payloadKg + 1e-6) {
      out.push({ code: 'PAYLOAD_EXCEEDED', unitIds: [], message: `Known loaded weight ${w.toFixed(1)} kg exceeds declared payload ${eq.payloadKg.toFixed(1)} kg.` });
    }
  }
  return out;
}
