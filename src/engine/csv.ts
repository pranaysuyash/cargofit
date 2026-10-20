import type { CargoRow, LengthUnit, MassUnit, RotationRule } from './types';
import { parseLengthUnit, parseMassUnit } from './units';

export interface ImportIssue {
  line: number;
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ImportResult {
  rows: CargoRow[];
  issues: ImportIssue[];
  delimiter: string;
  totalLines: number;
}

let uidCounter = 0;
export const newUid = (prefix = 'r') => `${prefix}${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts: [string, number][] = [',', ';', '\t'].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** RFC-4180-ish parser: quotes, escaped quotes, embedded newlines. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delimiter) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((v) => v.trim() !== '')) out.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((v) => v.trim() !== '')) out.push(row);
  return out;
}

type Field = 'label' | 'qty' | 'length' | 'width' | 'height' | 'unit' | 'weight' | 'wunit' | 'rotation' | 'stackable' | 'stop';
const ALIASES: Record<Field, string[]> = {
  label: ['label', 'id', 'name', 'sku', 'item', 'identifier', 'description', 'itemid'],
  qty: ['qty', 'quantity', 'count', 'pcs', 'pieces', 'units'],
  length: ['length', 'l', 'len'],
  width: ['width', 'w', 'wid'],
  height: ['height', 'h', 'hgt'],
  unit: ['unit', 'dimunit', 'dimensionunit', 'uom', 'dimensionsunit', 'sizeunit'],
  weight: ['weight', 'wt', 'mass', 'weighteach', 'unitweight', 'weightperunit'],
  wunit: ['weightunit', 'wunit', 'massunit', 'wtunit'],
  rotation: ['rotation', 'orientation', 'rotate', 'rotationrule'],
  stackable: ['stackable', 'stack', 'canstack'],
  stop: ['stop', 'drop', 'destination', 'droporder', 'unloadorder', 'stopnum', 'stopnumber'],
};

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '');

function parseNumber(raw: string): number | null | 'bad' {
  const t = raw.trim();
  if (t === '') return null;
  const cleaned = t.replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 'bad';
}

export function importCargoTable(table: string[][], delimiter = ','): ImportResult {
  const issues: ImportIssue[] = [];
  if (table.length === 0) {
    return { rows: [], issues: [{ line: 0, field: 'file', severity: 'error', message: 'File is empty.' }], delimiter, totalLines: 0 };
  }
  const header = table[0];
  const col = new Map<Field, number>();
  let defaultDim: LengthUnit | null = null;
  let defaultMass: MassUnit | null = null;
  header.forEach((h, i) => {
    const n = norm(h);
    for (const f of Object.keys(ALIASES) as Field[]) {
      if (!col.has(f) && ALIASES[f].includes(n)) col.set(f, i);
    }
    const par = /\(([^)]+)\)/.exec(h)?.[1];
    if (par) {
      const nn = norm(h);
      if (['length', 'width', 'height', 'l', 'w', 'h'].includes(nn)) defaultDim ??= parseLengthUnit(par);
      if (['weight', 'wt', 'mass'].includes(nn)) defaultMass ??= parseMassUnit(par);
    }
  });
  for (const req of ['label', 'length', 'width', 'height'] as Field[]) {
    if (!col.has(req)) issues.push({ line: 1, field: req, severity: 'error', message: `Required column "${req}" not found. Headers seen: ${header.join(', ')}` });
  }
  if (issues.some((i) => i.severity === 'error')) return { rows: [], issues, delimiter, totalLines: table.length - 1 };
  if (!col.has('qty')) issues.push({ line: 1, field: 'qty', severity: 'info', message: 'No quantity column — each row counted as 1.' });
  if (!col.has('unit') && !defaultDim) issues.push({ line: 1, field: 'unit', severity: 'warning', message: 'No dimension unit column — assuming millimetres. Check each row.' });
  if (col.has('weight') && !col.has('wunit') && !defaultMass) issues.push({ line: 1, field: 'weight', severity: 'warning', message: 'No weight unit column — assuming kilograms. Check each row.' });

  const get = (r: string[], f: Field) => (col.has(f) ? (r[col.get(f)!] ?? '') : '');
  const rows: CargoRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    if (r.length > header.length && r.slice(header.length).some((v) => v.trim())) {
      issues.push({ line, field: 'row', severity: 'warning', message: `Row has ${r.length} cells but header has ${header.length}; extra cells ignored.` });
    }
    const num = (f: Field): number | null => {
      const v = parseNumber(get(r, f));
      if (v === 'bad') { issues.push({ line, field: f, severity: 'error', message: `Could not read "${get(r, f).trim()}" as a number — left empty for you to repair.` }); return null; }
      return v;
    };
    let dimUnit: LengthUnit = defaultDim ?? 'mm';
    const u = get(r, 'unit').trim();
    if (u) {
      const p = parseLengthUnit(u);
      if (p) dimUnit = p; else issues.push({ line, field: 'unit', severity: 'error', message: `Unknown dimension unit "${u}" — assumed ${dimUnit}; please confirm.` });
    }
    let weightUnit: MassUnit = defaultMass ?? 'kg';
    const wu = get(r, 'wunit').trim();
    if (wu) {
      const p = parseMassUnit(wu);
      if (p) weightUnit = p; else issues.push({ line, field: 'wunit', severity: 'error', message: `Unknown weight unit "${wu}" — assumed ${weightUnit}; please confirm.` });
    }
    const qtyRaw = col.has('qty') ? num('qty') : 1;
    let rotation: RotationRule = 'upright';
    const rr = get(r, 'rotation').trim().toLowerCase();
    if (rr) {
      if (['any', 'free', 'all', 'yes', 'y', 'true', '6'].includes(rr)) rotation = 'any';
      else if (['upright', 'yaw', 'tsu', 'this side up', 'flat', '2'].includes(rr)) rotation = 'upright';
      else if (['fixed', 'none', 'no', 'n', 'false', '1', 'locked'].includes(rr)) rotation = 'fixed';
      else issues.push({ line, field: 'rotation', severity: 'warning', message: `Unknown rotation "${rr}" — using upright (yaw only).` });
    } else if (col.has('rotation')) issues.push({ line, field: 'rotation', severity: 'info', message: 'Blank rotation — defaulted to upright (conservative).' });
    let stackable = false;
    const sr = get(r, 'stackable').trim().toLowerCase();
    if (sr) {
      if (['yes', 'y', 'true', '1', 'stackable'].includes(sr)) stackable = true;
      else if (['no', 'n', 'false', '0', 'no-stack', 'nostack', 'fragile'].includes(sr)) stackable = false;
      else issues.push({ line, field: 'stackable', severity: 'warning', message: `Unknown stackable value "${sr}" — treated as no-stack.` });
    } else if (col.has('stackable')) issues.push({ line, field: 'stackable', severity: 'info', message: 'Blank stackable — treated as no-stack (conservative).' });
    
    const stopVal = col.has('stop') ? num('stop') : null;
    const stop = stopVal !== null && stopVal > 0 ? Math.round(stopVal) : null;

    rows.push({
      uid: newUid(), label: get(r, 'label').trim(), qty: qtyRaw,
      length: num('length'), width: num('width'), height: num('height'), dimUnit,
      weight: col.has('weight') ? num('weight') : null, weightUnit, rotation, stackable,
      stop,
    });
  }
  return { rows, issues, delimiter, totalLines: table.length - 1 };
}

export function importCargoCsv(text: string): ImportResult {
  const delimiter = detectDelimiter(text);
  const table = parseCsv(text, delimiter);
  return importCargoTable(table, delimiter);
}

const esc = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function cargoToCsv(rows: CargoRow[]): string {
  const hasStop = rows.some((r) => r.stop !== undefined && r.stop !== null);
  const head = hasStop
    ? 'label,qty,length,width,height,dim_unit,weight,weight_unit,rotation,stackable,stop'
    : 'label,qty,length,width,height,dim_unit,weight,weight_unit,rotation,stackable';
  const lines = rows.map((r) => {
    const base = [r.label, r.qty, r.length, r.width, r.height, r.dimUnit, r.weight, r.weightUnit, r.rotation, r.stackable ? 'yes' : 'no'];
    if (hasStop) base.push(r.stop ?? '');
    return base.map(esc).join(',');
  });
  return [head, ...lines].join('\n') + '\n';
}
