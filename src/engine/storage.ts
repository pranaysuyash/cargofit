import type { EquipmentResult, Scenario } from './types';
import type { ResultSummary } from './scenario';

export const STORE_KEY = 'cargofit.v1.scenarios';

export interface Revision {
  rev: number;
  savedAt: string;
  note: string;
  inputHash: string;
  scenario: Scenario;
  summaries: ResultSummary[];
  /** full results are stored so a restore shows the exact saved plans without re-solving */
  results: EquipmentResult[];
}

export interface SavedScenario {
  id: string;
  name: string;
  updatedAt: string;
  revisions: Revision[];
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export class SavedScenariosReadError extends Error {
  constructor(message: string) { super(message); this.name = 'SavedScenariosReadError'; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Check the structure consumed by the versions screen before allowing any write.
// Unknown extra fields are deliberately preserved for forward compatibility.
function isSavedScenario(value: unknown): value is SavedScenario {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' ||
      typeof value.updatedAt !== 'string' || !Array.isArray(value.revisions)) return false;
  return value.revisions.every((r: unknown) => isRecord(r) && typeof r.rev === 'number' &&
    typeof r.savedAt === 'string' && typeof r.note === 'string' && typeof r.inputHash === 'string' &&
    isRecord(r.scenario) && Array.isArray(r.scenario.rows) && Array.isArray(r.scenario.equipment) &&
    isRecord(r.scenario.settings) && Array.isArray(r.summaries) && Array.isArray(r.results));
}

export function loadAll(kv: KV): SavedScenario[] {
  let raw: string | null;
  try {
    raw = kv.getItem(STORE_KEY);
  } catch {
    throw new SavedScenariosReadError('Saved scenarios cannot be read from browser storage. No changes were made.');
  }
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    throw new SavedScenariosReadError('Saved scenarios contain invalid JSON. The original data has been preserved.');
  }
  if (!Array.isArray(value) || !value.every(isSavedScenario)) {
    throw new SavedScenariosReadError('Saved scenarios have an unrecognized structure. The original data has been preserved.');
  }
  return value;
}

/** Throws if the write fails (e.g. quota) so the UI can report honestly instead of claiming "saved". */
export function saveRevision(
  kv: KV, id: string | null, scenario: Scenario, inputHash: string, results: EquipmentResult[],
  summaries: ResultSummary[], note: string, now = new Date(),
): { saved: SavedScenario; revision: Revision } {
  const all = loadAll(kv);
  let sc = id ? all.find((s) => s.id === id) : undefined;
  if (!sc) {
    sc = { id: `sc_${now.getTime().toString(36)}`, name: scenario.name, updatedAt: now.toISOString(), revisions: [] };
    all.push(sc);
  }
  const revision: Revision = {
    rev: (sc.revisions.at(-1)?.rev ?? 0) + 1, savedAt: now.toISOString(), note, inputHash,
    scenario: JSON.parse(JSON.stringify(scenario)), summaries, results: JSON.parse(JSON.stringify(results)),
  };
  sc.revisions.push(revision);
  sc.name = scenario.name;
  sc.updatedAt = now.toISOString();
  const payload = JSON.stringify(all);
  kv.setItem(STORE_KEY, payload);
  // read-back verification: only claim success if the write is really there
  if (kv.getItem(STORE_KEY) !== payload) throw new Error('Storage write could not be verified.');
  return { saved: sc, revision };
}

export function deleteScenario(kv: KV, id: string): void {
  kv.setItem(STORE_KEY, JSON.stringify(loadAll(kv).filter((s) => s.id !== id)));
}
