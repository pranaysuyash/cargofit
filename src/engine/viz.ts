/**
 * SVG scene builders. They read ONLY engine placements (never separate layout
 * state), so every drawn box is a solver/edit result. Output is a string so the
 * same code feeds the live UI and the exported report.
 */
import type { CargoRow, NormalizedEquipment, Placement } from './types';

export interface VizColor { fill: string; stroke: string; hue: number }

export function rowColors(rows: CargoRow[]): Map<string, VizColor> {
  const m = new Map<string, VizColor>();
  rows.forEach((r, i) => {
    const hue = (i * 47 + 25) % 360;
    m.set(r.uid, { hue, fill: `oklch(0.80 0.10 ${hue})`, stroke: `oklch(0.42 0.10 ${hue})` });
  });
  return m;
}

export interface VizCtx {
  eq: NormalizedEquipment;
  placements: Placement[];
  colors: Map<string, VizColor>;
  selectedId?: string | null;
  badIds?: Set<string>;
  /** show only the first N placements (loading sequence) */
  upTo?: number;
  rotation?: number;
  zoom?: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const n1 = (v: number) => Math.round(v * 10) / 10;
const INK = 'oklch(0.28 0.02 250)';
const DIM = 'oklch(0.50 0.02 250)';
const ACCENT = 'oklch(0.62 0.19 40)';

function visible(ctx: VizCtx): Placement[] {
  const ps = ctx.placements.slice().sort((a, b) => a.order - b.order);
  return ctx.upTo === undefined ? ps : ps.slice(0, ctx.upTo);
}

function tip(p: Placement, rowLabel?: string): string {
  return `<title>${esc(p.unitId)}${rowLabel ? '' : ''} · #${p.order}\n${Math.round(p.dx)}×${Math.round(p.dy)}×${Math.round(p.dz)} mm at (${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)})</title>`;
}

function itemAttrs(ctx: VizCtx, p: Placement): { fill: string; stroke: string; sw: number; extra: string } {
  const c = ctx.colors.get(p.rowUid) ?? { fill: '#ccc', stroke: '#555', hue: 0 };
  const sel = ctx.selectedId === p.unitId;
  const bad = ctx.badIds?.has(p.unitId);
  return {
    fill: c.fill,
    stroke: bad ? 'oklch(0.55 0.24 25)' : sel ? ACCENT : c.stroke,
    sw: sel || bad ? 3 : 1.2,
    extra: `${bad ? ' stroke-dasharray="6 3"' : ''}`,
  };
}

function dimLine(x1: number, y1: number, x2: number, y2: number, label: string, vertical = false): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const t = vertical
    ? `<text x="${mx - 8}" y="${my}" text-anchor="middle" transform="rotate(-90 ${mx - 8} ${my})" font-size="12" fill="${DIM}">${label}</text>`
    : `<text x="${mx}" y="${my - 6}" text-anchor="middle" font-size="12" fill="${DIM}">${label}</text>`;
  return `<g stroke="${DIM}" stroke-width="1"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1}" y1="${y1 - 4}" x2="${x1}" y2="${y1 + 4}"/><line x1="${x2}" y1="${y2 - 4}" x2="${x2}" y2="${y2 + 4}"/></g>${t}`;
}

const wrap = (w: number, h: number, body: string, label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n1(w)} ${n1(h)}" role="img" aria-label="${esc(label)}" font-family="Instrument Sans, system-ui, sans-serif" style="width:100%;height:100%">${body}</svg>`;

