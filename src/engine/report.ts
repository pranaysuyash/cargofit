import { computeMetrics, buildChecks } from './analyze';
import { expandUnits, normalizeEquipment } from './normalize';
import { fmtKgDual, fmtMmDual, fmtNum, toKg } from './units';
import { renderIso, renderSide, renderTop, rowColors } from './viz';
import { validatePlacements } from './validator';
import { evaluateBridgeCompliance } from './bridge';
import { computeSecurementPlan } from './securement';
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

  const bridge = evaluateBridgeCompliance({
    equipmentLengthMm: eq.L,
    cargoWeightKg: m.loadedWeightKg,
    cargoCogXMm: m.cogX ?? (eq.L / 2),
  });

  const securement = computeSecurementPlan(units, plan.placements);

  const bridgeSection = `
<h2>Federal Bridge Formula B &amp; Axle Group Compliance (US FMCSA 23 CFR § 658.17)</h2>
<table>
  <tr><th>Axle Group / Benchmark</th><th>Actual Weight</th><th>Allowable Cap</th><th>Margin</th><th>Status</th></tr>
  ${bridge.groups.map((g) => `
    <tr>
      <td>${esc(g.name)}${g.spacingFt ? ` (${g.spacingFt} ft span)` : ''}</td>
      <td class="mono">${g.actualWeightLbs.toLocaleString()} lbs</td>
      <td class="mono">${g.maxLegalWeightLbs.toLocaleString()} lbs</td>
      <td class="mono" style="color:${g.compliant ? '#0a7a3d' : '#b30000'}">${g.marginLbs >= 0 ? '+' : ''}${g.marginLbs.toLocaleString()} lbs</td>
      <td class="${g.compliant ? 'st-verified' : 'st-not_declared'}">${g.compliant ? 'COMPLIANT' : 'OVERLOAD'}</td>
    </tr>
  `).join('')}
  <tr>
    <th>Gross Vehicle Weight (GVW)</th>
    <th class="mono">${bridge.overallGvwLbs.toLocaleString()} lbs</th>
    <th class="mono">80,000 lbs</th>
    <th class="mono" style="color:${bridge.gvwCompliant ? '#0a7a3d' : '#b30000'}">${bridge.gvwMarginLbs >= 0 ? '+' : ''}${bridge.gvwMarginLbs.toLocaleString()} lbs</th>
    <th class="${bridge.gvwCompliant ? 'st-verified' : 'st-not_declared'}">${bridge.gvwCompliant ? 'COMPLIANT' : 'OVERLOAD'}</th>
  </tr>
</table>
${bridge.kpraFt !== null ? `<p class="meta">California STAA Kingpin-to-Rear-Axle (KPRA): <b>${bridge.kpraFt.toFixed(1)} ft</b> (Legal limit: 40.0 ft max) · <span class="${bridge.kpraCompliant ? 'st-verified' : 'st-not_declared'}">${bridge.kpraCompliant ? 'California Compliant' : 'Non-Compliant (Exceeds 40 ft KPRA)'}</span></p>` : ''}
`;

  const securementSection = `
<h2>Cargo Restraint &amp; Tie-Down Plan (FMCSA 49 CFR § 393.100–136 &amp; Load Restraint Guide)</h2>
<table>
  <tr><th>Securing Metric</th><th>Value</th><th>Statutory Requirement</th></tr>
  <tr><td>Deck Friction Rating</td><td>${esc(securement.deckFrictionMu.toFixed(2))} μ</td><td>Wood/Steel benchmark</td></tr>
  <tr><td>Total Tie-Down Hardware</td><td><b>${securement.totalTieDownsCount} tie-down(s)</b></td><td>§ 393.110 length &amp; weight rule</td></tr>
  <tr><td>Aggregate Working Load Limit (WLL)</td><td><b>${securement.totalRequiredWllLbs.toLocaleString()} lbs</b> (${Math.round(securement.totalRequiredWllKg).toLocaleString()} kg)</td><td>≥ 50% of cargo weight (§ 393.106(d))</td></tr>
  <tr><td>Forward Deceleration Containment (0.8g)</td><td colspan="2">${securement.unblockedForwardCount === 0 ? '<span class="st-verified">All units blocked flush against front bulkhead (0.8g supported)</span>' : `<span class="st-not_modeled">${securement.unblockedForwardCount} unit(s) unblocked forward — cross-strapping / friction mats required</span>`}</td></tr>
</table>
<p class="meta">${securement.recommendations.map(esc).join(' · ')}</p>
`;
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
${bridgeSection}
${securementSection}
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
    <button class="btn" onclick="window.print()">Print / Save PDF</button>
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
        <button class="btn" id="btn-xray" onclick="toggleXray()">X-Ray</button>
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
    document.getElementById('btn-play').innerText = 'Pause';
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

