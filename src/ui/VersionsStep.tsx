import { useMemo, useRef, useState } from 'react';
import { buildHtmlReport, buildInteractiveHtmlReport, buildWorkOrderHtml, buildPlanFile, LIMITATIONS, placementsCsv } from '../engine/report';
import { exportToGltf } from '../engine/gltf';
import { generateEdi214 } from '../engine/edi214';
import { assessBolReadiness, buildVicsBolHtml } from '../engine/vicsBol';
import type { BolLineDeclaration } from '../engine/vicsBol';
import { SignaturePad } from './SignaturePad';
import { buildFreightQuoteUrl } from '../engine/quoteBridge';
import { expandUnits, normalizeEquipment } from '../engine/normalize';
import { cargoToCsv } from '../engine/csv';
import { diffRows, diffResults, summarize } from '../engine/scenario';
import { deleteScenario, loadAll } from '../engine/storage';
import type { AppApi } from './App';
import { StatusBadge, download, slug } from './common';

export function VersionsStep(p: AppApi) {
  const { scenario, results, saved, readOnly } = p;
  const [note, setNote] = useState('');
  const [cmp, setCmp] = useState<{ id: string; rev: number } | null>(null);
  const [signatureModal, setSignatureModal] = useState<'shipper' | 'driver' | null>(null);
  const [shipperSig, setShipperSig] = useState<string | null>(null);
  const [driverSig, setDriverSig] = useState<string | null>(null);
  const [bol, setBol] = useState<Partial<Record<'carrierName' | 'scac' | 'shipperName' | 'shipperAddress' | 'shipperCityStateZip' | 'consigneeName' | 'consigneeAddress' | 'consigneeCityStateZip' | 'trailerNumber' | 'sealNumber' | 'proNumber' | 'specialInstructions' | 'emergencyPhone', string>>>({});
  const [bolLines, setBolLines] = useState<Record<string, BolLineDeclaration>>({});
  const [bolApproved, setBolApproved] = useState(false);
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
  const exportAs = (kind: 'json' | 'csv' | 'html' | 'open' | 'interactive' | 'workorder' | 'gltf' | 'edi214' | 'vicsbol') => {
    if (!ready) { p.notify('warn', 'Plans are stale or still computing. Wait until “Plans up to date”, then export.'); return; }
    const plan = makePlan();
    if (!plan) { p.notify('err', 'No computed plan to export.'); return; }
    const base = `${slug(scenario.name)}_${slug(result!.equipmentName)}`;
    let ok = false;
    if (kind === 'json') ok = download(`${base}.plan.json`, JSON.stringify(plan, null, 2), 'application/json');
    if (kind === 'csv') ok = download(`${base}.placements.csv`, placementsCsv(plan), 'text/csv');
    if (kind === 'html') ok = download(`${base}.report.html`, buildHtmlReport(plan), 'text/html');
    if (kind === 'interactive') ok = download(`${base}.interactive-3d.html`, buildInteractiveHtmlReport(plan), 'text/html');
    if (kind === 'edi214') {
      const ediText = generateEdi214(plan);
      ok = download(`${base}.status.214.edi`, ediText, 'application/edi-x12');
    }
    if (kind === 'vicsbol') {
      const bolHtml = buildVicsBolHtml(plan, {
        ...bol,
        lineDeclarations: bolLines,
        humanApproved: bolApproved,
        shipperSignatureDataUrl: shipperSig || undefined,
        driverSignatureDataUrl: driverSig || undefined,
      });
      const w = window.open('', '_blank');
      if (w) { w.document.write(bolHtml); w.document.close(); ok = true; }
      else { ok = download(`${base}.vics-bol.html`, bolHtml, 'text/html'); }
      if (ok) { const r = assessBolReadiness(plan, { ...bol, lineDeclarations: bolLines, humanApproved: bolApproved }); p.notify(r.isFinal ? 'ok' : 'warn', r.isFinal ? 'Bill of Lading generated for print / PDF export.' : `Draft Load Manifest generated (not a valid BOL): ${r.blockers.length} item(s) outstanding.`); }
      return;
    }
    if (kind === 'gltf') {
      const eqProfile = scenario.equipment.find((e) => e.id === result!.equipmentId);
      const eq = eqProfile ? normalizeEquipment(eqProfile) : null;
      if (eq) {
        const units = expandUnits(scenario.rows);
        ok = download(`${base}.scene.gltf`, exportToGltf(eq, plan.placements, units), 'model/gltf+json');
      }
    }
    if (kind === 'workorder') {
      const w = window.open('', '_blank');
      if (w) { w.document.write(buildWorkOrderHtml(plan)); w.document.close(); ok = true; }
      else { ok = download(`${base}.work-order.html`, buildWorkOrderHtml(plan), 'text/html'); }
      if (ok) p.notify('ok', 'Loading work order generated for print / PDF export.');
      return;
    }
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
                <button className="btn" disabled={!ready} onClick={() => exportAs('workorder')} title="Physical loading checklist and driver bill-of-lading print sheet">📋 Loading Work Order</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('vicsbol')} title="VICS Bill of Lading when every field is declared and approved; otherwise a clearly marked Draft Load Manifest">📜 VICS BOL / Draft</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('html')}>Report (HTML, printable)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('open')}>Open report to print/PDF</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('gltf')} title="Export Khronos glTF 2.0 3D CAD model for Blender, Three.js, or Unity">🧊 3D CAD (.gltf)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('json')}>Plan file (JSON)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('csv')}>Placements (CSV)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('edi214')} title="Export ANSI X12 EDI 214 Carrier Shipment Status Message with Seal Verification">📡 EDI 214 Status</button>
                <button className="btn sm" disabled={!ready} onClick={() => setSignatureModal('driver')} title="Sign digitally on glass as driver">✍️ {driverSig ? '✓ Driver Signed' : 'Driver Sign on Glass'}</button>
                <button className="btn sm" disabled={!ready} onClick={() => setSignatureModal('shipper')} title="Sign digitally on glass as shipper">✍️ {shipperSig ? '✓ Shipper Signed' : 'Shipper Sign'}</button>
                <button className="btn" style={{ background: '#0f172a', color: '#38bdf8', borderColor: '#334155', fontWeight: 'bold' }} disabled={!ready} onClick={() => { const plan = makePlan(); if (plan) window.open(buildFreightQuoteUrl(plan), '_blank'); }} title="Open Product 02 Freight Pricing Engine with this load's equipment, weight, and stops">💰 Quote in Product 02 ↗</button>
                <button className="btn" onClick={() => { const ok = download(`${slug(scenario.name)}.cargo.csv`, cargoToCsv(scenario.rows), 'text/csv'); p.notify(ok ? 'ok' : 'err', ok ? 'Manifest CSV downloaded.' : 'Download failed.'); }}>Manifest (CSV)</button>
              </div>
              <details className="bol-details">
                <summary>Bill of Lading details (required to issue a final BOL; nothing is invented)</summary>
                {(['carrierName', 'scac', 'proNumber', 'shipperName', 'shipperAddress', 'shipperCityStateZip', 'consigneeName', 'consigneeAddress', 'consigneeCityStateZip', 'trailerNumber', 'sealNumber', 'emergencyPhone', 'specialInstructions'] as const).map((k) => (
                  <label key={k} className="small" style={{ display: 'block' }}>{k}
                    <input value={bol[k] ?? ''} onChange={(ev) => setBol({ ...bol, [k]: ev.target.value })} style={{ width: '100%' }} />
                  </label>
                ))}
                {Array.from(new Set(makePlan()?.placements.map((pl) => pl.label) ?? [])).map((label) => (
                  <div key={label} className="small">
                    <b>{label}</b>{' '}
                    <input placeholder="NMFC" value={bolLines[label]?.nmfc ?? ''} onChange={(ev) => setBolLines({ ...bolLines, [label]: { ...bolLines[label], nmfc: ev.target.value } })} />{' '}
                    <input placeholder="Class" value={bolLines[label]?.freightClass ?? ''} onChange={(ev) => setBolLines({ ...bolLines, [label]: { ...bolLines[label], freightClass: ev.target.value } })} />{' '}
                    <input placeholder="Pkg type" value={bolLines[label]?.packageType ?? ''} onChange={(ev) => setBolLines({ ...bolLines, [label]: { ...bolLines[label], packageType: ev.target.value } })} />
                  </div>
                ))}
                <label className="small"><input type="checkbox" checked={bolApproved} onChange={(ev) => setBolApproved(ev.target.checked)} /> I have verified these details and approve issuing this as a Bill of Lading</label>
              </details>
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

      {signatureModal && (
        <SignaturePad
          title={signatureModal === 'driver' ? 'Driver Acceptance Signature (Sign on Glass)' : 'Shipper Release Signature (Sign on Glass)'}
          onSave={(dataUrl) => {
            if (signatureModal === 'driver') setDriverSig(dataUrl);
            else setShipperSig(dataUrl);
            setSignatureModal(null);
            p.notify('ok', `${signatureModal === 'driver' ? 'Driver' : 'Shipper'} digital signature captured and embedded into VICS BOL.`);
          }}
          onCancel={() => setSignatureModal(null)}
        />
      )}
    </section>
  );
}
