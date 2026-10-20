import mixed from '../../fixtures/mixed-regional-delivery.csv?raw';
import heavy from '../../fixtures/heavy-low-volume.csv?raw';
import oversized from '../../fixtures/oversized-and-rotation.csv?raw';
import messy from '../../fixtures/messy-import.csv?raw';
import presets from '../../fixtures/equipment-presets.json';
import { importCargoCsv, newUid } from '../engine/csv';
import { DEFAULT_SETTINGS } from '../engine/scenario';
import type { EquipmentProfile, Scenario } from '../engine/types';

export interface Sample { id: string; title: string; blurb: string; csv: string; file: string }

export const SAMPLES: Sample[] = [
  { id: 'mixed', title: 'Mixed regional delivery', file: 'mixed-regional-delivery.csv', csv: mixed,
    blurb: 'Euro and US pallets, cartons, long shelving, fragile glass and a machine crate in mixed inch/mm units.' },
  { id: 'heavy', title: 'Heavy, low volume', file: 'heavy-low-volume.csv', csv: heavy,
    blurb: 'Steel coils and motor blocks. Plenty of space, but payload is the binding constraint.' },
  { id: 'oversized', title: 'Long and awkward', file: 'oversized-and-rotation.csv', csv: oversized,
    blurb: 'Pipes, a tall cabinet that must stay upright, sofas, door slabs — rotation rules and door height matter.' },
  { id: 'messy', title: 'Messy import (repair demo)', file: 'messy-import.csv', csv: messy,
    blurb: 'Zeros, negatives, a typo, missing weights, duplicate IDs and mixed units — shows the repair path.' },
];

export const equipmentPresets = (): EquipmentProfile[] =>
  (presets as unknown as EquipmentProfile[]).map((p) => ({ ...p, id: `${p.id}-${newUid('')}` }));

export function sampleScenario(id: string): Scenario {
  const s = SAMPLES.find((x) => x.id === id) ?? SAMPLES[0];
  return { name: s.title, rows: importCargoCsv(s.csv).rows, equipment: equipmentPresets(), settings: { ...DEFAULT_SETTINGS } };
}

export function blankScenario(): Scenario {
  return { name: 'Untitled shipment', rows: [], equipment: equipmentPresets(), settings: { ...DEFAULT_SETTINGS } };
}
