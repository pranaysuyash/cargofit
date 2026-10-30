import { expect, it } from 'vitest';
import { verifyBarcodeMatch } from '../src/engine/barcode';
it('uses the declared physical barcode exactly, preserving case and leading zeros',()=>{
  expect(verifyBarcodeMatch('00123-Ab\r\n','HU-01','Pallet','00123-Ab').matched).toBe(true);
  for(const code of ['HU-01','Pallet','prefix-00123-Ab','123-Ab','00123-ab']) {
    expect(verifyBarcodeMatch(code,'HU-01','Pallet','00123-Ab').matched).toBe(false);
  }
});