/** Plan view: x = along length (door at right), y = across width. */
export function renderTop(ctx: VizCtx): string {
  const { eq } = ctx;
  const M = 44;
  const W = 1000;
  const s = (W - 2 * M) / eq.L;
  const H = eq.W * s + 2 * M;
  const items = visible(ctx).slice().sort((a, b) => a.z - b.z);
  let body = `<rect x="${M}" y="${M}" width="${n1(eq.L * s)}" height="${n1(eq.W * s)}" fill="oklch(0.985 0.004 250)" stroke="${INK}" stroke-width="2"/>`;
  for (const p of items) {
    const a = itemAttrs(ctx, p);
    const x = M + p.x * s;
    const y = M + p.y * s;
    const w = p.dx * s;
    const h = p.dy * s;
    const raised = p.z > 0.5;
    body += `<g class="pi" data-uid="${esc(p.unitId)}" tabindex="-1">${tip(p)}<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${a.fill}" fill-opacity="${raised ? 0.9 : 0.75}" stroke="${a.stroke}" stroke-width="${a.sw}"${a.extra}/>`;
    if (w > 26 && h > 16) {
      body += `<text x="${n1(x + w / 2)}" y="${n1(y + h / 2 + 4)}" text-anchor="middle" font-size="${Math.min(13, Math.max(9, w / 7))}" fill="${INK}" pointer-events="none">${p.order}${raised ? '↑' : ''}</text>`;
    }
    body += '</g>';
  }
  // door on the right wall
  body += `<line x1="${n1(M + eq.L * s)}" y1="${M}" x2="${n1(M + eq.L * s)}" y2="${n1(M + eq.W * s)}" stroke="${ACCENT}" stroke-width="5"/>`;
  body += `<text x="${n1(M + eq.L * s - 6)}" y="${M - 8}" text-anchor="end" font-size="12" fill="${ACCENT}" font-weight="600">DOOR →</text>`;
  body += `<text x="${M}" y="${M - 8}" font-size="12" fill="${DIM}">FRONT WALL</text>`;
  body += dimLine(M, H - 18, M + eq.L * s, H - 18, `${Math.round(eq.L)} mm`);
  body += dimLine(14, M, 14, M + eq.W * s, `${Math.round(eq.W)} mm`, true);
  return wrap(W, H, body, 'Top-down plan view of the loading space');
}

/** Side elevation: x along length, z up. Items nearest the viewer (smaller y) are drawn last. */
export function renderSide(ctx: VizCtx): string {
  const { eq } = ctx;
  const M = 44;
  const W = 1000;
  const s = (W - 2 * M) / eq.L;
  const H = eq.H * s + 2 * M;
  const items = visible(ctx).slice().sort((a, b) => b.y - a.y);
  let body = `<rect x="${M}" y="${M}" width="${n1(eq.L * s)}" height="${n1(eq.H * s)}" fill="oklch(0.985 0.004 250)" stroke="${INK}" stroke-width="2"/>`;
  if (eq.doorH !== null) {
    body += `<line x1="${n1(M + eq.L * s)}" y1="${n1(M + eq.H * s - eq.doorH * s)}" x2="${n1(M + eq.L * s)}" y2="${n1(M + eq.H * s)}" stroke="${ACCENT}" stroke-width="5"/>`;
  }
  for (const p of items) {
    const a = itemAttrs(ctx, p);
    const x = M + p.x * s;
    const y = M + (eq.H - p.z - p.dz) * s;
    body += `<g class="pi" data-uid="${esc(p.unitId)}">${tip(p)}<rect x="${n1(x)}" y="${n1(y)}" width="${n1(p.dx * s)}" height="${n1(p.dz * s)}" fill="${a.fill}" fill-opacity="0.8" stroke="${a.stroke}" stroke-width="${a.sw}"${a.extra}/>`;
    if (p.dx * s > 26 && p.dz * s > 16) body += `<text x="${n1(x + (p.dx * s) / 2)}" y="${n1(y + (p.dz * s) / 2 + 4)}" text-anchor="middle" font-size="11" fill="${INK}" pointer-events="none">${p.order}</text>`;
    body += '</g>';
  }
  body += dimLine(M, H - 18, M + eq.L * s, H - 18, `${Math.round(eq.L)} mm`);
  body += dimLine(14, M, 14, M + eq.H * s, `${Math.round(eq.H)} mm`, true);
  body += `<text x="${M + 4}" y="${M - 8}" font-size="12" fill="${DIM}">SIDE ELEVATION · door at right</text>`;
  return wrap(W, H, body, 'Side elevation of the loading space');
}

function rot(x: number, y: number, r: number, L: number, Wd: number): [number, number] {
  switch (((r % 4) + 4) % 4) {
    case 1: return [y, L - x];
    case 2: return [L - x, Wd - y];
    case 3: return [Wd - y, x];
    default: return [x, y];
  }
}

