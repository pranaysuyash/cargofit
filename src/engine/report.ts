import { computeMetrics, buildChecks } from './analyze';
import { expandUnits, normalizeEquipment } from './normalize';
import { fmtKgDual, fmtMmDual, fmtNum } from './units';
import { renderIso, renderSide, renderTop, rowColors } from './viz';
import { validatePlacements } from './validator';
import {
  SOLVER_VERSION,
  type EquipmentResult, type ModeledCheck, type Placement, type Reason, type Scenario, type Violation,
} from './types';

export const PLAN_FORMAT = 'cargo-fit-plan';
export const PLAN_VERSION = 1;

export const LIMITATIONS = [
  'Geometric plan only. It is not a securement, axle-weight, legal-compliance or safety certificate.',
  'Constraints modeled: interior bounds, non-overlap, allowed orientations, base support / no-stack, declared payload (known weights), declared door cross-section.',
  'Not modeled: axle and axle-group loads, vehicle tare and legal limits, load securement, handling-equipment access, multi-stop unload order, centre-of-gravity height and lateral position.',
  'Equipment dimensions, payloads and costs are user-entered or illustrative presets, not official quotations or certified specifications.',
  'Scales and qualified loading personnel override any modeled assumption.',
];

export interface PlanFile {
  format: typeof PLAN_FORMAT;
  version: number;
  createdAt: string;
  engineVersion: string;
  inputHash: string;
  scenario: Scenario;
  equipmentId: string;
  arrangementName: string;
  edited: boolean;
  status: string;
  placements: Placement[];
  unplacedUnitIds: string[];
  metrics: ReturnType<typeof computeMetrics>;
  reasons: Reason[];
  checks: ModeledCheck[];
  validation: { violations: Violation[]; validatedAt: string; passed: boolean };
  limitations: string[];
}

export interface ExportInput {
  scenario: Scenario;
  result: EquipmentResult;
  placements: Placement[];
  arrangementName: string;
  edited: boolean;
  inputHash: string;
  now?: Date;
}

export function buildPlanFile(x: ExportInput): PlanFile {
  const eqProfile = x.scenario.equipment.find((e) => e.id === x.result.equipmentId)!;
  const eq = normalizeEquipment(eqProfile)!;
  const units = expandUnits(x.scenario.rows);
  const violations = validatePlacements(units, eq, x.placements, x.scenario.settings);
  const placed = new Set(x.placements.map((p) => p.unitId));
  const metrics = computeMetrics(units, eq, x.placements);
  return {
    format: PLAN_FORMAT, version: PLAN_VERSION, createdAt: (x.now ?? new Date()).toISOString(),
    engineVersion: SOLVER_VERSION, inputHash: x.inputHash, scenario: x.scenario,
    equipmentId: x.result.equipmentId, arrangementName: x.arrangementName, edited: x.edited,
    status: x.edited ? 'MANUALLY_EDITED (solver status does not apply)' : x.result.status,
    placements: x.placements, unplacedUnitIds: units.filter((u) => !placed.has(u.id)).map((u) => u.id),
    metrics, reasons: x.result.reasons,
    checks: buildChecks(eq, metrics.unknownWeightUnits, true),
    validation: { violations, validatedAt: (x.now ?? new Date()).toISOString(), passed: violations.length === 0 },
    limitations: LIMITATIONS,
  };
}

export type PlanCheck = { ok: true; plan: PlanFile; violations: Violation[] } | { ok: false; error: string };

/** Parse and RE-VALIDATE an imported plan file; never trust its own stated validation. */
export function readPlanFile(text: string): PlanCheck {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { ok: false, error: 'Not valid JSON.' }; }
  const p = j as Partial<PlanFile>;
  if (p?.format !== PLAN_FORMAT) return { ok: false, error: 'Not a Cargo Fit plan file.' };
  if (p.version !== PLAN_VERSION) return { ok: false, error: `Unsupported plan version ${String(p.version)}.` };
  if (!p.scenario || !Array.isArray(p.placements)) return { ok: false, error: 'Plan file is missing scenario or placements.' };
  const prof = p.scenario.equipment?.find((e) => e.id === p.equipmentId);
  const eq = prof ? normalizeEquipment(prof) : null;
  if (!eq) return { ok: false, error: 'Plan file equipment profile is missing or invalid.' };
  const violations = validatePlacements(expandUnits(p.scenario.rows ?? []), eq, p.placements, p.scenario.settings ?? { minSupportPct: 100 });
  return { ok: true, plan: p as PlanFile, violations };
}

