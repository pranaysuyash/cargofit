/**
 * Code 128 (ISO/IEC 15417) encoder, Subset B, rendered as SVG.
 *
 * Symbol values 0-105 are 11 modules wide (bar,space,bar,space,bar,space);
 * the STOP symbol (106) is 13 modules wide (adds a terminating 2-module bar).
 * Checksum = (startValue + Σ position × value) mod 103.
 * A 10-module quiet zone is emitted on both sides, as required by the spec.
 *
 * Subset B covers printable ASCII 32–126 which is sufficient for BOL/PRO
 * numbers. Anything outside that range throws rather than silently producing a
 * barcode that would not scan to the declared value.
 */

/** Element widths per symbol value, alternating bar/space starting with a bar. */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export const CODE128_START_B = 104;
export const CODE128_STOP = 106;
export const CODE128_QUIET_MODULES = 10;

/** Returns the symbol values (start, data…, checksum, stop) for a Subset B string. */
export function encodeCode128B(text: string): number[] {
  if (text.length === 0) throw new Error('Code 128: empty value');
  const values: number[] = [CODE128_START_B];
  let sum = CODE128_START_B;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 || c > 126) throw new Error(`Code 128 Subset B cannot encode character code ${c}`);
    const v = c - 32;
    values.push(v);
    sum += (i + 1) * v;
  }
  values.push(sum % 103);
  values.push(CODE128_STOP);
  return values;
}

/** Expands symbol values to a module string of '1' (bar) / '0' (space), without quiet zones. */
export function code128Modules(values: number[]): string {
  let out = '';
  for (const v of values) {
    const pattern = CODE128_PATTERNS[v];
    for (let i = 0; i < pattern.length; i++) {
      out += (i % 2 === 0 ? '1' : '0').repeat(Number(pattern[i]));
    }
  }
  return out;
}

export interface Code128SvgOptions {
  moduleWidth?: number;
  height?: number;
}

/** Renders a scannable Code 128-B SVG including quiet zones. */
export function code128Svg(text: string, opts: Code128SvgOptions = {}): string {
  const mw = opts.moduleWidth ?? 1.6;
  const height = opts.height ?? 42;
  const modules = code128Modules(encodeCode128B(text));
  const totalModules = modules.length + CODE128_QUIET_MODULES * 2;
  const rects: string[] = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === '1') {
      let j = i;
      while (j < modules.length && modules[j] === '1') j++;
      const x = (CODE128_QUIET_MODULES + i) * mw;
      rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${((j - i) * mw).toFixed(2)}" height="${height}" fill="#000"/>`);
      i = j;
    } else {
      i++;
    }
  }
  const width = (totalModules * mw).toFixed(2);
  // The aria-label carries the encoded text, which is validated to printable ASCII only,
  // but is still attribute-escaped defensively.
  const label = text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Code 128 barcode: ${label}"><rect width="${width}" height="${height}" fill="#fff"/>${rects.join('')}</svg>`;
}