/** Isometric view, 4 selectable yaw angles. Painter's order by rotated centre depth. */
export function renderIso(ctx: VizCtx): string {
  const { eq } = ctx;
  const r = ctx.rotation ?? 0;
  const c30 = Math.cos(Math.PI / 6);
  const s30 = 0.5;
  const Lr = r % 2 ? eq.W : eq.L;
  const Wr = r % 2 ? eq.L : eq.W;
  // fit
  const span = (Lr + Wr) * c30;
  const hSpan = (Lr + Wr) * s30 + eq.H;
  const W = 1000;
  const s = ((W - 80) / span) * (ctx.zoom ?? 1);
  const H = Math.max(420, hSpan * s + 100);
  const ox = W / 2 - ((Lr - Wr) / 2) * c30 * s;
  const oy = 50 + eq.H * s;
  const P = (x: number, y: number, z: number): string => `${n1(ox + (x - y) * c30 * s)},${n1(oy + (x + y) * s30 * s - z * s)}`;

  let body = '';
  const poly = (pts: string[], fill: string, stroke: string, sw = 1, extra = '') => `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${extra}/>`;
  // floor + two back walls
  body += poly([P(0, 0, 0), P(Lr, 0, 0), P(Lr, Wr, 0), P(0, Wr, 0)], 'oklch(0.97 0.006 250)', INK, 1.5);
  body += poly([P(0, 0, 0), P(0, Wr, 0), P(0, Wr, eq.H), P(0, 0, eq.H)], 'oklch(0.95 0.008 250)', DIM, 1);
  body += poly([P(0, 0, 0), P(Lr, 0, 0), P(Lr, 0, eq.H), P(0, 0, eq.H)], 'oklch(0.93 0.008 250)', DIM, 1);

  const items = visible(ctx).map((p) => {
    const [x1, y1] = rot(p.x, p.y, r, eq.L, eq.W);
    const [x2, y2] = rot(p.x + p.dx, p.y + p.dy, r, eq.L, eq.W);
    const a = Math.min(x1, x2), b = Math.max(x1, x2), c = Math.min(y1, y2), d = Math.max(y1, y2);
    return { p, a, b, c, d, key: (a + b) / 2 + (c + d) / 2 + (p.z + p.dz / 2) * 0.01 + p.z * 0.0001 };
  }).sort((u, v) => u.key - v.key);

  for (const { p, a, b, c, d } of items) {
    const at = itemAttrs(ctx, p);
    const z0 = p.z, z1 = p.z + p.dz;
    const hue = ctx.colors.get(p.rowUid)?.hue ?? 0;
    const top = at.fill;
    const left = `oklch(0.66 0.10 ${hue})`;
    const right = `oklch(0.72 0.10 ${hue})`;
    body += `<g class="pi" data-uid="${esc(p.unitId)}">${tip(p)}`;
    body += poly([P(a, d, z0), P(b, d, z0), P(b, d, z1), P(a, d, z1)], left, at.stroke, at.sw, at.extra);
    body += poly([P(b, c, z0), P(b, d, z0), P(b, d, z1), P(b, c, z1)], right, at.stroke, at.sw, at.extra);
    body += poly([P(a, c, z1), P(b, c, z1), P(b, d, z1), P(a, d, z1)], top, at.stroke, at.sw, at.extra);
    body += '</g>';
  }
  // door edge (original x = L)
  const [dx1, dy1] = rot(eq.L, 0, r, eq.L, eq.W);
  const [dx2, dy2] = rot(eq.L, eq.W, r, eq.L, eq.W);
  body += `<polyline points="${P(dx1, dy1, 0)} ${P(dx2, dy2, 0)}" fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round"/>`;
  const mid = P((dx1 + dx2) / 2, (dy1 + dy2) / 2, 0).split(',');
  body += `<text x="${mid[0]}" y="${Number(mid[1]) + 22}" text-anchor="middle" font-size="12" font-weight="600" fill="${ACCENT}">DOOR</text>`;
  return wrap(W, H, body, 'Isometric view of the loading plan');
}