const csvEsc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function placementsCsv(plan: PlanFile): string {
  const head = 'order,unit_id,row_label,x_mm,y_mm,z_mm,dx_mm,dy_mm,dz_mm';
  const lines = plan.placements.slice().sort((a, b) => a.order - b.order).map((p) =>
    [p.order, p.unitId, p.label, p.x, p.y, p.z, p.dx, p.dy, p.dz].map((v) => csvEsc(typeof v === 'number' ? Math.round(v * 100) / 100 : v)).join(','));
  return [head, ...lines].join('\n') + '\n';
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export const STATUS_LABEL: Record<string, string> = {
  FEASIBLE_UNDER_MODELED_CONSTRAINTS: 'Fits — under modeled constraints',
  PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS: 'Does not fit — proven under modeled constraints',
  NOT_FOUND_WITHIN_SEARCH_BUDGET: 'No plan found — not proof of impossibility',
  INCOMPLETE_INPUT: 'Incomplete input',
  NEEDS_PHYSICAL_REVIEW: 'Geometry fits — physical review needed',
};

/** Self-contained, printable HTML report (print to PDF from the browser). */
export function buildHtmlReport(plan: PlanFile): string {
  const eqProfile = plan.scenario.equipment.find((e) => e.id === plan.equipmentId)!;
  const eq = normalizeEquipment(eqProfile)!;
  const colors = rowColors(plan.scenario.rows);
  const units = expandUnits(plan.scenario.rows);
  const ctx = { eq, placements: plan.placements, colors, units, showCoG: true };
  const m = plan.metrics;
  const statusText = STATUS_LABEL[plan.status] ?? plan.status;
  const rows = plan.placements.slice().sort((a, b) => a.order - b.order).map((p) =>
    `<tr><td>${p.order}</td><td>${esc(p.unitId)}</td><td>${fmtNum(p.x, 0)}, ${fmtNum(p.y, 0)}, ${fmtNum(p.z, 0)}</td><td>${fmtNum(p.dx, 0)} × ${fmtNum(p.dy, 0)} × ${fmtNum(p.dz, 0)}</td></tr>`).join('');
  const cargoRows = plan.scenario.rows.map((r) =>
    `<tr><td>${esc(r.label)}</td><td>${r.qty ?? '—'}</td><td>${r.length ?? '—'} × ${r.width ?? '—'} × ${r.height ?? '—'} ${r.dimUnit}</td><td>${r.weight === null ? '<b>unknown</b>' : `${r.weight} ${r.weightUnit}`}</td><td>${r.rotation}</td><td>${r.stackable ? 'stackable' : 'no-stack'}</td></tr>`).join('');
  const checks = plan.checks.map((c) => `<tr><td>${esc(c.label)}</td><td class="st-${c.state}">${c.state.replace('_', ' ')}</td><td>${esc(c.note)}</td></tr>`).join('');
  const viol = plan.validation.violations.length
    ? `<ul>${plan.validation.violations.map((v) => `<li>${esc(v.message)}</li>`).join('')}</ul>`
    : '<p>No violations of the modeled constraints were found by the independent validator.</p>';
  const axleTable = m.axleEst ? `
<h2>Axle Load Distribution &amp; Balance (Engineering Estimate)</h2>
<table>
  <tr><th>Axle Group</th><th>Estimated Load</th><th>Benchmark Limit</th><th>Utilization</th></tr>
  <tr><td>Steer Axle</td><td>${fmtKgDual(m.axleEst.steerKg)}</td><td>${fmtKgDual(5443)} (12,000 lb)</td><td>${m.axleEst.steerPct}%</td></tr>
  <tr><td>Drive Tandem</td><td>${fmtKgDual(m.axleEst.driveKg)}</td><td>${fmtKgDual(15422)} (34,000 lb)</td><td>${m.axleEst.drivePct}%</td></tr>
  <tr><td>Trailer Tandem</td><td>${fmtKgDual(m.axleEst.trailerKg)}</td><td>${fmtKgDual(15422)} (34,000 lb)</td><td>${m.axleEst.trailerPct}%</td></tr>
  <tr><td>Composite Center of Gravity</td><td colspan="3">${m.cogX !== null && m.cogX !== undefined ? fmtMmDual(m.cogX) : '—'} (${m.cogXPct !== null ? fmtNum(m.cogXPct, 1) + '% of interior length' : '—'}) · ${m.cogXPct && m.cogXPct >= 45 && m.cogXPct <= 55 ? '<span class="st-verified">Within optimal 45–55% wheelbase envelope</span>' : '<span class="st-not_modeled">Outside 45–55% envelope — verify actual axle loads</span>'}</td></tr>
</table>
<p class="meta">Engineering estimate for standard semi-trailer / box geometry. Official axle weights must be verified with certified weighbridge scales.</p>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Load plan — ${esc(plan.scenario.name)}</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;color:#1b2430;max-width:960px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:28px 0 8px;border-bottom:1px solid #cdd5df;padding-bottom:4px;text-transform:uppercase;letter-spacing:.06em}
table{border-collapse:collapse;width:100%;font-size:12.5px}td,th{border:1px solid #d5dbe3;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f2f5f8}
.warn{background:#fff4e5;border:1px solid #f0b46c;padding:10px 14px;border-radius:6px}.meta{color:#5a6674;font-size:12px}
.st-verified{color:#0a7a3d;font-weight:600}.st-not_modeled,.st-not_declared,.st-unknown{color:#a15c00;font-weight:600}
.views{display:grid;grid-template-columns:1fr;gap:12px}.views>div{border:1px solid #d5dbe3;border-radius:6px;padding:6px}
@media print{body{margin:0}.views>div{break-inside:avoid}}
</style></head><body>
<h1>Load plan — ${esc(plan.scenario.name)}</h1>
<p class="meta">Generated ${esc(plan.createdAt)} · engine ${esc(plan.engineVersion)} · input hash ${esc(plan.inputHash)} · arrangement “${esc(plan.arrangementName)}”${plan.edited ? ' · <b>manually edited</b>' : ''}</p>
<p class="warn"><b>${esc(statusText)}.</b> ${esc(LIMITATIONS[0])}</p>
<h2>Equipment</h2>
<p><b>${esc(eqProfile.name)}</b> — interior ${fmtMmDual(eq.L)} × ${fmtMmDual(eq.W)} × ${fmtMmDual(eq.H)}${eq.doorW ? `; door ${fmtMmDual(eq.doorW)} × ${fmtMmDual(eq.doorH!)}` : '; door not declared'}; payload ${eq.payloadKg === null ? 'not declared' : fmtKgDual(eq.payloadKg)}.<br><span class="meta">Source: ${esc(eqProfile.source)}${eqProfile.cost !== null ? ` · cost ${eqProfile.cost} ${esc(eqProfile.currency)} (${eqProfile.costSource === 'user' ? 'user-entered' : 'illustrative'}, not a quotation)` : ''}</span></p>
<h2>Metrics</h2>
<table><tr><th>Placed</th><td>${m.placedUnits} of ${m.totalUnits} units</td><th>Occupied volume*</th><td>${fmtNum(m.occupiedVolumePct)}%</td></tr>
<tr><th>Known loaded weight</th><td>${fmtKgDual(m.loadedWeightKg)}${m.unknownWeightUnits ? ` (+${m.unknownWeightUnits} unit(s) of unknown weight)` : ''}</td><th>Payload remaining</th><td>${m.payloadRemainingKg === null ? 'n/a' : fmtKgDual(m.payloadRemainingKg)}</td></tr>
<tr><th>Length used</th><td>${fmtMmDual(m.usedLengthMm)}</td><th>Longitudinal centroid (info only)</th><td>${m.cogXPct === null ? 'n/a' : `${fmtNum(m.cogXPct, 0)}% from front wall`}</td></tr></table>
<p class="meta">*Sum of placed items' bounding-box volume ÷ interior volume. Not a measure of usable space or safety.</p>
${axleTable}
<h2>Views</h2><div class="views"><div>${renderTop(ctx)}</div><div>${renderSide(ctx)}</div><div style="max-width:760px">${renderIso(ctx)}</div></div>
<h2>Placements (x,y,z from front-left-floor corner, mm)</h2>
<table><tr><th>#</th><th>Unit</th><th>Position</th><th>Size dx × dy × dz</th></tr>${rows}</table>
${plan.unplacedUnitIds.length ? `<p><b>Not placed (${plan.unplacedUnitIds.length}):</b> ${esc(plan.unplacedUnitIds.join(', '))}</p>` : ''}
<h2>Input manifest</h2><table><tr><th>Item</th><th>Qty</th><th>Size (as entered)</th><th>Weight each</th><th>Rotation</th><th>Stacking</th></tr>${cargoRows}</table>
<h2>Validation</h2>${viol}
<h2>Checks and what is NOT verified</h2><table><tr><th>Check</th><th>State</th><th>Note</th></tr>${checks}</table>
<h2>Limitations</h2><ul>${plan.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
</body></html>`;
}

/** Self-contained, offline interactive HTML report with embedded 3D viewer, step slider, and X-ray */
export function buildInteractiveHtmlReport(plan: PlanFile): string {
  const eqProfile = plan.scenario.equipment.find((e) => e.id === plan.equipmentId)!;
  const eq = normalizeEquipment(eqProfile)!;
  const colors = rowColors(plan.scenario.rows);
  const units = expandUnits(plan.scenario.rows);
  const m = plan.metrics;
  const statusText = STATUS_LABEL[plan.status] ?? plan.status;

  // Pre-render isometric views for all 4 yaw angles
  const iso0 = renderIso({ eq, placements: plan.placements, colors, units, rotation: 0, showCoG: true });
  const iso1 = renderIso({ eq, placements: plan.placements, colors, units, rotation: 1, showCoG: true });
  const iso2 = renderIso({ eq, placements: plan.placements, colors, units, rotation: 2, showCoG: true });
  const iso3 = renderIso({ eq, placements: plan.placements, colors, units, rotation: 3, showCoG: true });
  const topView = renderTop({ eq, placements: plan.placements, colors, showGrid: true });
  const sideView = renderSide({ eq, placements: plan.placements, colors, showGrid: true });

  const rows = plan.placements.slice().sort((a, b) => a.order - b.order).map((p) =>
    `<tr data-order="${p.order}" class="p-row"><td>${p.order}</td><td><b>${esc(p.unitId)}</b></td><td>${esc(p.label)}</td><td class="mono">${fmtNum(p.x, 0)}, ${fmtNum(p.y, 0)}, ${fmtNum(p.z, 0)}</td><td class="mono">${fmtNum(p.dx, 0)} × ${fmtNum(p.dy, 0)} × ${fmtNum(p.dz, 0)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Interactive Plan — ${esc(plan.scenario.name)}</title>
<style>
:root{--ink:#1b2430;--muted:#5a6674;--line:#d5dbe3;--accent:#d97706;--accent-bg:#fffbeb;--ok:#0a7a3d;--panel:#ffffff;--paper:#f8fafc}
*{box-sizing:border-box}body{font:14px/1.5 system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--paper);margin:0;padding:24px 16px}
.wrap{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
.header{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;border-bottom:2px solid var(--ink);padding-bottom:12px}
h1{font-size:24px;margin:0}h2{font-size:15px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.meta{font-size:12.5px;color:var(--muted)}
.warn{background:#fff4e5;border:1px solid #f0b46c;padding:10px 14px;border-radius:8px;font-size:13px}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
.m-card{background:white;border:1px solid var(--line);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column}
.m-card span{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
.m-card b{font-size:16px;font-family:ui-monospace,monospace}
.viewer-box{background:white;border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.vbar{display:flex;gap:8px;align-items:center;padding:10px 14px;background:#f1f5f9;border-bottom:1px solid var(--line);flex-wrap:wrap}
.btn{font:600 13px system-ui;padding:6px 12px;border-radius:6px;border:1px solid var(--line);background:white;cursor:pointer}
.btn:hover{border-color:var(--ink)}.btn.on{background:var(--ink);color:white;border-color:var(--ink)}
.canvas{position:relative;height:520px;display:grid;place-items:center;padding:12px;overflow:auto}
.canvas svg{width:100%;height:100%;max-height:500px;display:none}
.canvas svg.active{display:block}
.is-xray .pi polygon{opacity:0.25!important}.is-xray .pi text{opacity:0.4!important}
.hidden-step{display:none!important}
table{border-collapse:collapse;width:100%;font-size:13px;background:white}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left}th{background:#f8fafc;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.tablewrap{max-height:360px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.mono{font-family:ui-monospace,monospace}
@media print{.vbar{display:none}.canvas{height:auto}.canvas svg{display:block!important;max-height:300px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div>
      <h1>Load Plan — ${esc(plan.scenario.name)}</h1>
      <p class="meta">Exported ${esc(plan.createdAt)} · Equipment: <b>${esc(eqProfile.name)}</b> · Arrangement: <b>${esc(plan.arrangementName)}</b></p>
    </div>
    <button class="btn" onclick="window.print()">⎙ Print / Save PDF</button>
  </div>

  <div class="warn"><b>${esc(statusText)}.</b> ${esc(LIMITATIONS[0])}</div>

  <div class="metrics">
    <div class="m-card"><span>Placed</span><b>${m.placedUnits}/${m.totalUnits}</b></div>
    <div class="m-card"><span>Occupied Volume</span><b>${fmtNum(m.occupiedVolumePct)}%</b></div>
    <div class="m-card"><span>Loaded Weight</span><b>${fmtKgDual(m.loadedWeightKg)}</b></div>
    <div class="m-card"><span>Payload Left</span><b>${m.payloadRemainingKg === null ? 'n/d' : fmtKgDual(m.payloadRemainingKg)}</b></div>
    <div class="m-card"><span>Length Used</span><b>${fmtMmDual(m.usedLengthMm)}</b></div>
    <div class="m-card"><span>CoG (Length)</span><b>${m.cogXPct === null ? 'n/a' : fmtNum(m.cogXPct, 1) + '%'}</b></div>
  </div>

  <div class="viewer-box">
    <div class="vbar">
      <div style="display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden">
        <button class="btn on" id="btn-iso" onclick="setView('iso')">Isometric 3D</button>
        <button class="btn" id="btn-top" onclick="setView('top')">Top Plan</button>
        <button class="btn" id="btn-side" onclick="setView('side')">Side Elevation</button>
      </div>
      <div id="iso-ctrls" style="display:inline-flex;gap:6px">
        <button class="btn" onclick="rotate(-1)">⟲ Yaw Left</button>
        <button class="btn" onclick="rotate(1)">⟳ Yaw Right</button>
        <button class="btn" id="btn-xray" onclick="toggleXray()">👁 X-Ray</button>
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
        <button class="btn" id="btn-play" onclick="togglePlay()">▶ Play</button>
        <label style="font-size:12px;font-weight:600">Step: <input type="range" id="step-range" min="1" max="${plan.placements.length}" value="${plan.placements.length}" oninput="setStep(Number(this.value))"></label>
        <span class="mono" id="step-lbl">${plan.placements.length}/${plan.placements.length}</span>
      </div>
    </div>
    <div class="canvas" id="canvas">
      <div id="v-iso-0" class="active">${iso0}</div>
      <div id="v-iso-1">${iso1}</div>
      <div id="v-iso-2">${iso2}</div>
      <div id="v-iso-3">${iso3}</div>
      <div id="v-top">${topView}</div>
      <div id="v-side">${sideView}</div>
    </div>
  </div>

  <h2>Placements Sequence (${plan.placements.length} units)</h2>
  <div class="tablewrap">
    <table>
      <thead><tr><th>#</th><th>Unit ID</th><th>Cargo Item</th><th>Position (X, Y, Z)</th><th>Dimensions (L × W × H)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>

<script>
let curView = 'iso';
let curRot = 0;
let isXray = false;
let maxStep = ${plan.placements.length};
let curStep = maxStep;
let playTimer = null;

function updateViews() {
  document.querySelectorAll('#canvas > div').forEach(d => d.className = '');
  if (curView === 'iso') {
    document.getElementById('v-iso-' + curRot).className = 'active';
    document.getElementById('iso-ctrls').style.display = 'inline-flex';
  } else if (curView === 'top') {
    document.getElementById('v-top').className = 'active';
    document.getElementById('iso-ctrls').style.display = 'none';
  } else if (curView === 'side') {
    document.getElementById('v-side').className = 'active';
    document.getElementById('iso-ctrls').style.display = 'none';
  }
  document.getElementById('btn-iso').className = curView === 'iso' ? 'btn on' : 'btn';
  document.getElementById('btn-top').className = curView === 'top' ? 'btn on' : 'btn';
  document.getElementById('btn-side').className = curView === 'side' ? 'btn on' : 'btn';
}

function setView(v) { curView = v; updateViews(); }
function rotate(d) { curRot = (curRot + d + 4) % 4; updateViews(); }
function toggleXray() {
  isXray = !isXray;
  document.getElementById('canvas').classList.toggle('is-xray', isXray);
  document.getElementById('btn-xray').className = isXray ? 'btn on' : 'btn';
}

function setStep(n) {
  curStep = n;
  document.getElementById('step-range').value = n;
  document.getElementById('step-lbl').innerText = n + '/' + maxStep;
  document.querySelectorAll('.pi').forEach(el => {
    const textEl = el.querySelector('text');
    const ord = textEl ? parseInt(textEl.textContent) : 0;
    if (ord && ord > n) el.classList.add('hidden-step');
    else el.classList.remove('hidden-step');
  });
  document.querySelectorAll('.p-row').forEach(r => {
    const ord = Number(r.getAttribute('data-order'));
    if (ord > n) r.style.opacity = '0.3';
    else r.style.opacity = '1.0';
  });
}

function togglePlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    document.getElementById('btn-play').innerText = '▶ Play';
  } else {
    if (curStep >= maxStep) setStep(1);
    document.getElementById('btn-play').innerText = '❚❚ Pause';
    playTimer = setInterval(() => {
      if (curStep >= maxStep) { togglePlay(); }
      else { setStep(curStep + 1); }
    }, 400);
  }
}
</script>
</body>
</html>`;
}
