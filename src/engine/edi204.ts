/**
 * ANSI X12 EDI 204 Motor Carrier Load Tender Parser.
 *
 * Implements standard EDI 204 transaction set parsing into typed CargoRow[]
 * manifests and multi-stop drop sequences without inventing missing dimensions.
 *
 * Supported Segments:
 * - ST: Transaction Set Header (verifies 204)
 * - B2 / B2A: Beginning Segment for Shipping Instructions & Purpose
 * - N1 / N3 / N4: Parties (Shipper, Consignee, Delivery stops)
 * - S5: Stop-off Details (sequence number, stop reason code, declared weight)
 * - OID / L0: Order Identification & Lading Quantities
 * - L5: Lading Description
 * - AT8: Shipment Weight, Packaging and Quantity Data
 * - MEA: Physical Measurements (length, width, height, unit)
 */

import type { CargoRow, LengthUnit, MassUnit } from './types';
import type { ImportIssue } from './csv';
import { newUid } from './csv';

export interface EdiParty {
  role: 'SH' | 'CN' | 'SF' | 'ST' | string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface Edi204ParseResult {
  bolNumber?: string;
  scac?: string;
  parties: EdiParty[];
  stopsCount: number;
  rows: CargoRow[];
  issues: ImportIssue[];
  totalDeclaredWeightLbs: number;
  rawSegmentCount: number;
}

/**
 * Normalizes dimension units from EDI qualifiers (IN, FT, CM, MM, M) to LengthUnit.
 */
function normalizeEdiDimUnit(raw?: string): LengthUnit {
  const u = (raw ?? '').trim().toUpperCase();
  if (u === 'IN' || u === 'INCH' || u === 'INCHES') return 'in';
  if (u === 'FT' || u === 'FEET' || u === 'FOOT') return 'ft';
  if (u === 'CM' || u === 'CENTIMETER') return 'cm';
  if (u === 'MM' || u === 'MILLIMETER') return 'mm';
  if (u === 'M' || u === 'METER') return 'm';
  return 'in';
}

/**
 * Normalizes mass units from EDI qualifiers (L, LB, K, KG) to MassUnit.
 */
function normalizeEdiWeightUnit(raw?: string): MassUnit {
  const u = (raw ?? '').trim().toUpperCase();
  if (u === 'K' || u === 'KG' || u === 'KILOGRAM') return 'kg';
  if (u === 'T' || u === 'TON') return 't';
  return 'lb';
}

/**
 * Checks for dimension patterns embedded in description text, e.g. "48x40x60 in" or "1200x800x1440 mm".
 */
function extractDimsFromText(desc: string): {
  length: number;
  width: number;
  height: number;
  unit: LengthUnit;
} | null {
  const match = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*(in|inch|inches|cm|mm|m|ft)?/i);
  if (!match) return null;
  const l = parseFloat(match[1]);
  const w = parseFloat(match[2]);
  const h = parseFloat(match[3]);
  const u = normalizeEdiDimUnit(match[4] || 'in');
  if (Number.isFinite(l) && Number.isFinite(w) && Number.isFinite(h) && l > 0 && w > 0 && h > 0) {
    return { length: l, width: w, height: h, unit: u };
  }
  return null;
}

/**
 * Parses an ANSI X12 EDI 204 document string into structured CargoRows.
 */
