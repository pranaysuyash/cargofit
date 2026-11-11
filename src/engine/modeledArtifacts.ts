import type { Placement, Scenario } from './types';
import type { KV } from './storage';

export type TandemArtifact = { tandemHole: number; fifthWheelPosition: number; kpraFt?: number; legal: boolean };
export type NmfcArtifact = { primaryClass: string; densityLbsCuFt: number; dimWeightPenaltyLbs?: number; assumptions: { weightLbs: number; volumeCuFt: number; dimFactor: number } };
export interface ArtifactValues { tandem: TandemArtifact; nmfc: NmfcArtifact }
export interface ScopedArtifact<T> { scope: string; value: T }
export const MODELED_ARTIFACTS_KEY = 'cargo_fit_modeled_artifacts_v1';
export function readLegacyModeledArtifacts(kv: KV): { tandemRaw: string | null; nmfcRaw: string | null } {
  return { tandemRaw: kv.getItem('cargo_fit_active_tandem_config'), nmfcRaw: kv.getItem('cargo_fit_active_nmfc_summary') };
}

/** Exact inputs avoid relying on the short non-cryptographic scenario hash. */
export function artifactScope(scenario: Scenario, equipmentId: string, arrangement: number, placements: Placement[], stage: number): string {
  return JSON.stringify({ scenario, equipmentId, arrangement, placements, stage });
}

function validArtifact(kind: keyof ArtifactValues, item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const entry = item as { scope?: unknown; value?: Record<string, unknown> };
  if (typeof entry.scope !== 'string' || !entry.scope || !entry.value || typeof entry.value !== 'object') return false;
  const v = entry.value;
  const optionalNumber = (x: unknown) => x === undefined || (typeof x === 'number' && Number.isFinite(x));
  return kind === 'tandem'
    ? typeof v.tandemHole === 'number' && Number.isFinite(v.tandemHole) && typeof v.fifthWheelPosition === 'number' && Number.isFinite(v.fifthWheelPosition) && optionalNumber(v.kpraFt) && typeof v.legal === 'boolean'
    : typeof v.primaryClass === 'string' && !!v.primaryClass && typeof v.densityLbsCuFt === 'number' && Number.isFinite(v.densityLbsCuFt) && optionalNumber(v.dimWeightPenaltyLbs) && !!v.assumptions && typeof v.assumptions === 'object' && ['weightLbs', 'volumeCuFt', 'dimFactor'].every(key => typeof (v.assumptions as Record<string, unknown>)[key] === 'number' && Number.isFinite((v.assumptions as Record<string, number>)[key]) && (v.assumptions as Record<string, number>)[key] > 0);
}

function readStore(kv: KV): Record<string, unknown> {
  const raw = kv.getItem(MODELED_ARTIFACTS_KEY);
  if (raw === null) return { version: 1 };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Modeled artifact storage is unreadable; original data is preserved.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as { version?: unknown }).version !== 1) throw new Error('Modeled artifact storage has an unknown format; original data is preserved.');
  const store = value as Record<string, unknown>;
  if (['tandem', 'nmfc'].some(key => store[key] !== undefined && !validArtifact(key as keyof ArtifactValues, store[key]))) throw new Error('Modeled artifact storage is invalid; original data is preserved.');
  return store;
}

export function saveModeledArtifact<K extends keyof ArtifactValues>(kv: KV, kind: K, artifact: ScopedArtifact<ArtifactValues[K]>): void {
  if (!validArtifact(kind, artifact)) throw new Error('The modeled artifact is invalid.');
  const store = readStore(kv);
  const payload = JSON.stringify({ ...store, [kind]: artifact });
  kv.setItem(MODELED_ARTIFACTS_KEY, payload);
  if (kv.getItem(MODELED_ARTIFACTS_KEY) !== payload) throw new Error('Modeled artifact write could not be verified.');
}

export function loadModeledArtifact<K extends keyof ArtifactValues>(kv: KV, kind: K, scope: string): ArtifactValues[K] | null {
  try {
    const entry = readStore(kv)[kind] as ScopedArtifact<ArtifactValues[K]> | undefined;
    return entry?.scope === scope ? entry.value : null;
  } catch { return null; }
}

/** Select the same scoped value for every export; unscoped and stale values are withheld. */
export function selectModeledArtifact<K extends keyof ArtifactValues>(kv: KV | null, kind: K, memory: ScopedArtifact<ArtifactValues[K]> | null, scope: string): ArtifactValues[K] | null {
  if (memory?.scope === scope && validArtifact(kind, memory)) return memory.value;
  return kv ? loadModeledArtifact(kv, kind, scope) : null;
}
