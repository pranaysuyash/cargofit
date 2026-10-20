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

export function loadAll(kv: KV): SavedScenario[] {
  try {
    const raw = kv.getItem(STORE_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? (j as SavedScenario[]) : [];
  } catch { return []; }
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
