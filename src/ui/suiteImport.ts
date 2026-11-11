import { DEFAULT_SETTINGS } from '../engine/scenario';
import type { EquipmentProfile, Scenario } from '../engine/types';
import { equipmentPresets } from './samples';

/** Imported measurements are declared values only. Missing data stays editable and unknown. */
export function scenarioFromSuiteParams(p: URLSearchParams): Scenario | null {
  const source = p.get('source');
  if (source !== 'asset_studio_p04' && source !== 'command_center_portal') return null;
  const number = (key: string): number | null => {
    const raw = p.get(key);
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const eqName = p.get('eqName') || p.get('vehicleId') || 'Imported equipment';
  const qty = number('pkgQty') ?? number('packageQty');
  const lengthFt = number('lengthFt');
  const maxWeightLbs = number('maxWeightLbs');
  const cargoWeight = number('cargoWeight');
  const customEq: EquipmentProfile = {
    id: source === 'command_center_portal' ? 'portal-eq-1' : 'p04-eq-1', name: eqName,
    length: number('eqL') ?? (lengthFt === null ? null : lengthFt * 304.8),
    width: number('eqW'), height: number('eqH'), unit: 'mm',
    doorWidth: number('doorW'), doorHeight: number('doorH'),
    payload: number('eqPayloadKg') ?? (maxWeightLbs === null ? null : maxWeightLbs * 0.453592),
    massUnit: 'kg', cost: number('cost'), currency: 'USD',
    costSource: number('cost') === null ? 'none' : 'user',
    source: source === 'command_center_portal' ? 'Command Center Portal' : 'Product 04 Asset Studio', included: true,
  };
  return {
    name: `${eqName} Load Optimization`,
    rows: [{ uid: 'p04-row-1', label: p.get('pkgName') || p.get('packageName') || 'Imported cargo unit',
      qty, length: number('pkgL'), width: number('pkgW'), height: number('pkgH'), dimUnit: 'mm',
      weight: number('pkgKg') ?? (cargoWeight !== null && qty !== null && qty > 0 ? cargoWeight * 0.453592 / qty : null),
      weightUnit: 'kg', rotation: 'fixed', stackable: false, stop: null }],
    equipment: [customEq, ...equipmentPresets().map((e) => ({ ...e, included: false }))],
    settings: { ...DEFAULT_SETTINGS },
  };
}
