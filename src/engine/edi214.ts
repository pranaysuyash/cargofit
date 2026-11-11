/**
 * ANSI X12 EDI 214 Transportation Carrier Shipment Status Message Generator.
 *
 * Creates a local EDI 214 document from explicitly entered event and partner data.
 * A loading plan does not establish that any physical status event occurred.
 */

import type { PlanFile } from './report';

export interface Edi214Options {
  carrierScac?: string;
  shipperId?: string;
  shipmentId?: string;
  bolNumber?: string;
  sealNumber?: string;
  equipmentId?: string;
  statusCode?: 'X3' | 'AF' | 'AG' | 'X6' | 'D1';
  statusReason?: string;
  originCity?: string;
  originState?: string;
  date?: Date;
  generatedAt?: Date;
  controlNumber?: string;
  usageIndicator?: 'P' | 'T';
  reportedWeightLbs?: number;
  reportedPieceCount?: number;
}

/**
 * Status Code Reference:
 * - X3: Arrived at pickup location
 * - AF: Carrier Departed with Entire Shipment
 * - AG: Estimated Time of Arrival at Delivery Point
 * - X6: En Route to Delivery Location
 * - D1: Completed Unloading at Delivery Location
 */
export function generateEdi214(_plan: PlanFile, opts: Edi214Options = {}): string {
  const clean = (value: string | undefined, label: string, max: number) => {
    const text = value?.trim() ?? '';
    if (!text || text.length > max || !/^[A-Za-z0-9 ._\/-]+$/.test(text)) throw new Error(`${label} is required and must contain supported EDI characters (maximum ${max}).`);
    return text;
  };
  const optional = (value: string | undefined, label: string, max: number) => value?.trim() ? clean(value, label, max) : null;
  const scac = clean(opts.carrierScac, 'Carrier SCAC', 4).toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(scac)) throw new Error('Carrier SCAC must be 2–4 letters.');
  const shipper = clean(opts.shipperId, 'Receiver identifier', 15);
  const shipmentId = clean(opts.shipmentId, 'Shipment identifier', 30);
  const bol = clean(opts.bolNumber, 'Bill of lading number', 30);
  const city = clean(opts.originCity, 'Event city', 30);
  const state = clean(opts.originState, 'Event state', 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new Error('Event state must be a two-letter code.');
  const statusCode = opts.statusCode;
  if (!statusCode || !['X3', 'AF', 'AG', 'X6', 'D1'].includes(statusCode)) throw new Error('Event status is required.');
  const reasonCode = clean(opts.statusReason, 'Status reason code', 2).toUpperCase();
  if (!/^[A-Z0-9]{2}$/.test(reasonCode)) throw new Error('Status reason code must be two letters or digits.');
  const control = opts.controlNumber?.trim();
  if (!control || !/^\d{9}$/.test(control)) throw new Error('A nine-digit interchange control number is required.');
  if (opts.usageIndicator !== 'P' && opts.usageIndicator !== 'T') throw new Error('A production or test usage indicator is required.');
  const now = opts.date;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('An event date and time are required.');
  const generatedAt = opts.generatedAt ?? new Date();
  if (!(generatedAt instanceof Date) || !Number.isFinite(generatedAt.getTime())) throw new Error('The file generation time is invalid.');
  const seal = optional(opts.sealNumber, 'Seal number', 30);
  const eqId = optional(opts.equipmentId, 'Equipment identifier', 30);
  const weight = opts.reportedWeightLbs;
  const pieces = opts.reportedPieceCount;
  if ((weight === undefined) !== (pieces === undefined) || (weight !== undefined && (!Number.isSafeInteger(weight) || weight <= 0)) || (pieces !== undefined && (!Number.isSafeInteger(pieces) || pieces <= 0))) throw new Error('Reported weight and piece count must both be positive whole numbers, or both omitted.');

  // YYYYMMDD and HHMM
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = now.getUTCDate().toString().padStart(2, '0');
  const hh = now.getUTCHours().toString().padStart(2, '0');
  const min = now.getUTCMinutes().toString().padStart(2, '0');

  const date8 = `${yyyy}${mm}${dd}`;
  const date6 = `${generatedAt.getUTCFullYear().toString().slice(-2)}${(generatedAt.getUTCMonth() + 1).toString().padStart(2, '0')}${generatedAt.getUTCDate().toString().padStart(2, '0')}`;
  const time4 = `${hh}${min}`;
  const generatedDate8 = `${generatedAt.getUTCFullYear()}${(generatedAt.getUTCMonth() + 1).toString().padStart(2, '0')}${generatedAt.getUTCDate().toString().padStart(2, '0')}`;
  const generatedTime4 = `${generatedAt.getUTCHours().toString().padStart(2, '0')}${generatedAt.getUTCMinutes().toString().padStart(2, '0')}`;

  const segments: string[] = [];

  // ISA Segment (Interchange Control Header) - fixed 106 chars
  const isaSender = scac.padEnd(15, ' ');
  const isaReceiver = shipper.padEnd(15, ' ');
  segments.push(`ISA*00*          *00*          *ZZ*${isaSender}*ZZ*${isaReceiver}*${date6}*${generatedTime4}*U*00401*${control}*0*${opts.usageIndicator}*>`);

  // GS Segment (Functional Group Header - QM = Transportation Carrier Shipment Status)
  segments.push(`GS*QM*${scac.trim()}*${shipper.trim()}*${generatedDate8}*${generatedTime4}*1*X*004010`);

  // Transaction Set 214
  const txSegments: string[] = [];
  txSegments.push(`ST*214*0001`);
  txSegments.push(`B10*${shipmentId}*${bol}*${scac.trim()}`);
  if (seal) txSegments.push(`L11*${seal}*SE`);
  if (eqId) txSegments.push(`L11*${eqId}*EQ`);
  txSegments.push(`AT7*${statusCode}*${reasonCode}***${date8}*${time4}*UT`);
  txSegments.push(`MS1*${city}*${state}*USA`);
  if (weight !== undefined && pieces !== undefined) txSegments.push(`AT8*G*L*${weight}*${pieces}`);

  // Count ST through SE inclusive
  const seCount = txSegments.length + 1;
  txSegments.push(`SE*${seCount}*0001`);

  for (const s of txSegments) segments.push(s);

  // Group & Interchange Trailers
  segments.push(`GE*1*1`);
  segments.push(`IEA*1*${control}`);

  return segments.join('~\n') + '~\n';
}
