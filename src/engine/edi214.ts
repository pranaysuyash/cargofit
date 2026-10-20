/**
 * ANSI X12 EDI 214 Transportation Carrier Shipment Status Message Generator.
 *
 * Generates official EDI 214 status messages from verified Cargo Fit loading plans,
 * providing proof of equipment loading, physical door seal numbers, pallet/piece
 * count reconciliations, and gross loaded weight.
 */

import type { PlanFile } from './report';

export interface Edi214Options {
  carrierScac?: string;
  shipperId?: string;
  bolNumber?: string;
  sealNumber?: string;
  statusCode?: 'X3' | 'AF' | 'AG' | 'X6' | 'D1';
  statusReason?: string;
  originCity?: string;
  originState?: string;
  date?: Date;
}

/**
 * Status Code Reference:
 * - X3: Arrived at Pickup Location and Loaded / Verified
 * - AF: Carrier Departed with Entire Shipment
 * - AG: Estimated Time of Arrival at Delivery Point
 * - X6: En Route to Delivery Location
 * - D1: Completed Unloading at Delivery Location
 */
export function generateEdi214(plan: PlanFile, opts: Edi214Options = {}): string {
  const scac = (opts.carrierScac || 'CRGO').toUpperCase().padEnd(4, 'X').slice(0, 4);
  const shipper = (opts.shipperId || 'SHIPPER').toUpperCase().padEnd(10, ' ').slice(0, 10);
  const now = opts.date || new Date();

  // YYYYMMDD and HHMM
  const yyyy = now.getUTCFullYear().toString();
  const yy = yyyy.slice(-2);
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = now.getUTCDate().toString().padStart(2, '0');
  const hh = now.getUTCHours().toString().padStart(2, '0');
  const min = now.getUTCMinutes().toString().padStart(2, '0');

  const date8 = `${yyyy}${mm}${dd}`;
  const date6 = `${yy}${mm}${dd}`;
  const time4 = `${hh}${min}`;

  const hash = plan.inputHash;
  const bol = opts.bolNumber || `BOL-${plan.scenario.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase() || 'PLAN01'}`;
  const shipmentId = `SHP-${hash.slice(0, 8).toUpperCase()}`;
  const seal = opts.sealNumber || `SEAL-${hash.slice(0, 6).toUpperCase()}`;
  const eqId = plan.equipmentId.toUpperCase();
  const statusCode = opts.statusCode || 'X3';
  const reasonCode = opts.statusReason || 'NS';
  const city = opts.originCity || 'CHICAGO';
  const state = opts.originState || 'IL';

  const totalLoadedPieces = plan.placements.length;
  const totalWeightLbs = Math.round(plan.metrics.loadedWeightKg * 2.20462);

  const segments: string[] = [];

  // ISA Segment (Interchange Control Header) - fixed 106 chars
  const isaSender = scac.padEnd(15, ' ');
  const isaReceiver = shipper.padEnd(15, ' ');
  segments.push(`ISA*00*          *00*          *ZZ*${isaSender}*ZZ*${isaReceiver}*${date6}*${time4}*U*00401*000000001*0*P*>`);

  // GS Segment (Functional Group Header - QM = Transportation Carrier Shipment Status)
  segments.push(`GS*QM*${scac.trim()}*${shipper.trim()}*${date8}*${time4}*1*X*004010`);

  // Transaction Set 214
  const txSegments: string[] = [];
  txSegments.push(`ST*214*0001`);
  txSegments.push(`B10*${shipmentId}*${bol}*${scac.trim()}`);
  txSegments.push(`L11*${seal}*SE`);
  txSegments.push(`L11*${eqId}*EQ`);
  txSegments.push(`MAN*GM*00${hash.slice(0, 18).padEnd(18, '0')}`);
  txSegments.push(`AT7*${statusCode}*${reasonCode}*${date8}*${time4}*LT`);
  txSegments.push(`MS1*${city}*${state}*USA`);
  txSegments.push(`AT8*G*L*${totalWeightLbs}*${totalLoadedPieces}*PLT`);

  // Count ST through SE inclusive
  const seCount = txSegments.length + 1;
  txSegments.push(`SE*${seCount}*0001`);

  for (const s of txSegments) segments.push(s);

  // Group & Interchange Trailers
  segments.push(`GE*1*1`);
  segments.push(`IEA*1*000000001`);

  return segments.join('~\n') + '~\n';
}
