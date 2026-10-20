import type { LengthUnit, MassUnit } from './types';

export const LENGTH_UNITS: LengthUnit[] = ['mm', 'cm', 'm', 'in', 'ft'];
export const MASS_UNITS: MassUnit[] = ['kg', 'lb', 't'];

export const MM_PER: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
export const KG_PER: Record<MassUnit, number> = { kg: 1, lb: 0.45359237, t: 1000 };

/** Round to 0.01 mm so unit-converted values compare stably. */
const r2 = (v: number) => Math.round(v * 100) / 100;

export const toMm = (v: number, u: LengthUnit): number => r2(v * MM_PER[u]);
export const toKg = (v: number, u: MassUnit): number => Math.round(v * KG_PER[u] * 1e4) / 1e4;
export const fromMm = (mm: number, u: LengthUnit): number => mm / MM_PER[u];
export const fromKg = (kg: number, u: MassUnit): number => kg / KG_PER[u];

export function parseLengthUnit(s: string): LengthUnit | null {
  const t = s.trim().toLowerCase().replace(/\./g, '');
  const map: Record<string, LengthUnit> = {
    mm: 'mm', millimeter: 'mm', millimetre: 'mm', millimeters: 'mm', millimetres: 'mm',
    cm: 'cm', centimeter: 'cm', centimetre: 'cm', centimeters: 'cm', centimetres: 'cm',
    m: 'm', meter: 'm', metre: 'm', meters: 'm', metres: 'm',
    in: 'in', inch: 'in', inches: 'in', '"': 'in',
    ft: 'ft', foot: 'ft', feet: 'ft', "'": 'ft',
  };
  return map[t] ?? null;
}

export function parseMassUnit(s: string): MassUnit | null {
  const t = s.trim().toLowerCase().replace(/\./g, '');
  const map: Record<string, MassUnit> = {
    kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    t: 't', tonne: 't', tonnes: 't', ton: 't', mt: 't',
  };
  return map[t] ?? null;
}

export function fmtNum(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** "2,400 mm (94.5 in)" style dual display. */
export function fmtMmDual(mm: number): string {
  return `${fmtNum(mm, 0)} mm · ${fmtNum(fromMm(mm, 'in'), 1)} in`;
}
export function fmtKgDual(kg: number): string {
  return `${fmtNum(kg, 1)} kg · ${fmtNum(fromKg(kg, 'lb'), 0)} lb`;
}
