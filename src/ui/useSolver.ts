import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkerOut } from '../engine/worker';
import { analyzeScenario, scenarioHash } from '../engine/scenario';
import type { EquipmentResult, Scenario } from '../engine/types';

export interface SolverState {
  phase: 'idle' | 'running' | 'done' | 'cancelled';
  progress: { done: number; total: number };
  results: EquipmentResult[];
  /** hash of the scenario these results belong to */
  solvedHash: string | null;
  ms: number | null;
  requestId: number;
}

const INITIAL: SolverState = { phase: 'idle', progress: { done: 0, total: 0 }, results: [], solvedHash: null, ms: null, requestId: 0 };

/**
 * Runs solves in a Web Worker. A new run terminates the old worker (cancel) and
 * results are only accepted for the latest requestId, so a slow older solve can
 * never overwrite newer edits.
 */
export function useSolver() {
  const [state, setState] = useState<SolverState>(INITIAL);
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pendingHash = useRef<string | null>(null);

  const kill = () => { worker.current?.terminate(); worker.current = null; };
  useEffect(() => kill, []);

  const run = useCallback((scenario: Scenario) => {
    kill();
    const requestId = ++reqId.current;
    const hash = scenarioHash(scenario);
    pendingHash.current = hash;
    setState((s) => ({ ...s, phase: 'running', progress: { done: 0, total: scenario.equipment.filter((e) => e.included).length }, requestId, results: [] }));
    if (typeof Worker === 'undefined') {
      const a = analyzeScenario(scenario);
      setState({ phase: 'done', progress: { done: a.results.length, total: a.results.length }, results: a.results, solvedHash: a.hash, ms: null, requestId });
      return;
    }
    const w = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const acc: EquipmentResult[] = [];
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.requestId !== reqId.current) return; // stale
      if (m.type === 'result') {
        acc.push(m.result);
        setState((s) => (s.requestId === m.requestId ? { ...s, progress: { done: m.done, total: m.total }, results: [...acc] } : s));
      } else {
        setState((s) => (s.requestId === m.requestId ? { ...s, phase: 'done', solvedHash: m.hash, ms: m.ms } : s));
        kill();
      }
    };
    w.onerror = () => {
      const a = analyzeScenario(scenario);
      setState({ phase: 'done', progress: { done: a.results.length, total: a.results.length }, results: a.results, solvedHash: a.hash, ms: null, requestId });
      kill();
    };
    w.postMessage({ type: 'solve', requestId, scenario });
  }, []);

  const cancel = useCallback(() => {
    kill();
    reqId.current++;
    setState((s) => ({ ...s, phase: 'cancelled' }));
  }, []);

  const restore = useCallback((results: EquipmentResult[], hash: string) => {
    kill();
    reqId.current++;
    setState({ phase: 'done', progress: { done: results.length, total: results.length }, results, solvedHash: hash, ms: null, requestId: reqId.current });
  }, []);

  return { state, run, cancel, restore };
}
