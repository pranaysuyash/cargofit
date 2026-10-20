/**
 * Deterministic extreme-point-style heuristic packer (seeded).
 * It only ever *proposes* plans; every plan is re-checked by validator.ts.
 * Constraints enforced while building: interior bounds, non-overlap, allowed
 * orientations, door cross-section (placed orientation), gravity + minimum base
 * support, no-stack, declared payload (known weights).
 */
import { EPS } from './validator';
import type {
  Arrangement, NormalizedEquipment, Placement, Settings, Unit,
} from './types';

type Dims = [number, number, number];

export function orientationsFor(u: Unit): Dims[] {
  const [l, w, h] = u.dims;
  let list: Dims[];
  if (u.rotation === 'fixed') list = [[l, w, h]];
  else if (u.rotation === 'upright') list = [[l, w, h], [w, l, h]];
  else list = [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]];
  const seen = new Set<string>();
  return list.filter((d) => {
    const k = d.join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Orientations that fit the interior and pass the door in the placed orientation. */
export function usableOrientations(u: Unit, eq: NormalizedEquipment): Dims[] {
  return orientationsFor(u).filter(([dx, dy, dz]) =>
    dx <= eq.L + EPS && dy <= eq.W + EPS && dz <= eq.H + EPS &&
    (eq.doorW === null || eq.doorH === null || (dy <= eq.doorW + EPS && dz <= eq.doorH + EPS)));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Strategy = 'front-first' | 'floor-first';
interface OrderDef { name: string; key: (u: Unit, idx: number) => number[] }

const vol = (u: Unit) => u.dims[0] * u.dims[1] * u.dims[2];
const ORDERS: OrderDef[] = [
  { name: 'Volume ↓', key: (u) => [-vol(u)] },
  { name: 'Longest edge ↓', key: (u) => [-Math.max(...u.dims), -vol(u)] },
  { name: 'Footprint ↓', key: (u) => [-([...u.dims].sort((a, b) => b - a)[0] * [...u.dims].sort((a, b) => b - a)[1]), -vol(u)] },
  { name: 'Heavy first', key: (u) => [-(u.weightKg ?? 0), -vol(u)] },
  { name: 'Tallest first', key: (u) => [-u.dims[2], -vol(u)] },
  { name: 'No-stack first', key: (u) => [u.stackable ? 1 : 0, -vol(u)] },
  { name: 'Input order', key: (_u, i) => [i] },
];

interface Box { x: number; y: number; z: number; dx: number; dy: number; dz: number; top: number; stackable: boolean }

interface RunResult { placements: Placement[]; unplacedIds: string[] }

function runOnce(
  ordered: Unit[], eq: NormalizedEquipment, strat: Strategy, minSupport: number,
  deadline: number, shouldCancel: () => boolean,
): RunResult {
  const boxes: Box[] = [];
  const CELL = 250;
  const grid = new Map<number, number[]>();
  const stamp: number[] = [];
  let stampId = 0;
  const cellKey = (ix: number, iy: number) => ix * 100003 + iy;
  const registerBox = (i: number) => {
    const b = boxes[i];
    for (let ix = Math.floor(b.x / CELL); ix <= Math.floor((b.x + b.dx - EPS) / CELL); ix++) {
      for (let iy = Math.floor(b.y / CELL); iy <= Math.floor((b.y + b.dy - EPS) / CELL); iy++) {
        const k = cellKey(ix, iy);
        const l = grid.get(k);
        if (l) l.push(i); else grid.set(k, [i]);
      }
    }
  };
  /** boxes whose footprint cells overlap the query rectangle (deduped) */
  const nearBoxes = (x: number, y: number, w: number, h: number): number[] => {
    stampId++;
    const out: number[] = [];
    for (let ix = Math.floor(x / CELL); ix <= Math.floor((x + w - EPS) / CELL); ix++) {
      for (let iy = Math.floor(y / CELL); iy <= Math.floor((y + h - EPS) / CELL); iy++) {
        const l = grid.get(cellKey(ix, iy));
        if (!l) continue;
        for (const i of l) if (stamp[i] !== stampId) { stamp[i] = stampId; out.push(i); }
      }
    }
    return out;
  };

  const points: [number, number][] = [[0, 0]]; // kept sorted by x then y
  const pointSet = new Set<string>(['0|0']);
  const placements: Placement[] = [];
  const unplaced: string[] = [];
  let weight = 0;
  let lastFail = '';
  const addPoint = (x: number, y: number) => {
    if (x > eq.L + EPS || y > eq.W + EPS) return;
    const k = `${Math.round(x * 100)}|${Math.round(y * 100)}`;
    if (pointSet.has(k)) return;
    pointSet.add(k);
    let lo = 0, hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid][0] < x || (points[mid][0] === x && points[mid][1] < y)) lo = mid + 1; else hi = mid;
    }
    points.splice(lo, 0, [x, y]);
  };

  for (const u of ordered) {
    if (shouldCancel() || Date.now() > deadline) { unplaced.push(u.id); continue; }
    if (eq.payloadKg !== null && u.weightKg !== null && weight + u.weightKg > eq.payloadKg + 1e-6) {
      unplaced.push(u.id);
      continue;
    }
    // Consecutive identical units after a failed scan cannot succeed (nothing was added since).
    const key = `${u.dims.join('x')}|${u.rotation}|${u.stackable}`;
    if (key === lastFail) { unplaced.push(u.id); continue; }
    const orients = usableOrientations(u, eq);
    let best: { score: number[]; x: number; y: number; z: number; d: Dims } | null = null;
    for (const [px, py] of points) {
      // points are x-sorted; a later point cannot beat a floor-level candidate found earlier
      if (best && px > best.x + EPS && (strat === 'front-first' || best.z <= EPS)) break;
      for (const d of orients) {
        const [dx, dy, dz] = d;
        if (px + dx > eq.L + EPS || py + dy > eq.W + EPS) continue;
        const near = nearBoxes(px, py, dx, dy);
        let z = 0;
        for (const i of near) {
          const b = boxes[i];
          if (px < b.x + b.dx - EPS && b.x < px + dx - EPS && py < b.y + b.dy - EPS && b.y < py + dy - EPS) {
            if (b.top > z) z = b.top;
          }
        }
        if (z + dz > eq.H + EPS) continue;
        if (z > EPS) {
          let sup = 0;
          let ok = true;
          for (const i of near) {
            const b = boxes[i];
            if (Math.abs(b.top - z) > EPS) continue;
            const ox = Math.min(px + dx, b.x + b.dx) - Math.max(px, b.x);
            const oy = Math.min(py + dy, b.y + b.dy) - Math.max(py, b.y);
            if (ox > EPS && oy > EPS) {
              if (!b.stackable) { ok = false; break; }
              sup += ox * oy;
            }
          }
          if (!ok || sup / (dx * dy) < minSupport - 1e-6) continue;
        }
        const score = strat === 'front-first' ? [px, z, py, dz] : [z, px, py, dz];
        if (!best || cmp(score, best.score) < 0) best = { score, x: px, y: py, z, d };
      }
    }
    if (!best) { unplaced.push(u.id); lastFail = key; continue; }
    lastFail = '';
    const [dx, dy, dz] = best.d;
    boxes.push({ x: best.x, y: best.y, z: best.z, dx, dy, dz, top: best.z + dz, stackable: u.stackable });
    registerBox(boxes.length - 1);
    placements.push({ unitId: u.id, rowUid: u.rowUid, label: u.label, x: best.x, y: best.y, z: best.z, dx, dy, dz, order: placements.length + 1 });
    if (u.weightKg !== null) weight += u.weightKg;
    addPoint(best.x + dx, best.y);
    addPoint(best.x, best.y + dy);
    addPoint(best.x, best.y);
    addPoint(best.x + dx, 0);
    addPoint(0, best.y + dy);
  }
  return { placements, unplacedIds: unplaced };
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export interface SolveOutput {
  arrangements: Arrangement[];
  attempts: number;
  stopReason: 'all_placed' | 'attempts_exhausted' | 'time_cap' | 'cancelled';
}

export interface SolveOptions {
  quick?: boolean;
  shouldCancel?: () => boolean;
}

const signature = (ps: Placement[]) =>
  ps.map((p) => `${p.unitId}@${p.x},${p.y},${p.z},${p.dx},${p.dy},${p.dz}`).sort().join(';');

export function solve(
  units: Unit[], eq: NormalizedEquipment, settings: Settings, opts: SolveOptions = {},
): SolveOutput {
  const shouldCancel = opts.shouldCancel ?? (() => false);
  const start = Date.now();
  const deadline = start + settings.maxMs;
  const minSupport = settings.minSupportPct / 100;
  const rng = mulberry32(settings.seed);
  const pool: { name: string; r: RunResult }[] = [];
  let attempts = 0;
  let allFound = false;
  const budget = opts.quick ? Math.min(2, settings.maxAttempts) : settings.maxAttempts;
  const strategies: Strategy[] = ['front-first', 'floor-first'];

  const attempt = (name: string, ordered: Unit[], strat: Strategy) => {
    attempts++;
    const r = runOnce(ordered, eq, strat, minSupport, deadline, shouldCancel);
    pool.push({ name: `${name} · ${strat === 'front-first' ? 'front-first' : 'floor-first'}`, r });
    if (r.unplacedIds.length === 0) allFound = true;
  };

  outer: for (const o of ORDERS) {
    const idx = new Map(units.map((u, i) => [u.id, i]));
    const ordered = [...units].sort((a, b) => cmp(o.key(a, idx.get(a.id)!), o.key(b, idx.get(b.id)!)) || (idx.get(a.id)! - idx.get(b.id)!));
    for (const s of strategies) {
      if (attempts >= budget) break outer;
      if (shouldCancel() || Date.now() > deadline) break outer;
      attempt(o.name, ordered, s);
    }
  }
  // Seeded perturbation search only while no complete plan exists.
  let k = 0;
  while (!allFound && attempts < budget && !shouldCancel() && Date.now() <= deadline) {
    const noisy = units.map((u) => ({ u, k: -vol(u) * (0.6 + 0.8 * rng()) }));
    noisy.sort((a, b) => a.k - b.k);
    attempt(`Seeded shuffle ${++k}`, noisy.map((n) => n.u), rng() < 0.5 ? 'front-first' : 'floor-first');
  }

  const stopReason: SolveOutput['stopReason'] = shouldCancel() ? 'cancelled'
    : allFound ? 'all_placed'
      : Date.now() > deadline ? 'time_cap' : 'attempts_exhausted';

  const extent = (ps: Placement[]) => ps.reduce((m, p) => Math.max(m, p.x + p.dx), 0);
  pool.sort((a, b) => a.r.unplacedIds.length - b.r.unplacedIds.length || extent(a.r.placements) - extent(b.r.placements));
  const seen = new Set<string>();
  const arrangements: Arrangement[] = [];
  for (const c of pool) {
    const sig = signature(c.r.placements);
    if (seen.has(sig)) continue;
    seen.add(sig);
    arrangements.push({ name: c.name, placements: c.r.placements, unplacedIds: c.r.unplacedIds });
    if (arrangements.length >= 3) break;
  }
  return { arrangements, attempts, stopReason };
}
