import type { PlanFile } from './report';
import type { BolLineDeclaration } from './vicsBol';

export interface ScopedBolEvidence<T> { scope: string; value: T }

/** Bind review to document content, excluding only automatic generation timestamps. */
export function bolReviewScope(plan: PlanFile, fields: Record<string, unknown>, lines: Record<string, BolLineDeclaration>): string {
  const stablePlan = { ...plan, createdAt: undefined, validation: { ...plan.validation, validatedAt: undefined } };
  return JSON.stringify({ plan: stablePlan, fields, lines });
}

export function scopedBolEvidence<T>(evidence: ScopedBolEvidence<T> | null, scope: string | null): T | null {
  return scope !== null && evidence?.scope === scope ? evidence.value : null;
}
