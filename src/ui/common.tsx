import { useEffect, useState } from 'react';
import { STATUS_LABEL } from '../engine/report';
import type { ResultStatus } from '../engine/types';

export function NumInput(props: {
  value: number | null; onChange: (v: number | null) => void; label: string; invalid?: string; width?: number; placeholder?: string; disabled?: boolean;
}) {
  const [txt, setTxt] = useState(props.value === null ? '' : String(props.value));
  useEffect(() => {
    const cur = txt.trim() === '' ? null : Number(txt);
    if (cur !== props.value) setTxt(props.value === null ? '' : String(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  return (
    <input
      className={`num${props.invalid ? ' bad' : ''}`}
      inputMode="decimal"
      aria-label={props.label}
      aria-invalid={!!props.invalid}
      title={props.invalid}
      disabled={props.disabled}
      style={props.width ? { width: props.width } : undefined}
      placeholder={props.placeholder ?? '—'}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        const t = e.target.value.trim();
        if (t === '') props.onChange(null);
        else {
          const n = Number(t.replace(',', '.'));
          props.onChange(Number.isFinite(n) ? n : null);
        }
      }}
    />
  );
}

const TONE: Record<ResultStatus, string> = {
  FEASIBLE_UNDER_MODELED_CONSTRAINTS: 'ok',
  PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS: 'no',
  NOT_FOUND_WITHIN_SEARCH_BUDGET: 'unk',
  INCOMPLETE_INPUT: 'inc',
  NEEDS_PHYSICAL_REVIEW: 'rev',
};
const GLYPH: Record<ResultStatus, string> = {
  FEASIBLE_UNDER_MODELED_CONSTRAINTS: 'FEASIBLE',
  PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS: 'INFEASIBLE',
  NOT_FOUND_WITHIN_SEARCH_BUDGET: '?',
  INCOMPLETE_INPUT: '…',
  NEEDS_PHYSICAL_REVIEW: '!',
};
const SHORT: Record<ResultStatus, string> = {
  FEASIBLE_UNDER_MODELED_CONSTRAINTS: 'Fits (modeled)',
  PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS: 'Does not fit (proven)',
  NOT_FOUND_WITHIN_SEARCH_BUDGET: 'No plan found',
  INCOMPLETE_INPUT: 'Incomplete input',
  NEEDS_PHYSICAL_REVIEW: 'Needs physical review',
};

export function StatusBadge({ status, full }: { status: ResultStatus; full?: boolean }) {
  return (
    <span className={`badge ${TONE[status]}`} title={STATUS_LABEL[status]}>
      <span aria-hidden="true" className="glyph">{GLYPH[status]}</span>
      {full ? STATUS_LABEL[status] : SHORT[status]}
    </span>
  );
}

export function download(filename: string, text: string, mime: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch { return false; }
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
