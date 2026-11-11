import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NmfcClassificationModal } from '../src/ui/NmfcClassificationModal';

describe('density estimate input provenance', () => {
  it('withholds an estimate when cargo weight is unknown', () => {
    const html = renderToStaticMarkup(createElement(NmfcClassificationModal, { isOpen: true, onClose: () => {}, initialWeightLbs: 0, initialVolumeCuFt: 100 }));
    expect(html).toContain('Enter a positive cargo weight and volume');
    expect(html).not.toContain('18,500');
    expect(html).not.toContain('Recommended Class:');
    expect(html).toMatch(/<button disabled=""[^>]*>\s*Include estimate/);
  });
});
