import { describe, expect, it } from 'vitest';
import { artifactScope, loadModeledArtifact, readLegacyModeledArtifacts, saveModeledArtifact, selectModeledArtifact, MODELED_ARTIFACTS_KEY } from '../src/engine/modeledArtifacts';
import { dunnageGeometryForPlacements } from '../src/engine/dunnageVoidCalculator';
import type { Placement, Scenario, Unit } from '../src/engine/types';

const scenario = { rows: [{ label: 'original' }], equipment: [{ id: 'truck' }], settings: {} } as unknown as Scenario;
const placement = { unitId: 'p1', rowUid: 'r1', label: 'Pallet', x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, order: 1 } as Placement;
const item = { tandemHole: 6, fifthWheelPosition: 0, kpraFt: 40, legal: true };

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value; } };
}

describe('modeled artifact provenance', () => {
  it('restores only exact scenario, equipment, arrangement, placement and stage', () => {
    const kv = fakeStorage({ cargo_fit_active_tandem_config: '{"legal":true}' });
    const scope = artifactScope(scenario, 'truck', 0, [placement], 0);
    saveModeledArtifact(kv, 'tandem', { scope, value: item });
    expect(loadModeledArtifact(kv, 'tandem', scope)).toEqual(item);
    expect(loadModeledArtifact(kv, 'tandem', artifactScope({ ...scenario, rows: [] }, 'truck', 0, [placement], 0))).toBeNull();
    expect(loadModeledArtifact(kv, 'tandem', artifactScope(scenario, 'other', 0, [placement], 0))).toBeNull();
    expect(loadModeledArtifact(kv, 'tandem', artifactScope(scenario, 'truck', 1, [placement], 0))).toBeNull();
    expect(loadModeledArtifact(kv, 'tandem', artifactScope(scenario, 'truck', 0, [{ ...placement, x: 1 }], 0))).toBeNull();
    expect(loadModeledArtifact(kv, 'tandem', artifactScope(scenario, 'truck', 0, [placement], 1))).toBeNull();
    expect(selectModeledArtifact(kv, 'tandem', { scope, value: item }, scope)).toEqual(item);
    expect(selectModeledArtifact(kv, 'tandem', { scope, value: item }, artifactScope(scenario, 'other', 0, [placement], 0))).toBeNull();
    expect(kv.data.cargo_fit_active_tandem_config).toBe('{"legal":true}');
    expect(readLegacyModeledArtifacts(kv)).toEqual({ tandemRaw: '{"legal":true}', nmfcRaw: null });
  });
  it('preserves unreadable scoped data and never restores unscoped legacy values', () => {
    const kv = fakeStorage({ [MODELED_ARTIFACTS_KEY]: '{broken', cargo_fit_active_tandem_config: JSON.stringify(item) });
    expect(loadModeledArtifact(kv, 'tandem', 'scope')).toBeNull();
    expect(() => saveModeledArtifact(kv, 'tandem', { scope: 'scope', value: item })).toThrow();
    expect(kv.data[MODELED_ARTIFACTS_KEY]).toBe('{broken');
  });
  it('does not report stored success if browser read-back differs', () => {
    const kv = { getItem: () => null, setItem: () => {} };
    expect(() => saveModeledArtifact(kv, 'tandem', { scope: 'scope', value: item })).toThrow();
  });
  it('retains unknown placed-unit weight for dunnage geometry', () => {
    const unit = { id: 'p1', weightKg: null } as Unit;
    expect(dunnageGeometryForPlacements([placement], [unit])[0].weightKg).toBeNull();
    expect(dunnageGeometryForPlacements([placement], [])[0].weightKg).toBeNull();
  });
});
