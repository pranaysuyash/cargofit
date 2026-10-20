/**
 * Cross-Product Bridge: Product 01 (Cargo Fit) → Product 02 (Freight Pricing)
 * Converts a verified physical load plan into commercial rate parameters.
 */

import type { PlanFile } from './report';

export function buildFreightQuoteUrl(plan: PlanFile, baseUrl = 'http://localhost:5174'): string {
  const m = plan.metrics;
  const eqName = (plan.scenario.equipment.find((e) => e.id === plan.equipmentId)?.name || '').toLowerCase();

  let equipCategory = 'dry_van';
  if (eqName.includes('reefer') || eqName.includes('refrigerat')) {
    equipCategory = 'reefer';
  } else if (eqName.includes('step') || eqName.includes('drop')) {
    equipCategory = 'step_deck';
  } else if (eqName.includes('flat') || eqName.includes('platform')) {
    equipCategory = 'flatbed';
  }

  // Detect stops
  const maxStop = plan.placements.reduce((max, p) => Math.max(max, p.stop ?? 1), 1);
  const extraStops = Math.max(0, maxStop - 1);

  // Detect hazmat or special labels
  const isHazmat = plan.scenario.rows.some((r) =>
    /haz|class\s*[1-9]|un\s*\d{4}|flamm|danger/i.test(r.label)
  );

  const isReefer = equipCategory === 'reefer' || plan.scenario.rows.some((r) =>
    /frozen|chilled|perish|temp|deg|celsius|fahrenheit/i.test(r.label)
  );

  const weightLbs = Math.round(m.loadedWeightKg * 2.20462);

  const params = new URLSearchParams({
    source: 'cargofit',
    scenario: plan.scenario.name,
    equipment: equipCategory,
    loadedKg: String(Math.round(m.loadedWeightKg)),
    loadedLbs: String(weightLbs),
    placedUnits: String(m.placedUnits),
    extraStops: String(extraStops),
    hazmat: isHazmat ? '1' : '0',
    reefer: isReefer ? '1' : '0',
  });

  return `${baseUrl}/?${params.toString()}`;
}
