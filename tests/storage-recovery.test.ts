import { describe, expect, it } from 'vitest';
import { deleteScenario, loadAll, saveRevision, STORE_KEY, type KV } from '../src/engine/storage';
import { sampleScenario } from '../src/ui/samples';

function store(initial: string | null) {
  let value = initial;
  let writes = 0;
  const kv: KV = { getItem: () => value, setItem: (_key, next) => { writes++; value = next; } };
  return { kv, snapshot: () => ({ value, writes }) };
}

describe('saved scenario recovery boundary', () => {
  it('allows a new scenario only when no data exists', () => {
    const s = store(null);
    expect(loadAll(s.kv)).toEqual([]);
    saveRevision(s.kv, null, sampleScenario('mixed'), 'hash', [], [], '');
    expect(loadAll(s.kv)).toHaveLength(1);
  });

  it.each(['', '{', '{}', '[null]', '[{"id":"x","name":"x","updatedAt":"x","revisions":[{}]}]'])('preserves unreadable or malformed data: %s', (raw) => {
    const s = store(raw);
    expect(() => loadAll(s.kv)).toThrow();
    expect(() => saveRevision(s.kv, null, sampleScenario('mixed'), 'hash', [], [], '')).toThrow();
    expect(() => deleteScenario(s.kv, 'x')).toThrow();
    expect(s.snapshot()).toEqual({ value: raw, writes: 0 });
  });

  it('does not write if storage cannot be read', () => {
    let writes = 0;
    const kv: KV = { getItem: () => { throw new Error('denied'); }, setItem: () => { writes++; } };
    expect(() => saveRevision(kv, null, sampleScenario('mixed'), 'hash', [], [], '')).toThrow();
    expect(writes).toBe(0);
    expect(STORE_KEY).toBe('cargofit.v1.scenarios');
  });
});
