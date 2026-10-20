/**
 * SVG scene builders. They read ONLY engine placements (never separate layout
 * state), so every drawn box is a solver/edit result. Output is a string so the
 * same code feeds the live UI and the exported report.
 */
import type { CargoRow, NormalizedEquipment, Placement, Unit } from './types';

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
  /** Hovered unit ID for cross-highlighting from table to 3D canvas */
  hoveredId?: string | null;
  badIds?: Set<string>;
  /** show only the first N placements (loading sequence) */
  upTo?: number;
  rotation?: number;
  zoom?: number;
  xray?: boolean;
  showGrid?: boolean;
  filterRowUid?: string | null;
  /** Radial exploded assembly ratio [0, 1] */
  explode?: number;
  /** Longitudinal cutaway depth ratio [0, 1] (items beyond cut are ghosted) */
  sliceX?: number | null;
  /** Technical Prussian blueprint rendering mode */
  blueprint?: boolean;
  /** Show Center of Gravity 3D plumb-bob and target reticle */
  showCoG?: boolean;
  /** Physical units for computing weight-based CoG */
  units?: Unit[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const n1 = (v: number) => Math.round(v * 10) / 10;
const INK = 'oklch(0.28 0.02 250)';
const DIM = 'oklch(0.50 0.02 250)';
const ACCENT = 'oklch(0.62 0.19 40)';
const GRID_LINE = 'oklch(0.88 0.015 250)';

function visible(ctx: VizCtx): Placement[] {
  const ps = ctx.placements.slice().sort((a, b) => a.order - b.order);
  const filtered = ctx.filterRowUid ? ps.filter((p) => p.rowUid === ctx.filterRowUid) : ps;
  return ctx.upTo === undefined ? filtered : filtered.slice(0, ctx.upTo);
}

function tip(p: Placement): string {
  return `<title>${esc(p.unitId)} · #${p.order}\n${Math.round(p.dx)}×${Math.round(p.dy)}×${Math.round(p.dz)} mm at (${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)})</title>`;
}

function itemAttrs(ctx: VizCtx, p: Placement): { fill: string; stroke: string; sw: number; extra: string; opacity: number } {
  const c = ctx.colors.get(p.rowUid) ?? { fill: '#ccc', stroke: '#555', hue: 0 };
  const sel = ctx.selectedId === p.unitId;
  const hov = ctx.hoveredId === p.unitId && !sel;
  const bad = ctx.badIds?.has(p.unitId);
  const isDimmed = ctx.filterRowUid && p.rowUid !== ctx.filterRowUid;
  
  let opacity = 0.88;
  if (ctx.xray && !sel && !bad && !hov) opacity = 0.28;
  if (isDimmed && !hov) opacity = 0.15;
  if (sel || hov) opacity = 1.0;

  return {
    fill: c.fill,
    stroke: bad ? 'oklch(0.55 0.24 25)' : sel ? ACCENT : hov ? 'oklch(0.70 0.19 145)' : c.stroke,
    sw: sel ? 3.5 : hov ? 2.8 : bad ? 2.5 : 1.2,
    extra: bad ? ' stroke-dasharray="6 3"' : '',
    opacity,
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
  
  // Floor grid lines
  if (ctx.showGrid !== false) {
    const gridStep = eq.L > 8000 ? 1000 : 500;
    for (let gx = gridStep; gx < eq.L; gx += gridStep) {
      body += `<line x1="${n1(M + gx * s)}" y1="${M}" x2="${n1(M + gx * s)}" y2="${n1(M + eq.W * s)}" stroke="${GRID_LINE}" stroke-width="1" stroke-dasharray="3 3"/>`;
      body += `<text x="${n1(M + gx * s)}" y="${M + eq.W * s + 14}" text-anchor="middle" font-size="10" font-family="JetBrains Mono" fill="${DIM}">${gx / 1000}m</text>`;
    }
  }

  for (const p of items) {
    const a = itemAttrs(ctx, p);
    const x = M + p.x * s;
    const y = M + p.y * s;
    const w = p.dx * s;
    const h = p.dy * s;
    const raised = p.z > 0.5;
    body += `<g class="pi" data-uid="${esc(p.unitId)}" tabindex="-1">${tip(p)}<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${a.fill}" fill-opacity="${a.opacity}" stroke="${a.stroke}" stroke-width="${a.sw}"${a.extra}/>`;
    if (w > 26 && h > 16) {
      body += `<text x="${n1(x + w / 2)}" y="${n1(y + h / 2 + 4)}" text-anchor="middle" font-size="${Math.min(13, Math.max(9, w / 7))}" fill="${INK}" pointer-events="none">${p.order}${raised ? '↑' : ''}</text>`;
    }
    body += '</g>';
  }
  // door on the right wall
  body += `<line x1="${n1(M + eq.L * s)}" y1="${M}" x2="${n1(M + eq.L * s)}" y2="${n1(M + eq.W * s)}" stroke="${ACCENT}" stroke-width="5"/>`;
  body += `<text x="${n1(M + eq.L * s - 6)}" y="${M - 8}" text-anchor="end" font-size="12" fill="${ACCENT}" font-weight="600">DOOR →</text>`;
  body += `<text x="${M}" y="${M - 8}" font-size="12" fill="${DIM}">FRONT WALL</text>`;
  body += dimLine(M, H - 24, M + eq.L * s, H - 24, `${Math.round(eq.L)} mm`);
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
  
  // Floor & height grid lines
  if (ctx.showGrid !== false) {
    const gridStep = eq.L > 8000 ? 1000 : 500;
    for (let gx = gridStep; gx < eq.L; gx += gridStep) {
      body += `<line x1="${n1(M + gx * s)}" y1="${M}" x2="${n1(M + gx * s)}" y2="${n1(M + eq.H * s)}" stroke="${GRID_LINE}" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
  }

  if (eq.doorH !== null) {
    body += `<line x1="${n1(M + eq.L * s)}" y1="${n1(M + eq.H * s - eq.doorH * s)}" x2="${n1(M + eq.L * s)}" y2="${n1(M + eq.H * s)}" stroke="${ACCENT}" stroke-width="5"/>`;
  }
  for (const p of items) {
    const a = itemAttrs(ctx, p);
    const x = M + p.x * s;
    const y = M + (eq.H - p.z - p.dz) * s;
    body += `<g class="pi" data-uid="${esc(p.unitId)}">${tip(p)}<rect x="${n1(x)}" y="${n1(y)}" width="${n1(p.dx * s)}" height="${n1(p.dz * s)}" fill="${a.fill}" fill-opacity="${a.opacity}" stroke="${a.stroke}" stroke-width="${a.sw}"${a.extra}/>`;
    if (p.dx * s > 26 && p.dz * s > 16) body += `<text x="${n1(x + (p.dx * s) / 2)}" y="${n1(y + (p.dz * s) / 2 + 4)}" text-anchor="middle" font-size="11" fill="${INK}" pointer-events="none">${p.order}</text>`;
    body += '</g>';
  }
  body += dimLine(M, H - 24, M + eq.L * s, H - 24, `${Math.round(eq.L)} mm`);
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

/** Isometric view, 4 selectable yaw angles. Painter's order by rotated centre depth with volumetric bevels, drop shadows, exploded views, longitudinal cutaways, and CoG overlays. */
export function renderIso(ctx: VizCtx): string {
  const { eq } = ctx;
  const r = ctx.rotation ?? 0;
  const isBp = Boolean(ctx.blueprint);
  const c30 = Math.cos(Math.PI / 6);
  const s30 = 0.5;
  const Lr = r % 2 ? eq.W : eq.L;
  const Wr = r % 2 ? eq.L : eq.W;
  
  // Theme constants
  const floorBg = isBp ? '#0c1a2f' : 'oklch(0.97 0.006 250)';
  const wallBgL = isBp ? '#0f2442' : 'oklch(0.95 0.008 250)';
  const wallBgR = isBp ? '#0a1628' : 'oklch(0.93 0.008 250)';
  const frameStroke = isBp ? '#38bdf8' : INK;
  const gridStroke = isBp ? 'rgba(56, 189, 248, 0.22)' : GRID_LINE;
  const dimColor = isBp ? '#7dd3fc' : DIM;
  const textFill = isBp ? '#f8fafc' : INK;

  // Fit viewport
  const span = (Lr + Wr) * c30;
  const hSpan = (Lr + Wr) * s30 + eq.H;
  const W = 1000;
  const s = ((W - 80) / span) * (ctx.zoom ?? 1);
  const H = Math.max(460, hSpan * s + 130);
  const ox = W / 2 - ((Lr - Wr) / 2) * c30 * s;
  const oy = 60 + eq.H * s;
  const P = (x: number, y: number, z: number): string => `${n1(ox + (x - y) * c30 * s)},${n1(oy + (x + y) * s30 * s - z * s)}`;

  let body = '';
  if (isBp) {
    body += `<rect width="${W}" height="${H}" fill="#08101e"/>`;
  }

  const poly = (pts: string[], fill: string, stroke: string, sw = 1, extra = '', opacity = 1.0) =>
    `<polygon points="${pts.join(' ')}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${extra}/>`;

  // 1. Floor & Back Walls
  body += poly([P(0, 0, 0), P(Lr, 0, 0), P(Lr, Wr, 0), P(0, Wr, 0)], floorBg, frameStroke, 1.5);
  body += poly([P(0, 0, 0), P(0, Wr, 0), P(0, Wr, eq.H), P(0, 0, eq.H)], wallBgL, dimColor, 1);
  body += poly([P(0, 0, 0), P(Lr, 0, 0), P(Lr, 0, eq.H), P(0, 0, eq.H)], wallBgR, dimColor, 1);

  // 2. Isometric Floor Grid Lines
  if (ctx.showGrid !== false) {
    const gridStep = 1000;
    // Length grid
    for (let gx = gridStep; gx < Lr; gx += gridStep) {
      body += `<polyline points="${P(gx, 0, 0)} ${P(gx, Wr, 0)}" fill="none" stroke="${gridStroke}" stroke-width="1" stroke-dasharray="3 3"/>`;
      body += `<text x="${P(gx, 0, 0).split(',')[0]}" y="${Number(P(gx, 0, 0).split(',')[1]) + 12}" font-size="9" font-family="JetBrains Mono" fill="${dimColor}" text-anchor="middle">${gx / 1000}m</text>`;
    }
    // Width grid
    for (let gy = gridStep; gy < Wr; gy += gridStep) {
      body += `<polyline points="${P(0, gy, 0)} ${P(Lr, gy, 0)}" fill="none" stroke="${gridStroke}" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
  }

  // 3. Optimal Wheelbase Target Zone (45% to 55% of L) on the floor
  if (ctx.showCoG !== false && eq.L >= 4000) {
    const [optX1a, optY1a] = rot(eq.L * 0.45, 0, r, eq.L, eq.W);
    const [optX2a, optY2a] = rot(eq.L * 0.55, eq.W, r, eq.L, eq.W);
    const minOx = Math.min(optX1a, optX2a), maxOx = Math.max(optX1a, optX2a);
    const minOy = Math.min(optY1a, optY2a), maxOy = Math.max(optY1a, optY2a);
    body += poly([P(minOx, minOy, 0), P(maxOx, minOy, 0), P(maxOx, maxOy, 0), P(minOx, maxOy, 0)],
      'oklch(0.55 0.12 145)', 'oklch(0.50 0.14 145)', 1, ' stroke-dasharray="4 2"', 0.12);
    const optMid = P((minOx + maxOx) / 2, (minOy + maxOy) / 2, 0).split(',');
    body += `<text x="${optMid[0]}" y="${Number(optMid[1]) + 4}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" font-weight="600" fill="oklch(0.48 0.14 145)" letter-spacing="0.05em">OPTIMAL CoG TARGET (45-55% L)</text>`;
  }

  // 4. Longitudinal Cutaway (sliceX) plane marker if active
  const sliceRatio = ctx.sliceX !== undefined && ctx.sliceX !== null ? Math.max(0, Math.min(1, ctx.sliceX)) : null;
  const cutX = sliceRatio !== null ? eq.L * sliceRatio : null;
  if (cutX !== null && cutX < eq.L) {
    const [c1x, c1y] = rot(cutX, 0, r, eq.L, eq.W);
    const [c2x, c2y] = rot(cutX, eq.W, r, eq.L, eq.W);
    const minCx = Math.min(c1x, c2x), maxCx = Math.max(c1x, c2x);
    const minCy = Math.min(c1y, c2y), maxCy = Math.max(c1y, c2y);
    body += poly([P(minCx, minCy, 0), P(maxCx, maxCy, 0), P(maxCx, maxCy, eq.H), P(minCx, minCy, eq.H)],
      ACCENT, ACCENT, 1.5, ' stroke-dasharray="5 3"', 0.08);
  }

  // 5. Explode parameters
  const kExp = ctx.explode ? Math.max(0, Math.min(1, ctx.explode)) : 0;
  const cx = eq.L / 2;
  const cy = eq.W / 2;

  // 6. Visible placements with exploded offsets
  const vis = visible(ctx);

  // Compute composite CoG
  let totalW = 0, sumWX = 0, sumWY = 0, sumWZ = 0;
  const unitMap = ctx.units ? new Map(ctx.units.map((u) => [u.id, u])) : null;
  for (const p of vis) {
    const uW = unitMap?.get(p.unitId)?.weightKg ?? (p.dx * p.dy * p.dz) / 1e6;
    totalW += uW;
    sumWX += uW * (p.x + p.dx / 2);
    sumWY += uW * (p.y + p.dy / 2);
    sumWZ += uW * (p.z + p.dz / 2);
  }
  const hasCoG = totalW > 0;
  const cogX = hasCoG ? sumWX / totalW : null;
  const cogY = hasCoG ? sumWY / totalW : null;
  const cogZ = hasCoG ? sumWZ / totalW : null;

  // Compute items with exploded coordinates
  const items = vis.map((p) => {
    const expDx = kExp > 0 ? (p.x + p.dx / 2 - cx) * kExp * 0.35 : 0;
    const expDy = kExp > 0 ? (p.y + p.dy / 2 - cy) * kExp * 0.45 : 0;
    const expDz = kExp > 0 ? (p.z + p.dz / 2) * kExp * 0.30 : 0;

    const effX = p.x + expDx;
    const effY = p.y + expDy;
    const effZ = p.z + expDz;

    const [x1, y1] = rot(effX, effY, r, eq.L, eq.W);
    const [x2, y2] = rot(effX + p.dx, effY + p.dy, r, eq.L, eq.W);
    const a = Math.min(x1, x2), b = Math.max(x1, x2), c = Math.min(y1, y2), d = Math.max(y1, y2);

    const [ux1, uy1] = rot(p.x, p.y, r, eq.L, eq.W);
    const [ux2, uy2] = rot(p.x + p.dx, p.y + p.dy, r, eq.L, eq.W);
    const ua = Math.min(ux1, ux2), ub = Math.max(ux1, ux2), uc = Math.min(uy1, uy2), ud = Math.max(uy1, uy2);

    const isCut = cutX !== null && p.x > cutX;

    return {
      p, a, b, c, d, z0: effZ, z1: effZ + p.dz,
      ua, ub, uc, ud,
      isCut,
      key: (a + b) / 2 + (c + d) / 2 + (effZ + p.dz / 2) * 0.01 + effZ * 0.0001,
      expDx, expDy, expDz,
    };
  }).sort((u, v) => u.key - v.key);

  // 7. Floor drop shadows (at true base)
  for (const { ua, ub, uc, ud, isCut } of items) {
    if (isCut) continue;
    const shadowOpacity = isBp ? 0.25 : 0.09;
    const shadowFill = isBp ? '#040912' : 'oklch(0.2 0.02 250)';
    body += poly([P(ua, uc, 0), P(ub, uc, 0), P(ub, ud, 0), P(ua, ud, 0)], shadowFill, 'none', 0, '', shadowOpacity);
  }

  // 8. Render boxes
  for (const item of items) {
    const { p, a, b, c, d, z0, z1, isCut, expDx, expDy, expDz } = item;
    const at = itemAttrs(ctx, p);
    const hue = ctx.colors.get(p.rowUid)?.hue ?? 0;
    const isSelected = ctx.selectedId === p.unitId;

    let faceOpacity = at.opacity;
    let strokeColor = at.stroke;
    let strokeWidth = at.sw;
    let strokeDash = at.extra;

    if (isCut) {
      faceOpacity = isBp ? 0.05 : 0.08;
      strokeColor = isBp ? '#38bdf8' : DIM;
      strokeWidth = 1;
      strokeDash = ' stroke-dasharray="3 3"';
    }

    let top = at.fill;
    let left = `oklch(0.70 0.10 ${hue})`;
    let right = `oklch(0.60 0.10 ${hue})`;

    if (isBp) {
      top = `oklch(0.35 0.08 ${hue})`;
      left = `oklch(0.28 0.07 ${hue})`;
      right = `oklch(0.22 0.06 ${hue})`;
      if (!isSelected && !ctx.badIds?.has(p.unitId)) {
        strokeColor = '#38bdf8';
      }
    }

    // Exploded guide line from true floor position to exploded position
    if (kExp > 0 && (Math.abs(expDx) > 1 || Math.abs(expDy) > 1 || Math.abs(expDz) > 1)) {
      const origMid = P((item.ua + item.ub) / 2, (item.uc + item.ud) / 2, p.z);
      const expMid = P((a + b) / 2, (c + d) / 2, z0);
      body += `<line x1="${origMid.split(',')[0]}" y1="${origMid.split(',')[1]}" x2="${expMid.split(',')[0]}" y2="${expMid.split(',')[1]}" stroke="${dimColor}" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>`;
    }

    body += `<g class="pi" data-uid="${esc(p.unitId)}" style="transition: transform 0.15s ease;">${tip(p)}`;

    // Left face
    body += poly([P(a, d, z0), P(b, d, z0), P(b, d, z1), P(a, d, z1)], left, strokeColor, strokeWidth, strokeDash, faceOpacity);
    // Right face
    body += poly([P(b, c, z0), P(b, d, z0), P(b, d, z1), P(b, c, z1)], right, strokeColor, strokeWidth, strokeDash, faceOpacity);
    // Top face
    body += poly([P(a, c, z1), P(b, c, z1), P(b, d, z1), P(a, d, z1)], top, strokeColor, strokeWidth, strokeDash, faceOpacity);

    // Specular highlight micro-bevel on top-front edges
    if (!isCut && faceOpacity > 0.4) {
      const p1 = P(a, d, z1).split(',');
      const p2 = P(b, d, z1).split(',');
      body += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${isBp ? '#7dd3fc' : 'white'}" stroke-width="1.2" stroke-opacity="0.45"/>`;
    }

    // Number tag and raised badge on top face
    const topMid = P((a + b) / 2, (c + d) / 2, z1).split(',');
    const bw = (b - a) * s;
    const bd = (d - c) * s;
    if (bw > 20 && bd > 14 && !isCut) {
      const tx = Number(topMid[0]);
      const ty = Number(topMid[1]);
      body += `<rect x="${n1(tx - 11)}" y="${n1(ty - 7)}" width="22" height="14" rx="3" fill="${isBp ? 'rgba(8, 16, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)'}" stroke="${isBp ? 'rgba(56, 189, 248, 0.4)' : 'rgba(0, 0, 0, 0.15)'}" stroke-width="0.5"/>`;
      body += `<text x="${n1(tx)}" y="${n1(ty + 3.5)}" text-anchor="middle" font-size="${Math.min(12, Math.max(9, bw / 7))}" font-family="JetBrains Mono" font-weight="700" fill="${textFill}" pointer-events="none">${p.order}${p.z > 0.5 ? '↑' : ''}</text>`;
    }

    // Selected item: projection lines to floor bed
    if (isSelected && z0 > 0.5) {
      body += `<polyline points="${P(a, c, z0)} ${P(a, c, 0)}" stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      body += `<polyline points="${P(b, c, z0)} ${P(b, c, 0)}" stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      body += `<polyline points="${P(b, d, z0)} ${P(b, d, 0)}" stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      body += `<polyline points="${P(a, d, z0)} ${P(a, d, 0)}" stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      body += poly([P(a, c, 0), P(b, c, 0), P(b, d, 0), P(a, d, 0)], 'none', ACCENT, 2, ' stroke-dasharray="4 2"');
    }

    body += '</g>';
  }

  // 9. Center of Gravity (CoG) 3D Marker & Plumb-Bob
  if (ctx.showCoG !== false && cogX !== null && cogY !== null && cogZ !== null) {
    const [cgXr, cgYr] = rot(cogX, cogY, r, eq.L, eq.W);
    const floorPt = P(cgXr, cgYr, 0).split(',');
    const cog3dPt = P(cgXr, cgYr, cogZ).split(',');
    const fx = Number(floorPt[0]), fy = Number(floorPt[1]);
    const cx = Number(cog3dPt[0]), cy = Number(cog3dPt[1]);

    body += `<g class="cog-indicator" pointer-events="none">`;
    body += `<line x1="${n1(fx)}" y1="${n1(fy)}" x2="${n1(cx)}" y2="${n1(cy)}" stroke="oklch(0.65 0.22 45)" stroke-width="2" stroke-dasharray="4 3"/>`;
    body += `<circle cx="${n1(fx)}" cy="${n1(fy)}" r="10" fill="none" stroke="oklch(0.65 0.22 45)" stroke-width="1.5"/>`;
    body += `<circle cx="${n1(fx)}" cy="${n1(fy)}" r="4" fill="oklch(0.65 0.22 45)"/>`;
    body += `<line x1="${n1(fx - 14)}" y1="${n1(fy)}" x2="${n1(fx + 14)}" y2="${n1(fy)}" stroke="oklch(0.65 0.22 45)" stroke-width="1"/>`;
    body += `<line x1="${n1(fx)}" y1="${n1(fy - 14)}" x2="${n1(fx)}" y2="${n1(fy + 14)}" stroke="oklch(0.65 0.22 45)" stroke-width="1"/>`;

    body += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="8" fill="oklch(0.65 0.22 45)" stroke="white" stroke-width="2"/>`;
    body += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="3" fill="white"/>`;

    const cogPct = Math.round((100 * cogX) / eq.L);
    body += `<rect x="${n1(cx + 12)}" y="${n1(cy - 12)}" width="114" height="22" rx="4" fill="${isBp ? 'rgba(8, 16, 30, 0.92)' : 'rgba(255, 255, 255, 0.92)'}" stroke="oklch(0.65 0.22 45)" stroke-width="1"/>`;
    body += `<text x="${n1(cx + 18)}" y="${n1(cy + 3)}" font-size="10" font-family="JetBrains Mono" font-weight="700" fill="oklch(0.65 0.22 45)">CoG: ${cogPct}% L</text>`;
    body += `</g>`;
  }

  // 10. Door edge marker (original x = L)
  const [dx1, dy1] = rot(eq.L, 0, r, eq.L, eq.W);
  const [dx2, dy2] = rot(eq.L, eq.W, r, eq.L, eq.W);
  body += `<polyline points="${P(dx1, dy1, 0)} ${P(dx2, dy2, 0)}" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round"/>`;
  const mid = P((dx1 + dx2) / 2, (dy1 + dy2) / 2, 0).split(',');
  body += `<text x="${mid[0]}" y="${Number(mid[1]) + 24}" text-anchor="middle" font-size="12" font-weight="700" fill="${ACCENT}">DOOR ENTRY →</text>`;

  return wrap(W, H, body, 'Isometric view of the loading plan');
}

export interface Cargo3DCtx {
  length: number;
  width: number;
  height: number;
  stackable: boolean;
  rotation: 'fixed' | 'upright' | 'any';
  hue?: number;
  yawDeg?: number;
  label?: string;
  weightKg?: number | null;
}

/** Render a single cargo item in focused 3D isometric preview */
export function renderCargo3D(ctx: Cargo3DCtx): string {
  const { length: L, width: W, height: H, stackable, hue = 210 } = ctx;
  const yaw = (ctx.yawDeg ?? 35) * (Math.PI / 180);
  const pitch = 30 * (Math.PI / 180);
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

  const Wv = 400, Hv = 300;
  // Bounding scale
  const maxDim = Math.max(L, W, H, 1);
  const s = 140 / maxDim;
  const ox = Wv / 2, oy = Hv / 2 + (H * s) / 4;

  const project = (x: number, y: number, z: number): [number, number] => {
    // Center at (0, 0, 0)
    const cx = (x - L / 2) * s;
    const cy = (y - W / 2) * s;
    const cz = z * s;
    const rx = cx * cosY - cy * sinY;
    const ry = cx * sinY + cy * cosY;
    const sx = ox + rx;
    const sy = oy + ry * sinP - cz * cosP;
    return [Math.round(sx * 10) / 10, Math.round(sy * 10) / 10];
  };

  const pstr = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

  const p000 = project(0, 0, 0);
  const p100 = project(L, 0, 0);
  const p110 = project(L, W, 0);
  const p010 = project(0, W, 0);
  const p001 = project(0, 0, H);
  const p101 = project(L, 0, H);
  const p111 = project(L, W, H);
  const p011 = project(0, W, H);

  let body = '';
  // Floor drop shadow
  body += `<polygon points="${pstr([p000, p100, p110, p010])}" fill="oklch(0.2 0.02 250)" fill-opacity="0.1" stroke="none"/>`;

  // Left face
  body += `<polygon points="${pstr([p000, p010, p011, p001])}" fill="oklch(0.72 0.12 ${hue})" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
  // Front face
  body += `<polygon points="${pstr([p010, p110, p111, p011])}" fill="oklch(0.64 0.12 ${hue})" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
  // Top face
  const topFill = stackable ? `oklch(0.85 0.12 ${hue})` : `oklch(0.88 0.08 30)`;
  body += `<polygon points="${pstr([p001, p101, p111, p011])}" fill="${topFill}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;

  // Top face pattern: green grid for stackable, warning hatch for no-stack
  if (!stackable) {
    body += `<line x1="${p001[0]}" y1="${p001[1]}" x2="${p111[0]}" y2="${p111[1]}" stroke="oklch(0.45 0.22 25)" stroke-width="2" stroke-dasharray="4 4"/>`;
    body += `<line x1="${p101[0]}" y1="${p101[1]}" x2="${p011[0]}" y2="${p011[1]}" stroke="oklch(0.45 0.22 25)" stroke-width="2" stroke-dasharray="4 4"/>`;
  }

  // Dimension labels
  body += `<text x="${(p010[0] + p110[0]) / 2}" y="${(p010[1] + p110[1]) / 2 + 16}" font-size="11" font-family="JetBrains Mono" fill="${INK}" text-anchor="middle" font-weight="600">L: ${Math.round(L)}mm</text>`;
  body += `<text x="${(p110[0] + p111[0]) / 2 + 14}" y="${(p110[1] + p111[1]) / 2}" font-size="11" font-family="JetBrains Mono" fill="${INK}" text-anchor="start" font-weight="600">H: ${Math.round(H)}mm</text>`;
  body += `<text x="${(p000[0] + p010[0]) / 2 - 14}" y="${(p000[1] + p010[1]) / 2}" font-size="11" font-family="JetBrains Mono" fill="${INK}" text-anchor="end" font-weight="600">W: ${Math.round(W)}mm</text>`;

  // Center of mass glyph on top
  const topC = project(L / 2, W / 2, H);
  body += `<circle cx="${topC[0]}" cy="${topC[1]}" r="4" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
  body += `<circle cx="${topC[0]}" cy="${topC[1]}" r="1.5" fill="${INK}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wv} ${Hv}" role="img" aria-label="3D preview of cargo item" style="width:100%;height:auto;max-height:220px;display:block">${body}</svg>`;
}

export interface Equipment3DCtx {
  eq: NormalizedEquipment;
}

/** Render a single equipment bay in focused 3D isometric wireframe & bottleneck preview */
export function renderEquipment3D(ctx: Equipment3DCtx): string {
  const { eq } = ctx;
  const Wv = 440, Hv = 260;
  const c30 = Math.cos(Math.PI / 6);
  const s30 = 0.5;
  const span = (eq.L + eq.W) * c30;
  const s = (Wv - 60) / span;
  const ox = Wv / 2 - ((eq.L - eq.W) / 2) * c30 * s;
  const oy = 40 + eq.H * s;
  const P = (x: number, y: number, z: number): [number, number] => [
    Math.round((ox + (x - y) * c30 * s) * 10) / 10,
    Math.round((oy + (x + y) * s30 * s - z * s) * 10) / 10,
  ];
  const pstr = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

  let body = '';
  // Floor
  body += `<polygon points="${pstr([P(0, 0, 0), P(eq.L, 0, 0), P(eq.L, eq.W, 0), P(0, eq.W, 0)])}" fill="oklch(0.97 0.006 250)" stroke="${INK}" stroke-width="1.5"/>`;
  // Front bulkhead wall (x = 0)
  body += `<polygon points="${pstr([P(0, 0, 0), P(0, eq.W, 0), P(0, eq.W, eq.H), P(0, 0, eq.H)])}" fill="oklch(0.94 0.01 250)" fill-opacity="0.7" stroke="${DIM}" stroke-width="1"/>`;
  // Left wall (y = 0)
  body += `<polygon points="${pstr([P(0, 0, 0), P(eq.L, 0, 0), P(eq.L, 0, eq.H), P(0, 0, eq.H)])}" fill="oklch(0.92 0.01 250)" fill-opacity="0.5" stroke="${DIM}" stroke-width="1"/>`;

  // 1m floor grid
  const gStep = eq.L > 6000 ? 1000 : 500;
  for (let gx = gStep; gx < eq.L; gx += gStep) {
    const p1 = P(gx, 0, 0), p2 = P(gx, eq.W, 0);
    body += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${GRID_LINE}" stroke-width="1" stroke-dasharray="2 2"/>`;
  }

  // Door opening on rear wall (x = eq.L)
  const dW = eq.doorW ?? eq.W;
  const dH = eq.doorH ?? eq.H;
  const dY0 = (eq.W - dW) / 2;
  const dY1 = dY0 + dW;
  body += `<polygon points="${pstr([P(eq.L, dY0, 0), P(eq.L, dY1, 0), P(eq.L, dY1, dH), P(eq.L, dY0, dH)])}" fill="oklch(0.65 0.18 40)" fill-opacity="0.25" stroke="${ACCENT}" stroke-width="2.5" stroke-linejoin="round"/>`;

  // Door bottleneck hazard: if door is narrower or lower than interior
  if (eq.doorW !== null && eq.doorW < eq.W) {
    // Narrow margins
    body += `<line x1="${P(eq.L, 0, 0)[0]}" y1="${P(eq.L, 0, 0)[1]}" x2="${P(eq.L, dY0, 0)[0]}" y2="${P(eq.L, dY0, 0)[1]}" stroke="oklch(0.55 0.22 25)" stroke-width="3"/>`;
    body += `<line x1="${P(eq.L, dY1, 0)[0]}" y1="${P(eq.L, dY1, 0)[1]}" x2="${P(eq.L, eq.W, 0)[0]}" y2="${P(eq.L, eq.W, 0)[1]}" stroke="oklch(0.55 0.22 25)" stroke-width="3"/>`;
  }
  if (eq.doorH !== null && eq.doorH < eq.H) {
    // Header margin
    body += `<polygon points="${pstr([P(eq.L, 0, dH), P(eq.L, eq.W, dH), P(eq.L, eq.W, eq.H), P(eq.L, 0, eq.H)])}" fill="oklch(0.55 0.22 25)" fill-opacity="0.15" stroke="none"/>`;
  }

  // Labels
  const dCenter = P(eq.L, eq.W / 2, 0);
  body += `<text x="${dCenter[0]}" y="${dCenter[1] + 18}" text-anchor="middle" font-size="10" font-family="JetBrains Mono" font-weight="700" fill="${ACCENT}">DOOR APERTURE (${Math.round(dW)}×${Math.round(dH)}mm)</text>`;
  const frontC = P(0, eq.W / 2, eq.H / 2);
  body += `<text x="${frontC[0] - 12}" y="${frontC[1]}" text-anchor="end" font-size="9" font-family="JetBrains Mono" fill="${DIM}">BULKHEAD</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wv} ${Hv}" role="img" aria-label="3D wireframe of vehicle bay" style="width:100%;height:auto;max-height:220px;display:block">${body}</svg>`;
}