/**
 * Builds a print-optimized, physical Loading Work Order and Bill-of-Lading
 * checklist for forklift operators, dock leads, and truck drivers.
 */
export function buildWorkOrderHtml(plan: PlanFile): string {
  const prof = plan.scenario.equipment.find((e) => e.id === plan.equipmentId);
  const eq = prof ? normalizeEquipment(prof)! : null;
  const units = expandUnits(plan.scenario.rows);
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const colors = rowColors(plan.scenario.rows);

  const topSvg = eq ? renderTop({ eq, placements: plan.placements, colors, showGrid: true }) : '';
  const sorted = plan.placements.slice().sort((a, b) => a.order - b.order);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Loading Work Order · ${esc(plan.scenario.name)} · ${esc(prof?.name ?? plan.equipmentId)}</title>
<style>
@page { size: letter portrait; margin: 10mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.35; color: #111; margin: 0; padding: 12px; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
.title-group h1 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800; }
.title-group p { margin: 2px 0 0; font-size: 11px; color: #444; }
.meta-box { text-align: right; font-size: 10px; font-family: ui-monospace, SFMono-Regular, monospace; }
.badge { display: inline-block; padding: 2px 6px; font-weight: 700; font-size: 10px; border-radius: 3px; background: #eee; }
.grid-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; font-size: 11px; }
.meta-card { border: 1px solid #ccc; padding: 6px 8px; border-radius: 4px; background: #fafafa; }
.meta-card span { display: block; font-size: 9.5px; text-transform: uppercase; color: #666; font-weight: 700; margin-bottom: 2px; }
.meta-card b { font-size: 12px; font-family: ui-monospace, SFMono-Regular, monospace; }

.diag-section { margin-bottom: 14px; page-break-inside: avoid; }
.diag-title { font-weight: 700; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
.diag-wrap { border: 1px solid #999; border-radius: 4px; padding: 4px; background: #fff; max-height: 190px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.diag-wrap svg { max-height: 180px; width: auto; max-width: 100%; }

.table-section { margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
th { background: #eaeaea; font-weight: 700; text-transform: uppercase; font-size: 9px; }
td.center { text-align: center; }
td.mono { font-family: ui-monospace, SFMono-Regular, monospace; }
.chk-box { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #000; border-radius: 2px; }

.axle-sec { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 14px; page-break-inside: avoid; }
.axle-card { border: 1px solid #ccc; padding: 8px; border-radius: 4px; background: #fdfdfd; }
.axle-card h4 { margin: 0 0 6px; font-size: 10.5px; text-transform: uppercase; }
.axle-row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 3px; }

.sign-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; border-top: 1.5px solid #000; padding-top: 10px; margin-top: 14px; page-break-inside: avoid; }
.sign-box { border: 1px dashed #888; border-radius: 4px; padding: 8px; min-height: 70px; display: flex; flex-direction: column; justify-content: space-between; font-size: 9.5px; }
.sign-line { border-bottom: 1px solid #333; margin-top: 24px; }
.disclaimer { font-size: 8.5px; color: #666; margin-top: 12px; line-height: 1.3; font-style: italic; }

@media screen {
  body { max-width: 850px; margin: 20px auto; border: 1px solid #ddd; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-radius: 6px; background: #fff; }
  .no-print-bar { background: #222; color: #fff; padding: 8px 14px; margin: -12px -12px 14px; border-radius: 5px 5px 0 0; display: flex; justify-content: space-between; align-items: center; }
  .no-print-bar button { background: #38bdf8; color: #000; border: 0; font-weight: 700; padding: 5px 12px; border-radius: 4px; cursor: pointer; }
}
@media print {
  .no-print-bar { display: none; }
}
</style>
</head>
<body>
<div class="no-print-bar">
  <span>Print-Ready Work Order · Cargo Fit</span>
  <button onclick="window.print()">Print Work Order</button>
</div>

<header class="header">
  <div class="title-group">
    <h1>Cargo Fit — Load Execution Work Order</h1>
    <p>Dock Execution Checklist & Physical Bay Plan · Bill of Lading Attachment</p>
  </div>
  <div class="meta-box">
    <div><b>Manifest:</b> ${esc(plan.scenario.name)}</div>
    <div><b>Plan Hash:</b> ${plan.inputHash.slice(0, 10)}</div>
    <div><b>Date:</b> ${new Date(plan.createdAt).toLocaleString()}</div>
    <div><b>Status:</b> <span class="badge">${esc(plan.status)}</span></div>
  </div>
</header>

<div class="grid-meta">
  <div class="meta-card">
    <span>Equipment Assigned</span>
    <b>${esc(prof?.name ?? plan.equipmentId)}</b>
    <div style="font-size:9.5px;color:#555;margin-top:2px;">${fmtMmDual(eq?.L ?? 0)} × ${fmtMmDual(eq?.W ?? 0)} × ${fmtMmDual(eq?.H ?? 0)}</div>
  </div>
  <div class="meta-card">
    <span>Cargo Utilization</span>
    <b>${plan.placements.length} of ${units.length} Units Placed</b>
    <div style="font-size:9.5px;color:#555;margin-top:2px;">${fmtNum(plan.metrics.occupiedVolumePct)}% Volume · ${plan.unplacedUnitIds.length} Unplaced</div>
  </div>
  <div class="meta-card">
    <span>Payload & Gross</span>
    <b>${fmtKgDual(plan.metrics.loadedWeightKg)}</b>
    <div style="font-size:9.5px;color:#555;margin-top:2px;">Limit: ${prof?.payload ? fmtKgDual(toKg(prof.payload, prof.massUnit)) : 'Not Declared'}</div>
  </div>
  <div class="meta-card">
    <span>Weight Balance CoG</span>
    <b>${plan.metrics.cogXPct !== null ? `${fmtNum(plan.metrics.cogXPct, 0)}% of Wheelbase` : 'N/A'}</b>
    <div style="font-size:9.5px;color:#555;margin-top:2px;">${(plan.metrics.cogXPct ?? 50) >= 45 && (plan.metrics.cogXPct ?? 50) <= 55 ? 'Balanced within safe envelope' : 'Forward/Rear Bias'}</div>
  </div>
</div>

<section class="diag-section">
  <div class="diag-title">Top-Down Bay Loading Blueprint (Front Bulkhead at Left → Rear Door at Right)</div>
  <div class="diag-wrap">
    ${topSvg}
  </div>
</section>

<section class="table-section">
  <div class="diag-title">Step-by-Step Loading Checklist (Load in Ascending Order: Step #1 First)</div>
  <table>
    <thead>
      <tr>
        <th style="width:28px;" class="center">Done</th>
        <th style="width:34px;" class="center">Seq</th>
        <th>Unit ID</th>
        <th>SKU Description</th>
        <th class="center">Delivery Stop</th>
        <th>Bay Position (X, Y, Z mm)</th>
        <th>Dimensions (L × W × H mm)</th>
        <th>Weight</th>
        <th>Stack Rule</th>
      </tr>
    </thead>
    <tbody>
      ${sorted.map((p) => {
        const u = unitMap.get(p.unitId);
        return `<tr>
          <td class="center"><span class="chk-box"></span></td>
          <td class="center mono"><b>#${p.order}</b></td>
          <td class="mono"><b>${esc(p.unitId)}</b></td>
          <td>${esc(p.label)}</td>
          <td class="center mono">${u?.stop ? `Stop #${u.stop}` : '—'}</td>
          <td class="mono">(${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)})</td>
          <td class="mono">${Math.round(p.dx)} × ${Math.round(p.dy)} × ${Math.round(p.dz)}</td>
          <td class="mono">${u?.weightKg ? fmtKgDual(u.weightKg) : '—'}</td>
          <td>${u?.stackable ? 'Stackable' : '<b>TOP ONLY</b>'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</section>

<div class="axle-sec">
  <div class="axle-card">
    <h4>Preliminary Axle Weight & Federal Bridge Formula B Review</h4>
    ${plan.metrics.axleEst ? `
      <div class="axle-row"><span>Steer Axle Reaction:</span> <b class="mono">${fmtKgDual(plan.metrics.axleEst.steerKg)} (${plan.metrics.axleEst.steerPct}% rating)</b></div>
      <div class="axle-row"><span>Drive Tandem Reaction:</span> <b class="mono">${fmtKgDual(plan.metrics.axleEst.driveKg)} (${plan.metrics.axleEst.drivePct}% rating)</b></div>
      <div class="axle-row"><span>Trailer Tandem Reaction:</span> <b class="mono">${fmtKgDual(plan.metrics.axleEst.trailerKg)} (${plan.metrics.axleEst.trailerPct}% rating)</b></div>
      <div class="axle-row" style="border-top:1px dashed #ccc;padding-top:3px;margin-top:3px;">
        <span>Statutory Bridge Formula B (23 CFR § 658.17):</span>
        <b>${plan.metrics.axleEst.bridgeFormulaCompliant ? 'COMPLIANT (within statutory axle-group allowance)' : 'EXCEEDS inner bridge weight formula'}</b>
      </div>
    ` : '<p style="color:#777;margin:0;">Axle reactions unmodeled (weight incomplete or single-axle vehicle).</p>'}
  </div>
  <div class="axle-card">
    <h4>Security & Inspection</h4>
    <div style="font-size:10px;margin-bottom:6px;">Trailer Seal Number:</div>
    <div style="border-bottom:1.5px solid #000;height:20px;font-family:monospace;font-size:12px;"></div>
  </div>
</div>

<div class="sign-grid">
  <div class="sign-box">
    <div><b>Forklift Operator / Lead Loader</b></div>
    <div>I certify this shipment was physically loaded in accordance with the verified sequence above.</div>
    <div class="sign-line">Signature / Date</div>
  </div>
  <div class="sign-box">
    <div><b>Dock Supervisor</b></div>
    <div>I certify blocking, bracing, and door clearance were verified prior to trailer seal closure.</div>
    <div class="sign-line">Signature / Date</div>
  </div>
  <div class="sign-box">
    <div><b>Motor Carrier / Driver Acceptance</b></div>
    <div>I acknowledge receipt of this sealed load and agree to verify axle weights at the nearest certified scale.</div>
    <div class="sign-line">Signature / Date</div>
  </div>
</div>

<div class="disclaimer">
  <b>Legal & Safety Boundary Notice:</b> This loading work order provides geometric and volumetric arrangement heuristics. FMCSA 49 CFR Part 393 and NHVR regulations mandate that tiedown securement, friction coefficients, dunnage, and live axle scale weights override any computer model. Always scale prior to interstate highway transit.
</div>
</body>
</html>`;
}
