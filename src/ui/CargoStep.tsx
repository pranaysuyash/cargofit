import { useMemo, useRef, useState } from 'react';
import { cargoToCsv, importCargoCsv, type ImportIssue } from '../engine/csv';
import { blankRow } from '../engine/scenario';
import { LENGTH_UNITS, MASS_UNITS, fmtNum, toKg, toMm } from '../engine/units';
import type { CargoRow, InputIssue, RotationRule } from '../engine/types';
import type { AppApi } from './App';
import { NumInput, download } from './common';
import { SAMPLES, sampleScenario } from './samples';

export function CargoStep(p: AppApi) {
  const { scenario, setScenario, issues, readOnly } = p;
  const [imp, setImp] = useState<{ name: string; issues: ImportIssue[]; count: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const disabled = !!readOnly;

  const byRow = useMemo(() => {
    const m = new Map<string, InputIssue[]>();
    for (const i of issues.filter((x) => x.scope === 'cargo')) m.set(i.rowUid, [...(m.get(i.rowUid) ?? []), i]);
    return m;
  }, [issues]);
  const cargoIssues = issues.filter((i) => i.scope === 'cargo');
  const errs = cargoIssues.filter((i) => i.severity === 'error');
  const warns = cargoIssues.filter((i) => i.severity === 'warning');

  const update = (uid: string, patch: Partial<CargoRow>) =>
    setScenario((s) => ({ ...s, rows: s.rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)) }));

  const importText = (name: string, text: string, mode: 'replace' | 'append') => {
    const r = importCargoCsv(text);
    setImp({ name, issues: r.issues, count: r.rows.length });
    if (r.rows.length === 0) { p.notify('err', `Nothing imported from ${name}: ${r.issues[0]?.message ?? 'no rows'}`); return; }
    setScenario((s) => ({ ...s, rows: mode === 'replace' ? r.rows : [...s.rows, ...r.rows] }));
    const bad = r.issues.filter((i) => i.severity === 'error').length;
    p.notify(bad ? 'warn' : 'ok', `Imported ${r.rows.length} row(s) from ${name}${bad ? ` — ${bad} cell(s) need repair below` : ''}.`);
  };
  const onFile = async (f: File | undefined | null) => {
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { p.notify('warn', 'Excel files are not read directly yet. Export the sheet as CSV (File → Save As → CSV) and import that.'); return; }
    importText(f.name, await f.text(), scenario.rows.length ? 'append' : 'replace');
  };

  const totalUnits = scenario.rows.reduce((s, r) => s + (r.qty && r.qty > 0 ? r.qty : 0), 0);
  const known = scenario.rows.reduce((s, r) => s + (r.weight && r.qty ? toKg(r.weight, r.weightUnit) * r.qty : 0), 0);
  const unknownRows = scenario.rows.filter((r) => r.weight === null).length;
  const cell = (uid: string, field: string) => byRow.get(uid)?.find((i) => i.field === field && i.severity !== 'info');
  const rowCell = (r: CargoRow, field: 'length' | 'width' | 'height') => (
    <NumInput value={r[field]} label={`${r.label || 'row'} ${field}`} disabled={disabled} width={74}
      invalid={cell(r.uid, field)?.message} onChange={(v) => update(r.uid, { [field]: v })} />
  );

  return (
    <section className="step" aria-labelledby="h-cargo">
      <div className="step-head">
        <div><p className="eyebrow">Step 01</p><h1 id="h-cargo">Cargo manifest</h1>
          <p className="sub">One row per kind of unit. Dimensions and weight are <b>per unit</b>. Anything you leave empty stays unknown — it is never guessed.</p></div>
        <div className="actions">
          <button className="btn" disabled={disabled} onClick={() => fileRef.current?.click()}>Import CSV…</button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn" onClick={() => { const ok = download(`${scenario.name || 'cargo'}.csv`.replace(/\s+/g, '-'), cargoToCsv(scenario.rows), 'text/csv'); p.notify(ok ? 'ok' : 'err', ok ? 'Manifest CSV downloaded.' : 'Download failed in this browser.'); }}>Download CSV</button>
          <button className="btn" disabled={disabled} onClick={() => setScenario((s) => ({ ...s, rows: [...s.rows, blankRow()] }))}>+ Add row</button>
        </div>
      </div>

      <div className={`drop${drag ? ' over' : ''}`} role="group" aria-label="CSV drop zone"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) onFile(e.dataTransfer.files?.[0]); }}>
        <span>Drop a CSV here, or start from an example:</span>
        {SAMPLES.map((s) => (
          <button key={s.id} className="btn sm ghost" disabled={disabled} title={s.blurb}
            onClick={() => { const sc = sampleScenario(s.id); setScenario((cur) => ({ ...cur, name: sc.name, rows: sc.rows })); setImp(null); p.notify('ok', `Loaded “${s.title}”. Edit anything — it is plain data.`); }}>{s.title}</button>
        ))}
        <a className="linkbtn" href="#/app/cargo" onClick={(e) => { e.preventDefault(); const t = SAMPLES[0]; download(t.file, t.csv, 'text/csv'); }}>Download example CSV</a>
      </div>

      {imp && (
        <div className="panel" role="region" aria-label="Import review">
          <div className="panel-h"><b>Import review — {imp.name}</b><span>{imp.count} row(s) read · {imp.issues.filter((i) => i.severity === 'error').length} errors · {imp.issues.filter((i) => i.severity === 'warning').length} warnings</span>
            <button className="btn sm ghost" onClick={() => setImp(null)}>Dismiss</button></div>
          {imp.issues.length === 0 ? <p className="muted">No parsing problems.</p> : (
            <ul className="issue-list">
              {imp.issues.slice(0, 40).map((i, k) => <li key={k} className={i.severity}><b>line {i.line} · {i.field}</b> {i.message}</li>)}
            </ul>
          )}
        </div>
      )}

      {scenario.rows.length === 0 ? (
        <div className="empty"><h3>No cargo yet</h3><p>Import a CSV, pick an example above, or add a row by hand.</p>
          <button className="btn primary" disabled={disabled} onClick={() => setScenario((s) => ({ ...s, rows: [blankRow()] }))}>Add first row</button></div>
      ) : (
        <div className="tablewrap">
          <table className="grid" aria-label="Cargo manifest">
            <thead><tr>
              <th>#</th><th>Identifier</th><th>Qty</th><th>Length</th><th>Width</th><th>Height</th><th>Unit</th>
              <th>Weight each</th><th>Unit</th><th>Rotation</th><th>Stacking</th><th>Size in mm</th><th aria-label="Row actions" />
            </tr></thead>
            <tbody>
              {scenario.rows.map((r, i) => {
                const rowIssues = byRow.get(r.uid) ?? [];
                const mm = r.length && r.width && r.height && r.length > 0 && r.width > 0 && r.height > 0
                  ? [toMm(r.length, r.dimUnit), toMm(r.width, r.dimUnit), toMm(r.height, r.dimUnit)] : null;
                return (
                  <tr key={r.uid} className={rowIssues.some((x) => x.severity === 'error') ? 'has-err' : ''}>
                    <td className="mono dim">{i + 1}</td>
                    <td><input className={`txt${cell(r.uid, 'label') ? ' bad' : ''}`} aria-label={`Row ${i + 1} identifier`} disabled={disabled} aria-invalid={!!cell(r.uid, 'label')} title={cell(r.uid, 'label')?.message} value={r.label} onChange={(e) => update(r.uid, { label: e.target.value })} /></td>
                    <td><NumInput value={r.qty} label={`Row ${i + 1} quantity`} disabled={disabled} width={56} invalid={cell(r.uid, 'qty')?.message} onChange={(v) => update(r.uid, { qty: v })} /></td>
                    <td>{rowCell(r, 'length')}</td><td>{rowCell(r, 'width')}</td><td>{rowCell(r, 'height')}</td>
                    <td><select aria-label={`Row ${i + 1} dimension unit`} disabled={disabled} value={r.dimUnit} onChange={(e) => update(r.uid, { dimUnit: e.target.value as CargoRow['dimUnit'] })}>{LENGTH_UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                    <td><NumInput value={r.weight} label={`Row ${i + 1} weight each`} disabled={disabled} width={74} placeholder="unknown" invalid={cell(r.uid, 'weight')?.severity === 'error' ? cell(r.uid, 'weight')?.message : undefined} onChange={(v) => update(r.uid, { weight: v })} /></td>
                    <td><select aria-label={`Row ${i + 1} weight unit`} disabled={disabled} value={r.weightUnit} onChange={(e) => update(r.uid, { weightUnit: e.target.value as CargoRow['weightUnit'] })}>{MASS_UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                    <td><select aria-label={`Row ${i + 1} rotation rule`} disabled={disabled} value={r.rotation} onChange={(e) => update(r.uid, { rotation: e.target.value as RotationRule })}>
                      <option value="fixed">Fixed (as entered)</option><option value="upright">Upright (turn flat only)</option><option value="any">Any orientation</option></select></td>
                    <td><select aria-label={`Row ${i + 1} stacking`} disabled={disabled} value={r.stackable ? 'yes' : 'no'} onChange={(e) => update(r.uid, { stackable: e.target.value === 'yes' })}><option value="yes">Stackable</option><option value="no">No-stack</option></select></td>
                    <td className="mono dim conv">{mm ? `${fmtNum(mm[0], 0)}×${fmtNum(mm[1], 0)}×${fmtNum(mm[2], 0)}` : '—'}{r.weight && r.weight > 0 ? ` · ${fmtNum(toKg(r.weight, r.weightUnit), 1)} kg` : ''}</td>
                    <td><button className="btn sm ghost" aria-label={`Remove row ${i + 1}`} disabled={disabled} onClick={() => setScenario((s) => ({ ...s, rows: s.rows.filter((x) => x.uid !== r.uid) }))}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="summary">
        <div><b className="mono">{totalUnits}</b><span>units in {scenario.rows.length} row(s)</span></div>
        <div><b className="mono">{fmtNum(known, 0)} kg</b><span>known weight{unknownRows ? ` · ${unknownRows} row(s) unknown` : ''}</span></div>
        <div className={errs.length ? 'bad' : 'ok'}><b className="mono">{errs.length}</b><span>errors block planning</span></div>
        <div className={warns.length ? 'warn' : ''}><b className="mono">{warns.length}</b><span>warnings</span></div>
        <button className="btn primary" onClick={() => p.go('equipment')}>Next: equipment →</button>
      </div>

      {cargoIssues.some((i) => i.severity !== 'info') && (
        <div className="panel" role="region" aria-label="Repair list">
          <div className="panel-h"><b>Repair list</b><span>fix the red cells above; unknown weights are allowed but limit the claim</span></div>
          <ul className="issue-list">
            {cargoIssues.slice(0, 30).map((i, k) => {
              const row = scenario.rows.find((r) => r.uid === i.rowUid);
              return <li key={k} className={i.severity}><b>{row ? row.label || `row ${scenario.rows.indexOf(row) + 1}` : 'manifest'} · {i.field}</b> {i.message}</li>;
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
