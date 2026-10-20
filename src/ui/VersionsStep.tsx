import { useMemo, useRef, useState } from 'react';
import { buildHtmlReport, buildInteractiveHtmlReport, buildPlanFile, LIMITATIONS, placementsCsv } from '../engine/report';
import { cargoToCsv } from '../engine/csv';
import { diffRows, diffResults, summarize } from '../engine/scenario';
import { deleteScenario, loadAll } from '../engine/storage';
import type { AppApi } from './App';
import { StatusBadge, download, slug } from './common';

export function VersionsStep(p: AppApi) {
  const { scenario, results, saved, readOnly } = p;
  const [note, setNote] = useState('');
  const [cmp, setCmp] = useState<{ id: string; rev: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const plannable = results.filter((r) => r.arrangements.length > 0);
  const result = plannable.find((r) => r.equipmentId === p.planEq) ?? plannable[0];
  const arrIdx = result ? Math.min(p.arrIdx, result.arrangements.length - 1) : 0;
  const key = result ? `${result.equipmentId}:${arrIdx}` : '';
  const edited = !!(key && p.edits[key]);
  const ready = !!result && !p.stale && p.solver.state.phase === 'done';

  const makePlan = () => {
    if (!result) return null;
    const placements = (key && p.edits[key]) || result.arrangements[arrIdx].placements;
    return buildPlanFile({ scenario, result, placements, arrangementName: result.arrangements[arrIdx].name, edited, inputHash: p.hash });
  };
  const exportAs = (kind: 'json' | 'csv' | 'html' | 'open' | 'interactive') => {
    if (!ready) { p.notify('warn', 'Plans are stale or still computing. Wait until “Plans up to date”, then export.'); return; }
    const plan = makePlan();
    if (!plan) { p.notify('err', 'No computed plan to export.'); return; }
    const base = `${slug(scenario.name)}_${slug(result!.equipmentName)}`;
    let ok = false;
    if (kind === 'json') ok = download(`${base}.plan.json`, JSON.stringify(plan, null, 2), 'application/json');
    if (kind === 'csv') ok = download(`${base}.placements.csv`, placementsCsv(plan), 'text/csv');
    if (kind === 'html') ok = download(`${base}.report.html`, buildHtmlReport(plan), 'text/html');
    if (kind === 'interactive') ok = download(`${base}.interactive-3d.html`, buildInteractiveHtmlReport(plan), 'text/html');
    if (kind === 'open') {
      const w = window.open('', '_blank');
      if (w) { w.document.write(buildHtmlReport(plan)); w.document.close(); ok = true; }
      else p.notify('err', 'Pop-up blocked — use “Download report” instead.');
      if (ok) p.notify('ok', 'Report opened in a new tab — use your browser’s Print → Save as PDF.');
      return;
    }
    p.notify(ok ? 'ok' : 'err', ok ? `Exported ${kind.toUpperCase()}${plan.validation.passed ? '' : ` — note: ${plan.validation.violations.length} validator violation(s) are recorded in the file`}.` : 'Download failed in this browser.');
  };

  const compared = useMemo(() => {
    if (!cmp) return null;
    const sc = saved.find((s) => s.id === cmp.id);
    const rev = sc?.revisions.find((r) => r.rev === cmp.rev);
    if (!sc || !rev) return null;
    return { sc, rev, rows: diffRows(rev.scenario.rows, scenario.rows), res: diffResults(rev.summaries, results.map(summarize)) };
  }, [cmp, saved, scenario.rows, results]);

  return (
    <section className="step" aria-labelledby="h-ver">
      <div className="step-head">
        <div><p className="eyebrow">Step 05</p><h1 id="h-ver">Save, version & export</h1>
          <p className="sub">Saving stores a revision in <b>this browser</b> (localStorage) and verifies the write. Sharing is by file: nothing is uploaded and there is no share link.</p></div>
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-h"><b>Save a revision</b><span className={p.unsaved ? 'warn-t' : 'ok-t'}>{p.unsaved ? 'unsaved changes' : 'matches last save'}</span></div>
          <div className="saverow">
            <input className="txt" aria-label="Revision note" placeholder="Revision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn primary" disabled={!!readOnly} onClick={() => { p.doSave(note); setNote(''); }}>Save revision</button>
          </div>
          <p className="muted small">A revision keeps the manifest, equipment, assumptions and the exact computed plans. It is only saved once plans are up to date, so a revision never mixes new inputs with old results.</p>
        </div>

        <div className="panel">
          <div className="panel-h"><b>Export the current plan</b>{result && <span>{result.equipmentName} · arrangement {arrIdx + 1}{edited ? ' · edited' : ''}</span>}</div>
          {!result ? <p className="muted">No computed plan to export yet.</p> : (
            <>
              <div className="exports">
                <button className="btn primary" disabled={!ready} onClick={() => exportAs('interactive')} title="Single-file offline HTML with embedded 3D viewer, rotation, and loading player">★ Interactive 3D (.html)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('html')}>Report (HTML, printable)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('open')}>Open report to print/PDF</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('json')}>Plan file (JSON)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('csv')}>Placements (CSV)</button>
                <button className="btn" onClick={() => { const ok = download(`${slug(scenario.name)}.cargo.csv`, cargoToCsv(scenario.rows), 'text/csv'); p.notify(ok ? 'ok' : 'err', ok ? 'Manifest CSV downloaded.' : 'Download failed.'); }}>Manifest (CSV)</button>
              </div>
              {!ready && <p className="note warn">Exports unlock when plans are up to date.</p>}
              <p className="muted small">Exports include inputs, item IDs, coordinates, equipment profile and sources, metrics, validator output, engine version, timestamp and the limitations below.</p>
            </>
          )}
          <div className="openplan">
            <button className="btn" onClick={() => fileRef.current?.click()}>Open a plan file (read-only)…</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) p.openPlanFile(await f.text()); }} />
            <span className="muted small">Plans are re-validated on open; the file’s own claims are not trusted.</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><b>Saved scenarios in this browser</b><span>{saved.length} scenario(s)</span></div>
        {saved.length === 0 ? <p className="muted">Nothing saved yet.</p> : (
          <div className="saved">
            {saved.map((s) => (
              <article key={s.id} className={s.id === p.currentId ? 'cur' : ''}>
                <header><b>{s.name}</b><span className="muted small">updated {new Date(s.updatedAt).toLocaleString()}</span>
                  <button className="btn sm ghost danger" onClick={() => { if (window.confirm(`Delete “${s.name}” and all ${s.revisions.length} revision(s) from this browser?`)) { deleteScenario(window.localStorage, s.id); p.setSaved(loadAll(window.localStorage)); p.notify('ok', 'Scenario deleted from this browser.'); } }}>Delete</button></header>
                <ul>
                  {s.revisions.slice().reverse().map((r) => (
                    <li key={r.rev}>
                      <span className="mono">r{r.rev}</span> <span className="muted small">{new Date(r.savedAt).toLocaleString()}</span> {r.note && <i>“{r.note}”</i>}
                      <span className="rsum">{r.summaries.map((x) => x.status === 'FEASIBLE_UNDER_MODELED_CONSTRAINTS' ? '✓' : x.status === 'PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS' ? '✕' : '·').join(' ')}</span>
                      <button className="btn sm" onClick={() => { p.loadScenario(JSON.parse(JSON.stringify(r.scenario)), s.id, r.inputHash); p.solver.restore(r.results, r.inputHash); p.notify('ok', `Restored ${s.name} r${r.rev} with its saved plans.`); p.go('decision'); }}>Restore</button>
                      <button className="btn sm ghost" onClick={() => setCmp({ id: s.id, rev: r.rev })}>Compare with current</button>
                    </li>))}
                </ul>
              </article>))}
          </div>
        )}
        {compared && (
          <div className="delta">
            <div className="panel-h"><b>{compared.sc.name} r{compared.rev.rev} → current</b><button className="btn sm ghost" onClick={() => setCmp(null)}>Close</button></div>
            {compared.rows.length === 0 ? <p>Same manifest as r{compared.rev.rev}.</p> : <ul className="chg">{compared.rows.map((c) => <li key={c.uid}><b>{c.kind}</b> {c.label}{c.fields.length ? ` — ${c.fields.join(', ')}` : ''}</li>)}</ul>}
            <table className="grid slim" aria-label="Revision comparison"><thead><tr><th>Equipment</th><th>r{compared.rev.rev}</th><th>Current</th><th>Placed Δ</th></tr></thead>
              <tbody>{compared.res.map((d) => <tr key={d.equipmentName} className={d.statusChanged ? 'chgrow' : ''}><th scope="row">{d.equipmentName}</th><td>{d.before ? <StatusBadge status={d.before.status} /> : '—'}</td><td>{d.after ? <StatusBadge status={d.after.status} /> : '—'}</td><td className="mono">{d.placedDelta > 0 ? '+' : ''}{d.placedDelta}</td></tr>)}</tbody></table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-h"><b>Limitations that travel with every export</b></div>
        <ul className="lim">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
    </section>
  );
}
