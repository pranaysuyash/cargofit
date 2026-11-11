import type { BarcodeMatchResult } from './barcode';

export type LoadingConfirmation =
  | { method: 'manual'; unitId: string }
  | { method: 'camera' | 'entered-code'; unitId: string; matchedBy: Exclude<BarcodeMatchResult['matchedBy'], 'none'> };

export function codeConfirmation(method: 'camera' | 'entered-code', unitId: string, match: BarcodeMatchResult): LoadingConfirmation | null {
  return match.matched && match.matchedBy !== 'none' ? { method, unitId, matchedBy: match.matchedBy } : null;
}

export function confirmationLabel(confirmation: LoadingConfirmation): string {
  if (confirmation.method === 'manual') return `Manually confirmed: ${confirmation.unitId} (no scan)`;
  return `${confirmation.method === 'camera' ? 'Camera scan' : 'Entered code'} matched ${confirmation.unitId} by ${confirmation.matchedBy.replace('_', ' ')}`;
}
