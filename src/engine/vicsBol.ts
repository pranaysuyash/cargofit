/**
 * Voluntary Interindustry Commerce Solutions (VICS) Bill of Lading — document builder.
 *
 * Integrity rules (audit 2026-10-21):
 *  - Commercial / legal fields (carrier, SCAC, parties, seal, trailer, NMFC, freight class)
 *    are NEVER invented. Missing values render as UNDECLARED and force DRAFT status.
 *  - Weights come from the manifest per-unit weights; unknown weights are shown as unknown,
 *    never averaged or estimated.
 *  - A document is only issued as a Bill of Lading when every required field is declared,
 *    no weight is unknown, the geometric validation passed AND a human has explicitly
 *    approved issuance (`humanApproved`). Otherwise it is a "Draft Load Manifest".
 *  - Every interpolated value is HTML-escaped.
 */

import type { PlanFile } from './report';
import { expandUnits } from './normalize';
import { code128Svg } from './code128';

export const UNDECLARED = '[UNDECLARED — OPERATOR ENTRY REQUIRED]';

export interface BolLineDeclaration {
  nmfc?: string;
  freightClass?: string;
  packageType?: string;
  hazmat?: boolean;
}

export interface VicsBolOptions {
  bolNumber?: string;
  proNumber?: string;
  carrierName?: string;
  scac?: string;
  shipperName?: string;
  shipperAddress?: string;
  shipperCityStateZip?: string;
  shipperId?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  consigneeCityStateZip?: string;
  consigneeId?: string;
  billToName?: string;
  billToAddress?: string;
  billToCityStateZip?: string;
  trailerNumber?: string;
  sealNumber?: string;
  specialInstructions?: string;
  freightChargeTerms?: 'Prepaid' | 'Collect' | '3rd Party';
  driverLoadAndCount?: boolean;
  shipperSignatureDataUrl?: string;
  driverSignatureDataUrl?: string;
  emergencyPhone?: string;
  /** Per-label operator declarations (NMFC, class, package type, hazmat confirmation). */
  lineDeclarations?: Record<string, BolLineDeclaration>;
  /** Explicit human approval to issue this as a Bill of Lading (not a draft). */
  humanApproved?: boolean;
}

/** HTML-escapes untrusted text for element content and double-quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only embedded raster signature images are allowed; anything else is dropped. */
function safeImageDataUrl(url?: string): string | null {
  if (!url) return null;
  return /^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/.test(url) ? url : null;
}

const declared = (v?: string): string => (v && v.trim() ? v.trim() : UNDECLARED);
const isDeclared = (v?: string): boolean => !!(v && v.trim());

export interface BolReadiness {
  isFinal: boolean;
  blockers: string[];
}

/** Computes whether a document may be issued as a final BOL, and why not. */
export function assessBolReadiness(plan: PlanFile, opts: VicsBolOptions = {}): BolReadiness {
  const blockers: string[] = [];
  const required: Array<[string, string | undefined]> = [
    ['Carrier name', opts.carrierName],
    ['SCAC', opts.scac],
    ['Shipper name', opts.shipperName],
    ['Shipper address', opts.shipperAddress],
    ['Consignee name', opts.consigneeName],
    ['Consignee address', opts.consigneeAddress],
    ['Trailer number', opts.trailerNumber],
    ['Seal number', opts.sealNumber],
  ];
  for (const [name, v] of required) if (!isDeclared(v)) blockers.push(`${name} not declared`);
  if (plan.metrics.unknownWeightUnits > 0) blockers.push(`${plan.metrics.unknownWeightUnits} unit(s) have unknown weight`);
  if (!plan.validation.passed) blockers.push('Geometric validation reported violations');
  if (plan.unplacedUnitIds.length > 0) blockers.push(`${plan.unplacedUnitIds.length} unit(s) not placed`);
  const labels = new Set(plan.placements.map((p) => p.label));
  for (const label of labels) {
    const d = opts.lineDeclarations?.[label];
    if (!d || !isDeclared(d.nmfc) || !isDeclared(d.freightClass)) blockers.push(`NMFC / freight class not declared for "${label}"`);
  }
  if (!opts.humanApproved) blockers.push('Human approval for issuance not recorded');
  return { isFinal: blockers.length === 0, blockers };
}

