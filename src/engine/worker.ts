/// <reference lib="webworker" />
import { analyzeScenario } from './scenario';
import type { EquipmentResult, Scenario } from './types';

export type WorkerIn = { type: 'solve'; requestId: number; scenario: Scenario };
export type WorkerOut =
  | { type: 'result'; requestId: number; result: EquipmentResult; done: number; total: number }
  | { type: 'done'; requestId: number; hash: string; ms: number };

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.type !== 'solve') return;
  const t0 = Date.now();
  const a = analyzeScenario(m.scenario, {
    onResult: (result, done, total) => {
      (self as unknown as Worker).postMessage({ type: 'result', requestId: m.requestId, result, done, total } satisfies WorkerOut);
    },
  });
  (self as unknown as Worker).postMessage({ type: 'done', requestId: m.requestId, hash: a.hash, ms: Date.now() - t0 } satisfies WorkerOut);
};
