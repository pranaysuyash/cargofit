import { describe, expect, it } from 'vitest';
import { verifyBarcodeMatch } from '../src/engine/barcode';
import { codeConfirmation, confirmationLabel } from '../src/engine/loadingConfirmation';

describe('loading confirmation evidence', () => {
  it('distinguishes manual confirmation from a matched camera or entered code', () => {
    expect(confirmationLabel({ method: 'manual', unitId: 'p1' })).toContain('no scan');
    const match = verifyBarcodeMatch('ABC', 'p1', 'label', 'ABC');
    const camera = codeConfirmation('camera', 'p1', match)!;
    const entered = codeConfirmation('entered-code', 'p1', match)!;
    expect(camera).toMatchObject({ method: 'camera', matchedBy: 'barcode' });
    expect(entered).toMatchObject({ method: 'entered-code', matchedBy: 'barcode' });
    expect(confirmationLabel(camera)).toContain('Camera scan');
  });
  it('does not create a confirmation for a mismatched declared barcode', () => {
    expect(codeConfirmation('camera', 'p1', verifyBarcodeMatch('prefix-ABC', 'p1', 'label', 'ABC'))).toBeNull();
  });
});