export function buildVicsBolHtml(plan: PlanFile, opts: VicsBolOptions = {}): string {
  const readiness = assessBolReadiness(plan, opts);
  const isFinal = readiness.isFinal;
  const docTitle = isFinal ? 'Standard Bill of Lading (VICS)' : 'Draft Load Manifest (Unverified — Not a Bill of Lading)';

  const bolNum = opts.bolNumber || `BOL-${plan.inputHash.slice(0, 8).toUpperCase()}`;
  const carrier = declared(opts.carrierName);
  const scac = declared(opts.scac);
  const seal = declared(opts.sealNumber);
  const trailer = declared(opts.trailerNumber);
  const dateStr = new Date(plan.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const terms = opts.freightChargeTerms || UNDECLARED;

  const shipperName = declared(opts.shipperName);
  const shipperAddr = declared(opts.shipperAddress);
  const shipperCSZ = declared(opts.shipperCityStateZip);
  const consigneeName = declared(opts.consigneeName);
  const consigneeAddr = declared(opts.consigneeAddress);
  const consigneeCSZ = declared(opts.consigneeCityStateZip);

  const totalLoadedPieces = plan.placements.length;
  const eqName = plan.scenario.equipment.find((e) => e.id === plan.equipmentId)?.name || plan.equipmentId.toUpperCase();

  // Actual per-unit weights from the manifest (kg); null = unknown. Never estimated.
  const unitWeightKg = new Map<string, number | null>();
  for (const u of expandUnits(plan.scenario.rows)) unitWeightKg.set(u.id, u.weightKg);
  const toLbs = (kg: number) => Math.round(kg * 2.20462);
  const unknownTotal = plan.metrics.unknownWeightUnits;
  const totalWeightLbs = toLbs(plan.metrics.loadedWeightKg);
  const totalWeightText = unknownTotal > 0
    ? `≥ ${totalWeightLbs.toLocaleString()} lbs (${unknownTotal} unit(s) weight UNKNOWN)`
    : `${totalWeightLbs.toLocaleString()} lbs`;

  // Group cargo by SKU/label with real weights
  const grouped = new Map<string, { count: number; weightKg: number; unknown: number; stop: number; isHazmat: boolean }>();
  for (const p of plan.placements) {
    const g = grouped.get(p.label) || { count: 0, weightKg: 0, unknown: 0, stop: p.stop ?? 1, isHazmat: false };
    g.count += 1;
    g.stop = p.stop ?? g.stop;
    const w = unitWeightKg.get(p.unitId);
    if (w === null || w === undefined) g.unknown += 1; else g.weightKg += w;
    grouped.set(p.label, g);
  }
  // Hazmat flag: label heuristic, overridden by explicit operator declaration.
  for (const [label, data] of grouped.entries()) {
    const decl = opts.lineDeclarations?.[label]?.hazmat;
    data.isHazmat = decl !== undefined ? decl : /haz|class\s*[1-9]|un\s*\d{4}|flamm|danger/i.test(label);
  }

  const barcodeSvg = code128Svg(bolNum);
  const e = escapeHtml;
  const sigShipper = safeImageDataUrl(opts.shipperSignatureDataUrl);
  const sigDriver = safeImageDataUrl(opts.driverSignatureDataUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${e(docTitle)} — ${e(bolNum)}</title>
  <style>
    @page { size: letter portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      background: #fff;
      margin: 0;
      padding: 12px;
      font-size: 11px;
      line-height: 1.25;
    }
    .bol-box {
      border: 2px solid #000;
      max-width: 820px;
      margin: 0 auto;
    }
    .header-row {
      display: flex;
      border-bottom: 2px solid #000;
    }
    .head-left {
      flex: 1.2;
      padding: 8px 12px;
      border-right: 1.5px solid #000;
    }
    .head-right {
      flex: 1;
      padding: 8px 12px;
      text-align: right;
    }
    h1 {
      margin: 0 0 4px 0;
      font-size: 17px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-line {
      font-size: 10px;
      color: #333;
      margin: 2px 0;
    }
    .barcode-wrap {
      margin-top: 6px;
    }
    .grid-2 {
      display: flex;
      border-bottom: 1.5px solid #000;
    }
    .grid-col {
      flex: 1;
      padding: 6px 10px;
    }
    .grid-col:first-child {
      border-right: 1.5px solid #000;
    }
    .col-title {
      font-weight: 800;
      font-size: 9px;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 4px;
    }
    .party-name {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .carrier-info-bar {
      display: flex;
      border-bottom: 1.5px solid #000;
      background: #f8fafc;
      font-size: 10px;
    }
    .carrier-cell {
      flex: 1;
      padding: 5px 8px;
      border-right: 1px solid #cbd5e1;
    }
    .carrier-cell:last-child {
      border-right: none;
    }
    .carrier-cell b {
      display: block;
      font-size: 8.5px;
      text-transform: uppercase;
      color: #64748b;
    }
    table.freight-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    table.freight-table th {
      background: #f1f5f9;
      border-bottom: 1.5px solid #000;
      border-right: 1px solid #cbd5e1;
      padding: 6px 4px;
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 700;
      text-align: left;
    }
    table.freight-table td {
      border-bottom: 1px solid #e2e8f0;
      border-right: 1px solid #cbd5e1;
      padding: 6px 4px;
    }
    table.freight-table th:last-child, table.freight-table td:last-child {
      border-right: none;
    }
    .cert-box {
      padding: 8px 10px;
      font-size: 8.5px;
      color: #334155;
      border-bottom: 1.5px solid #000;
      background: #fafafa;
      line-height: 1.35;
    }
    .sig-grid {
      display: flex;
      border-bottom: 1px solid #000;
    }
    .sig-col {
      flex: 1;
      padding: 8px 10px;
      border-right: 1.5px solid #000;
      display: flex;
      flex-direction: column;
      justifyContent: space-between;
      min-height: 90px;
    }
    .sig-col:last-child {
      border-right: none;
    }
    .sig-img {
      max-height: 45px;
      max-width: 180px;
      object-fit: contain;
      margin: 4px 0;
    }
    .sig-line {
      border-top: 1px dashed #64748b;
      margin-top: 6px;
      padding-top: 2px;
      font-size: 8.5px;
      color: #475569;
    }
    .draft-banner {
      max-width: 820px;
      margin: 0 auto 8px;
      padding: 8px 12px;
      border: 2px solid #b91c1c;
      background: #fef2f2;
      color: #7f1d1d;
      font-size: 11px;
    }
    .no-print {
      max-width: 820px;
      margin: 12px auto;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .btn {
      background: #0f172a;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
      .bol-box { border: 1.5px solid #000; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  ${isFinal ? '' : `<div class="draft-banner"><b>DRAFT — NOT A VALID BILL OF LADING.</b> Outstanding items: ${readiness.blockers.map(e).join('; ')}.</div>`}
  <div class="bol-box">
    <!-- Header -->
    <div class="header-row">
      <div class="head-left">
        <h1>${e(docTitle)}</h1>
        <div class="meta-line"><b>Date:</b> ${e(dateStr)}</div>
        <div class="meta-line"><b>Carrier Name:</b> ${e(carrier)}</div>
        <div class="meta-line"><b>SCAC:</b> ${e(scac)} &nbsp;|&nbsp; <b>Pro / Load #:</b> ${e(declared(opts.proNumber))}</div>
      </div>
      <div class="head-right">
        <div class="meta-line"><b>Bill of Lading Number:</b></div>
        <div style="font-size: 15px; font-weight: 800; font-family: monospace; letter-spacing: 1px;">${e(bolNum)}</div>
        <div class="barcode-wrap">${barcodeSvg}</div>
      </div>
    </div>

    <!-- Shipper & Consignee -->
    <div class="grid-2">
      <div class="grid-col">
        <div class="col-title">Ship From (Origin Shipper)</div>
        <div class="party-name">${e(shipperName)}</div>
        <div>${e(shipperAddr)}</div>
        <div>${e(shipperCSZ)}</div>
        <div style="margin-top: 4px; font-size: 9.5px; color: #475569;"><b>SID#:</b> ${e(declared(opts.shipperId))} &nbsp; <b>FOB:</b> Origin</div>
      </div>
      <div class="grid-col">
        <div class="col-title">Ship To (Destination Consignee)</div>
        <div class="party-name">${e(consigneeName)}</div>
        <div>${e(consigneeAddr)}</div>
        <div>${e(consigneeCSZ)}</div>
        <div style="margin-top: 4px; font-size: 9.5px; color: #475569;"><b>CID#:</b> ${e(declared(opts.consigneeId))} &nbsp; <b>FOB:</b> Destination</div>
      </div>
    </div>

    <!-- Third Party Bill To & Special Instructions -->
    <div class="grid-2">
      <div class="grid-col" style="flex: 0.8;">
        <div class="col-title">Third Party Freight Charges Bill To</div>
        <div style="font-weight: 600;">${e(opts.billToName || shipperName)}</div>
        <div>${e(opts.billToAddress || shipperAddr)}</div>
        <div>${e(opts.billToCityStateZip || shipperCSZ)}</div>
        <div style="margin-top: 4px;"><b>Freight Terms:</b> ${e(terms)}</div>
      </div>
      <div class="grid-col" style="flex: 1.2;">
        <div class="col-title">Special Instructions &amp; Safety Placarding</div>
        <div>${e(opts.specialInstructions || 'None declared.')}</div>
        ${opts.emergencyPhone ? `<div style="margin-top: 4px; font-weight: 700; color: #b91c1c;">24-HR EMERGENCY RESPONSE: ${e(opts.emergencyPhone)}</div>` : ''}
      </div>
    </div>

    <!-- Carrier Equipment bar -->
    <div class="carrier-info-bar">
      <div class="carrier-cell"><b>Trailer #</b> ${e(trailer)}</div>
      <div class="carrier-cell"><b>Seal #</b> ${e(seal)}</div>
      <div class="carrier-cell"><b>SCAC</b> ${e(scac)}</div>
      <div class="carrier-cell"><b>Equipment Spec</b> ${e(eqName)}</div>
      <div class="carrier-cell"><b>Total Handling Units</b> ${totalLoadedPieces} Handling Unit(s)</div>
      <div class="carrier-cell"><b>Total Gross Weight</b> ${e(totalWeightText)}</div>
    </div>

    <!-- Commodities Table -->
    <table class="freight-table">
      <thead>
        <tr>
          <th style="width: 70px;">Handling Qty</th>
          <th style="width: 70px;">Pkg Type</th>
          <th style="width: 80px;">Weight (lbs)</th>
          <th style="width: 45px; text-align: center;">H.M.</th>
          <th>Commodity Description &amp; Lading Marks</th>
          <th style="width: 60px;">Stop #</th>
          <th style="width: 65px;">NMFC #</th>
          <th style="width: 50px;">Class</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from(grouped.entries()).map(([label, d]) => {
          const decl = opts.lineDeclarations?.[label];
          const lineWeight = d.unknown > 0
            ? `${d.weightKg > 0 ? '≥ ' + toLbs(d.weightKg).toLocaleString() + ' ' : ''}(${d.unknown} unit(s) UNKNOWN)`
            : toLbs(d.weightKg).toLocaleString();
          return `<tr>
            <td style="font-weight: 700;">${d.count}</td>
            <td>${e(declared(decl?.packageType))}</td>
            <td>${e(lineWeight)}</td>
            <td style="text-align: center; font-weight: 800; color: ${d.isHazmat ? '#dc2626' : '#94a3b8'};" title="Label heuristic unless operator-declared; verify against shipping papers">${d.isHazmat ? 'X' : '—'}</td>
            <td><b>${e(label)}</b></td>
            <td>Stop ${e(d.stop)}</td>
            <td>${e(declared(decl?.nmfc))}</td>
            <td>${e(declared(decl?.freightClass))}</td>
          </tr>`;
        }).join('')}
        <tr style="background: #f8fafc; font-weight: 800; border-top: 1.5px solid #000;">
          <td>${totalLoadedPieces}</td>
          <td></td>
          <td>${e(totalWeightText)}</td>
          <td colspan="5" style="text-align: right; padding-right: 12px; color: #475569;">TOTAL (FROM MANIFEST)</td>
        </tr>
      </tbody>
    </table>

    <!-- Regulatory Certification Statement -->
    <div class="cert-box">
      ${isFinal
        ? 'This is to certify that the above named materials are properly classified, packaged, marked, and labeled, and are in proper condition for transportation according to the applicable regulations of the Department of Transportation (DOT) and FMCSA 49 CFR Parts 392 &amp; 393. The carrier acknowledges receipt of packages and required placards. Carrier certifies emergency response info was provided.'
        : 'NO CERTIFICATION. This draft was generated from a geometric load plan and has not been verified or approved for issuance. Classification, packaging, weights, placarding and party details must be confirmed by the shipper before this becomes a Bill of Lading.'}
    </div>

    <!-- Signatures Section -->
    <div class="sig-grid">
      <div class="sig-col">
        <div class="col-title">Shipper Signature &amp; Date</div>
        ${sigShipper ? `<img class="sig-img" src="${e(sigShipper)}" alt="Shipper Signature" />` : '<div style="height: 35px;"></div>'}
        <div class="sig-line">
          Shipper certifies proper packaging &amp; weight.<br>
          <b>Date:</b> ${e(dateStr)}
        </div>
      </div>

      <div class="sig-col">
        <div class="col-title">Carrier / Driver Signature &amp; Date</div>
        ${sigDriver ? `<img class="sig-img" src="${e(sigDriver)}" alt="Driver Signature" />` : '<div style="height: 35px;"></div>'}
        <div class="sig-line">
          Carrier acknowledges receipt of ${totalLoadedPieces} piece(s).<br>
          <b>${opts.driverLoadAndCount ? '[X] Driver Load &amp; Count' : '[X] Shipper Load &amp; Count'}</b> &nbsp;|&nbsp; <b>Date:</b> ${e(dateStr)}
        </div>
      </div>

      <div class="sig-col">
        <div class="col-title">Consignee Acceptance Signature</div>
        <div style="height: 35px;"></div>
        <div class="sig-line">
          Received in good condition except as noted.<br>
          <b>Date:</b> ____________________
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
