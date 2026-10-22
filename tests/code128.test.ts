import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, code128Modules, code128Svg, encodeCode128B } from '../src/engine/code128';

/** Independent decoder: module string -> text (Subset B), verifying checksum and stop. */
function decode(modules: string): string {
  const widthsToValue = new Map(CODE128_PATTERNS.map((p, i) => [p, i]));
  const runs: number[] = [];
  let i = 0;
  while (i < modules.length) {
    let j = i;
    while (j < modules.length && modules[j] === modules[i]) j++;
    runs.push(j - i);
    i = j;
  }
  const symbols: number[] = [];
  let k = 0;
  while (k + 6 <= runs.length) {
    const six = runs.slice(k, k + 6).join('');
    if (six === '233111' && runs[k + 6] === 2) { symbols.push(106); k += 7; break; }
    const v = widthsToValue.get(six);
    if (v === undefined) throw new Error(`bad symbol ${six}`);
    symbols.push(v);
    k += 6;
  }
  expect(symbols[0]).toBe(104);
  expect(symbols[symbols.length - 1]).toBe(106);
  const data = symbols.slice(1, -2);
  const check = symbols[symbols.length - 2];
  const sum = 104 + data.reduce((a, v, idx) => a + (idx + 1) * v, 0);
  expect(check).toBe(sum % 103);
  return data.map((v) => String.fromCharCode(v + 32)).join('');
}

describe('Code 128 Subset B encoder', () => {
  it('has 107 patterns, each 11 modules wide (STOP 13)', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const total = [...p].reduce((a, c) => a + Number(c), 0);
      expect(total).toBe(i === 106 ? 13 : 11);
      expect(p.length).toBe(i === 106 ? 7 : 6);
    });
  });

  it('patterns are unique', () => {
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it('computes the documented checksum for a single character', () => {
    // start B (104) + 1 * value('A' = 33) = 137; 137 mod 103 = 34
    expect(encodeCode128B('A')).toEqual([104, 33, 34, 106]);
  });

  it('round-trips through an independent decoder', () => {
    for (const text of ['BOL-99881122', 'ABC abc 0123456789 ~!@', 'X']) {
      expect(decode(code128Modules(encodeCode128B(text)))).toBe(text);
    }
  });

  it('rejects empty and non-encodable input', () => {
    expect(() => encodeCode128B('')).toThrow();
    expect(() => encodeCode128B('héllo')).toThrow();
  });

  it('renders SVG with 10-module quiet zones on both sides', () => {
    const svg = code128Svg('BOL-1', { moduleWidth: 2, height: 40 });
    const modules = code128Modules(encodeCode128B('BOL-1')).length;
    expect(svg).toContain(`width="${(modules + 20) * 2}.00"`);
    const firstBar = /<rect x="([\d.]+)" y="0"/.exec(svg);
    expect(Number(firstBar![1])).toBe(20);
  });
});