export function parseEdi204(ediText: string): Edi204ParseResult {
  const issues: ImportIssue[] = [];
  const parties: EdiParty[] = [];
  const rows: CargoRow[] = [];

  // Detect segment terminator (typically ~ or newline)
  const trimmed = ediText.trim();
  const segmentDelimiter = trimmed.includes('~') ? '~' : '\n';
  const rawSegments = trimmed
    .split(segmentDelimiter)
    .map((s) => s.trim().replace(/\r$/, ''))
    .filter((s) => s.length > 0);

  let bolNumber: string | undefined;
  let scac: string | undefined;
  let currentStop = 1;
  let stopCount = 0;

  // Temporary builder for current lading item
  let currentItem: {
    label: string;
    qty: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    dimUnit: LengthUnit;
    weight: number | null;
    weightUnit: MassUnit;
    stop: number;
    stackable: boolean;
  } | null = null;

  function flushCurrentItem(lineNum: number) {
    if (!currentItem) return;
    if (currentItem.qty === null || currentItem.qty <= 0) {
      currentItem.qty = 1;
      issues.push({
        line: lineNum,
        field: 'qty',
        severity: 'info',
        message: `Line item "${currentItem.label}" did not declare quantity; defaulted to 1 unit.`,
      });
    }

    if (currentItem.length === null || currentItem.width === null || currentItem.height === null) {
      issues.push({
        line: lineNum,
        field: 'dimensions',
        severity: 'warning',
        message: `Line item "${currentItem.label}" did not provide 3D dimensions in MEA segments. Requires manual dimension entry.`,
      });
    }

    rows.push({
      uid: newUid('edi'),
      label: currentItem.label || `Cargo Item ${rows.length + 1}`,
      qty: currentItem.qty,
      length: currentItem.length,
      width: currentItem.width,
      height: currentItem.height,
      dimUnit: currentItem.dimUnit,
      weight: currentItem.weight,
      weightUnit: currentItem.weightUnit,
      rotation: 'upright',
      stackable: currentItem.stackable,
      stop: currentItem.stop,
    });
    currentItem = null;
  }

  let curParty: Partial<EdiParty> | null = null;

  for (let idx = 0; idx < rawSegments.length; idx++) {
    const rawSeg = rawSegments[idx];
    const el = rawSeg.split('*');
    const segId = el[0]?.trim().toUpperCase();
    const lineNum = idx + 1;

    switch (segId) {
      case 'ST': {
        const transSetId = el[1]?.trim();
        if (transSetId !== '204') {
          issues.push({
            line: lineNum,
            field: 'ST',
            severity: 'warning',
            message: `Transaction set is ${transSetId || 'unknown'} (expected 204 Motor Carrier Load Tender). Parsing compatible segments.`,
          });
        }
        break;
      }

      case 'B2': {
        // B2**SCAC*BOL**PaymentMethod
        if (el[2]) scac = el[2].trim();
        if (el[4]) bolNumber = el[4].trim();
        else if (el[3]) bolNumber = el[3].trim();
        break;
      }

      case 'N1': {
        // N1*Role*Name*IDCodeQualifier*IDCode
        if (curParty && curParty.name) {
          parties.push(curParty as EdiParty);
        }
        curParty = {
          role: el[1]?.trim() || 'UNKNOWN',
          name: el[2]?.trim() || '',
        };
        break;
      }

      case 'N3': {
        if (curParty) {
          curParty.address = el[1]?.trim();
        }
        break;
      }

      case 'N4': {
        if (curParty) {
          curParty.city = el[1]?.trim();
          curParty.state = el[2]?.trim();
          curParty.zip = el[3]?.trim();
          parties.push(curParty as EdiParty);
          curParty = null;
        }
        break;
      }

      case 'S5': {
        // Stop sequence details: S5*StopSeqNum*StopReasonCode*Weight*WeightUnit...
        flushCurrentItem(lineNum);
        const seq = parseInt(el[1]?.trim() || '1', 10);
        if (Number.isFinite(seq) && seq > 0) {
          currentStop = seq;
          if (seq > stopCount) stopCount = seq;
        }
        break;
      }

      case 'OID':
      case 'L0': {
        flushCurrentItem(lineNum);
        // OID*OrderNumber***UnitQualifier*Weight*Volume
        const po = el[1]?.trim();
        const weightVal = parseFloat(el[5]?.trim() || el[4]?.trim() || '');
        const hasWeight = Number.isFinite(weightVal) && weightVal > 0;

        currentItem = {
          label: po ? `Order ${po}` : `Lading Item ${rows.length + 1}`,
          qty: null,
          length: null,
          width: null,
          height: null,
          dimUnit: 'in',
          weight: hasWeight ? weightVal : null,
          weightUnit: 'lb',
          stop: currentStop,
          stackable: false,
        };
        break;
      }

      case 'L5': {
        // Lading description: L5*LineItemNumber*Description
        const desc = el[2]?.trim();
        if (desc) {
          if (!currentItem) {
            currentItem = {
              label: desc,
              qty: null,
              length: null,
              width: null,
              height: null,
              dimUnit: 'in',
              weight: null,
              weightUnit: 'lb',
              stop: currentStop,
              stackable: false,
            };
          } else {
            currentItem.label = desc;
          }

          // Check if dimensions are written inside description
          const extractedDims = extractDimsFromText(desc);
          if (extractedDims) {
            currentItem.length = extractedDims.length;
            currentItem.width = extractedDims.width;
            currentItem.height = extractedDims.height;
            currentItem.dimUnit = extractedDims.unit;
          }
        }
        break;
      }

      case 'AT8': {
        // Weight, packaging, quantity: AT8*WeightQualifier*WeightUnit*Weight*Quantity*PackagingForm
        const wUnit = normalizeEdiWeightUnit(el[2]);
        const totalWt = parseFloat(el[3]?.trim() || '');
        const qtyVal = parseInt(el[4]?.trim() || '', 10);
        const pkgCode = el[5]?.trim();

        if (!currentItem) {
          currentItem = {
            label: pkgCode ? `${pkgCode} Freight` : `Cargo Item ${rows.length + 1}`,
            qty: Number.isFinite(qtyVal) && qtyVal > 0 ? qtyVal : 1,
            length: null,
            width: null,
            height: null,
            dimUnit: 'in',
            weight: null,
            weightUnit: wUnit,
            stop: currentStop,
            stackable: false,
          };
        } else {
          if (Number.isFinite(qtyVal) && qtyVal > 0) currentItem.qty = qtyVal;
        }

        if (Number.isFinite(totalWt) && totalWt > 0) {
          const qty = currentItem.qty && currentItem.qty > 0 ? currentItem.qty : 1;
          // In CargoRow, weight is PER UNIT
          currentItem.weight = Math.round((totalWt / qty) * 10) / 10;
          currentItem.weightUnit = wUnit;
        }
        break;
      }

      case 'MEA': {
        // Measurements: MEA*Reference*Qualifier*Value*Unit
        if (!currentItem) {
          currentItem = {
            label: `Cargo Item ${rows.length + 1}`,
            qty: 1,
            length: null,
            width: null,
            height: null,
            dimUnit: 'in',
            weight: null,
            weightUnit: 'lb',
            stop: currentStop,
            stackable: false,
          };
        }

        const qual = el[2]?.trim().toUpperCase();
        const val = parseFloat(el[3]?.trim() || '');
        const u = normalizeEdiDimUnit(el[4]);

        if (Number.isFinite(val) && val > 0) {
          currentItem.dimUnit = u;
          if (qual === 'LN' || qual === 'L') currentItem.length = val;
          else if (qual === 'WD' || qual === 'W') currentItem.width = val;
          else if (qual === 'HT' || qual === 'H') currentItem.height = val;
        }
        break;
      }

      case 'SE': {
        flushCurrentItem(lineNum);
        break;
      }
    }
  }

  // Flush any trailing item
  flushCurrentItem(rawSegments.length);

  if (curParty && curParty.name) {
    parties.push(curParty as EdiParty);
  }

  // Calculate total declared weight in lbs
  let totalDeclaredWeightLbs = 0;
  for (const r of rows) {
    if (r.weight !== null && r.qty !== null) {
      const unitLbs = r.weightUnit === 'kg' ? r.weight * 2.20462 : r.weightUnit === 't' ? r.weight * 2000 : r.weight;
      totalDeclaredWeightLbs += unitLbs * r.qty;
    }
  }

  return {
    bolNumber,
    scac,
    parties,
    stopsCount: Math.max(1, stopCount),
    rows,
    issues,
    totalDeclaredWeightLbs: Math.round(totalDeclaredWeightLbs),
    rawSegmentCount: rawSegments.length,
  };
}
