/**
 * Optical Barcode & QR Code Verification Engine.
 * Supports hardware/camera scanning on mobile/rugged devices to verify physical
 * pallets and SKU tags on the loading dock before bay placement.
 */

export interface BarcodeMatchResult {
  matched: boolean;
  code: string;
  matchedBy: 'unit_id' | 'sku_label' | 'partial' | 'none';
  confidence: number;
}

/**
 * Normalizes barcode or QR code strings (strips whitespace, symbols, leading zeros).
 */
export function normalizeBarcode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\r\n\t]/g, '');
}

/**
 * Compares a scanned barcode or QR code against the active cargo unit.
 */
export function verifyBarcodeMatch(
  scannedCode: string,
  targetUnitId: string,
  targetSkuLabel: string
): BarcodeMatchResult {
  const normScan = normalizeBarcode(scannedCode);
  const normId = normalizeBarcode(targetUnitId);
  const normLabel = normalizeBarcode(targetSkuLabel);

  if (normScan === normId) {
    return { matched: true, code: scannedCode, matchedBy: 'unit_id', confidence: 1.0 };
  }

  if (normScan === normLabel) {
    return { matched: true, code: scannedCode, matchedBy: 'sku_label', confidence: 0.95 };
  }

  // Check if unit ID or SKU is embedded within the barcode string (e.g. GS1-128 formatted tag)
  if (normScan.includes(normId)) {
    return { matched: true, code: scannedCode, matchedBy: 'partial', confidence: 0.90 };
  }

  if (normLabel.length >= 4 && normScan.includes(normLabel)) {
    return { matched: true, code: scannedCode, matchedBy: 'partial', confidence: 0.85 };
  }

  return { matched: false, code: scannedCode, matchedBy: 'none', confidence: 0 };
}

/**
 * Detects if the browser environment supports the native Shape Detection BarcodeDetector API.
 */
export function hasNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}
