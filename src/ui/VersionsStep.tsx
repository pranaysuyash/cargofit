import { useMemo, useRef, useState } from 'react';
import { buildHtmlReport, buildInteractiveHtmlReport, buildWorkOrderHtml, buildPlanFile, LIMITATIONS, placementsCsv } from '../engine/report';
import { exportToGltf } from '../engine/gltf';
import { generateEdi214, type Edi214Options } from '../engine/edi214';
import { assessBolReadiness, buildVicsBolHtml } from '../engine/vicsBol';
import type { BolLineDeclaration } from '../engine/vicsBol';
import { SignaturePad } from './SignaturePad';
import { buildFreightQuoteUrl } from '../engine/quoteBridge';
import { isProductLicensed } from './SuiteDock';
import { useShipmentSession } from '../suite/ShipmentSession';
import {
  IconBox3d,
  IconFileText,
  IconRadio,
  IconDollar,
  IconExternalLink,
  IconCheck,
} from './icons';
import { expandUnits, normalizeEquipment } from '../engine/normalize';
import { cargoToCsv } from '../engine/csv';
import { diffRows, diffResults, summarize } from '../engine/scenario';
import { deleteScenario, loadAll, STORE_KEY } from '../engine/storage';
import { artifactScope, readLegacyModeledArtifacts, selectModeledArtifact } from '../engine/modeledArtifacts';
import { bolReviewScope, scopedBolEvidence, type ScopedBolEvidence } from '../engine/bolReviewScope';
import type { AppApi } from './App';
import { StatusBadge, download, slug } from './common';

export function VersionsStep(p: AppApi) {
  const shipmentSession = useShipmentSession();
  const { scenario, results, saved, readOnly } = p;
  const [note, setNote] = useState('');
  const [cmp, setCmp] = useState<{ id: string; rev: number } | null>(null);
  const [signatureModal, setSignatureModal] = useState<{ role: 'shipper' | 'driver'; scope: string } | null>(null);
  const [shipperEvidence, setShipperEvidence] = useState<ScopedBolEvidence<string> | null>(null);
  const [driverEvidence, setDriverEvidence] = useState<ScopedBolEvidence<string> | null>(null);
  const [bol, setBol] = useState<Partial<Record<'carrierName' | 'scac' | 'shipperName' | 'shipperAddress' | 'shipperCityStateZip' | 'consigneeName' | 'consigneeAddress' | 'consigneeCityStateZip' | 'trailerNumber' | 'sealNumber' | 'proNumber' | 'specialInstructions' | 'emergencyPhone', string>>>({});
  const [bolLines, setBolLines] = useState<Record<string, BolLineDeclaration>>({});
  const [approvedScope, setApprovedScope] = useState<string | null>(null);
  const [edi, setEdi] = useState({ carrierScac: '', shipperId: '', shipmentId: '', bolNumber: '', sealNumber: '', equipmentId: '', statusCode: '', statusReason: '', originCity: '', originState: '', date: '', controlNumber: '', usageIndicator: '', reportedWeightLbs: '', reportedPieceCount: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const plannable = results.filter((r) => r.arrangements.length > 0);
  const result = plannable.find((r) => r.equipmentId === p.planEq) ?? plannable[0];
  const arrIdx = result ? Math.min(p.arrIdx, result.arrangements.length - 1) : 0;
  const key = result ? `${result.equipmentId}:${arrIdx}` : '';
  const edited = !!(key && p.edits[key]);
  const ready = !!result && !p.stale && p.solver.state.phase === 'done';
  let legacyArtifacts: ReturnType<typeof readLegacyModeledArtifacts> | null = null;
  try {
    legacyArtifacts = readLegacyModeledArtifacts(window.localStorage);
  } catch (err) {
    console.warn('Failed to read legacy modeled artifacts from storage:', err);
  }

  const makePlan = () => {
    if (!result) return null;
    const placements = (key && p.edits[key]) || result.arrangements[arrIdx].placements;
    const scope = artifactScope(scenario, result.equipmentId, arrIdx, placements, 0);
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch (err) {
      console.warn('LocalStorage unavailable in browser context:', err);
    }
    const activeTandemConfig = selectModeledArtifact(storage, 'tandem', p.tandemConfig, scope);
    const activeNmfcSummary = selectModeledArtifact(storage, 'nmfc', p.nmfcSummary, scope);
    return buildPlanFile({
      scenario,
      result,
      placements,
      arrangementName: result.arrangements[arrIdx].name,
      edited,
      inputHash: p.hash,
      tandemConfig: activeTandemConfig ?? undefined,
      nmfcSummary: activeNmfcSummary ?? undefined,
    });
  };
  const reviewPlan = ready ? makePlan() : null;
  const currentBolScope = reviewPlan ? bolReviewScope(reviewPlan, bol, bolLines) : null;
  const bolApproved = currentBolScope !== null && approvedScope === currentBolScope;
  const shipperSig = scopedBolEvidence(shipperEvidence, currentBolScope);
  const driverSig = scopedBolEvidence(driverEvidence, currentBolScope);
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
      try {
        const ediText = generateEdi214(plan, {
          ...edi,
          statusCode: edi.statusCode as Edi214Options['statusCode'],
          usageIndicator: edi.usageIndicator as Edi214Options['usageIndicator'],
          date: edi.date ? new Date(edi.date) : undefined,
          reportedWeightLbs: edi.reportedWeightLbs.trim() ? Number(edi.reportedWeightLbs) : undefined,
          reportedPieceCount: edi.reportedPieceCount.trim() ? Number(edi.reportedPieceCount) : undefined,
        });
        ok = download(`${base}.status.214.edi`, ediText, 'application/edi-x12');
      } catch (error) {
        p.notify('err', `Enter the EDI 214 event details: ${(error as Error).message}`);
        return;
      }
    }
    if (kind === 'vicsbol') {
      const bolHtml = buildVicsBolHtml(plan, {
        ...bol,
        tandemConfig: plan.tandemConfig,
        nmfcSummary: plan.nmfcSummary,
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
      else p.notify('err', 'Pop-up blocked. Use “Download report” instead.');
      if (ok) p.notify('ok', 'Report opened in a new tab (use your browser Print -> Save as PDF).');
      return;
    }
    p.notify(ok ? 'ok' : 'err', ok ? `Exported ${kind.toUpperCase()}${plan.validation.passed ? '' : ` (note: ${plan.validation.violations.length} validator violation(s) recorded)`}.` : 'Download failed in this browser.');
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
      <p className="muted small">Tandem and density estimates are exported only when their recorded scenario, equipment and arrangement match. Older unscoped browser estimates remain stored but are not used.</p>
      {(legacyArtifacts?.tandemRaw !== null && legacyArtifacts?.tandemRaw !== undefined || legacyArtifacts?.nmfcRaw !== null && legacyArtifacts?.nmfcRaw !== undefined) && <button className="btn sm" onClick={() => {
        try {
          const raw = readLegacyModeledArtifacts(window.localStorage);
          const ok = download('cargo-fit-legacy-estimates.json', JSON.stringify({ format: 'cargo-fit-legacy-estimates', ...raw }, null, 2), 'application/json');
          p.notify(ok ? 'ok' : 'err', ok ? 'Downloaded legacy estimate data for review; current plans are unchanged.' : 'Legacy estimate download failed.');
        } catch { p.notify('err', 'Legacy estimate data could not be read. It remains in browser storage.'); }
      }}>Download legacy estimates for review</button>}

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
                <button className="btn primary" disabled={!ready} onClick={() => exportAs('interactive')} title="Single-file offline HTML with embedded 3D viewer, rotation, and loading player">Interactive 3D (.html)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('workorder')} title="Physical loading checklist and driver bill-of-lading print sheet">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><IconFileText size={14} /> Loading Work Order</span>
                </button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('vicsbol')} title="VICS Bill of Lading when every field is declared and approved; otherwise a clearly marked Draft Load Manifest">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><IconFileText size={14} /> VICS BOL / Draft</span>
                </button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('html')}>Report (HTML, printable)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('open')}>Open report to print/PDF</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('gltf')} title="Export Khronos glTF 2.0 3D CAD model for Blender, Three.js, or Unity">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><IconBox3d size={14} /> 3D CAD (.gltf)</span>
                </button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('json')}>Plan file (JSON)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('csv')}>Placements (CSV)</button>
                <button className="btn" disabled={!ready} onClick={() => exportAs('edi214')} title="Export an EDI 214 using the event details entered below">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><IconRadio size={14} /> EDI 214 Status</span>
                </button>
                <button className="btn sm" disabled={!currentBolScope} onClick={() => currentBolScope && setSignatureModal({ role: 'driver', scope: currentBolScope })} title="Sign digitally on glass as driver">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {driverSig ? <><IconCheck size={12} /> Driver Signed</> : 'Driver Sign on Glass'}
                  </span>
                </button>
                <button className="btn sm" disabled={!currentBolScope} onClick={() => currentBolScope && setSignatureModal({ role: 'shipper', scope: currentBolScope })} title="Sign digitally on glass as shipper">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {shipperSig ? <><IconCheck size={12} /> Shipper Signed</> : 'Shipper Sign'}
                  </span>
                </button>
                <button
                  className="btn"
                  style={{ background: '#0f172a', color: '#38bdf8', borderColor: '#334155', fontWeight: 'bold' }}
                  disabled={!ready}
                  onClick={() => {
                    const plan = makePlan();
                    if (!plan) return;
                    if (isProductLicensed('product-02-freight-pricing')) {
                      window.open(shipmentSession?.shipment ? shipmentSession.productUrl('product-02-freight-pricing') : buildFreightQuoteUrl(plan), '_blank');
                    } else {
                      exportAs('json');
                      p.notify('warn', 'Pricing HUD is an add-on ($199/mo). Exported Open Logistics Load JSON for external ERP, or upgrade via Apps dock.');
                    }
                  }}
                  title="Open Product 02 Freight Pricing Engine with this load's equipment, weight, and stops"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <IconDollar size={14} /> Quote in Product 02 <IconExternalLink size={12} />
                  </span>
                </button>
                <button className="btn" onClick={() => { const ok = download(`${slug(scenario.name)}.cargo.csv`, cargoToCsv(scenario.rows), 'text/csv'); p.notify(ok ? 'ok' : 'err', ok ? 'Manifest CSV downloaded.' : 'Download failed.'); }}>Manifest (CSV)</button>
              </div>
              <details className="bol-details">
                <summary>EDI 214 event and trading partner details</summary>
                <p className="muted small">Enter the actual event and partner identifiers. A load plan does not establish shipment status, seal condition or equipment identity. Confirm the generated file against your trading partner's requirements.</p>
                {([
                  ['carrierScac', 'Carrier SCAC'], ['shipperId', 'Receiver identifier'], ['shipmentId', 'Shipment identifier'],
                  ['bolNumber', 'Bill of lading number'], ['controlNumber', 'Nine-digit interchange control number'],
                  ['statusReason', 'Status reason code'], ['originCity', 'Event city'], ['originState', 'Event US state (two letters)'],
                  ['sealNumber', 'Seal number (optional)'], ['equipmentId', 'Equipment identifier (optional)'],
                  ['reportedWeightLbs', 'Reported gross weight in lb (optional)'], ['reportedPieceCount', 'Reported piece count (optional)'],
                ] as const).map(([key, label]) => <label key={key} className="small" style={{ display: 'block' }}>{label}
                  <input value={edi[key]} onChange={event => setEdi(current => ({ ...current, [key]: event.target.value }))} style={{ width: '100%' }} />
                </label>)}
                <label className="small" style={{ display: 'block' }}>Event time (your local time)
                  <input type="datetime-local" value={edi.date} onChange={event => setEdi(current => ({ ...current, date: event.target.value }))} />
                </label>
                <label className="small" style={{ display: 'block' }}>Shipment status
                  <select value={edi.statusCode} onChange={event => setEdi(current => ({ ...current, statusCode: event.target.value }))}>
                    <option value="">Select status</option><option value="X3">Arrived at pickup</option><option value="AF">Departed with shipment</option><option value="AG">Estimated arrival</option><option value="X6">En route</option><option value="D1">Unloaded at delivery</option>
                  </select>
                </label>
                <label className="small" style={{ display: 'block' }}>Trading partner usage
                  <select value={edi.usageIndicator} onChange={event => setEdi(current => ({ ...current, usageIndicator: event.target.value }))}>
                    <option value="">Select usage</option><option value="T">Test</option><option value="P">Production</option>
                  </select>
                </label>
              </details>
              <details className="bol-details">
                <summary>Bill of Lading details (required to issue a final BOL; nothing is invented)</summary>
                {([
                  ['carrierName', 'Carrier name'], ['scac', 'Carrier SCAC'], ['proNumber', 'PRO number'],
                  ['shipperName', 'Shipper name'], ['shipperAddress', 'Shipper address'], ['shipperCityStateZip', 'Shipper city, state and ZIP'],
                  ['consigneeName', 'Consignee name'], ['consigneeAddress', 'Consignee address'], ['consigneeCityStateZip', 'Consignee city, state and ZIP'],
                  ['trailerNumber', 'Trailer number'], ['sealNumber', 'Seal number'], ['emergencyPhone', 'Emergency phone'], ['specialInstructions', 'Special instructions'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="small" style={{ display: 'block' }}>{label}
                    <input value={bol[k] ?? ''} onChange={(ev) => setBol({ ...bol, [k]: ev.target.value })} style={{ width: '100%' }} />
                  </label>
                ))}
                {Array.from(new Set(makePlan()?.placements.map((pl) => pl.label) ?? [])).map((label) => (
                  <fieldset key={label} className="small">
                    <legend>{label}</legend>
                    <label>NMFC number <input aria-label={`${label}: NMFC number`} value={bolLines[label]?.nmfc ?? ''} onChange={(ev) => setBolLines({ ...bolLines, [label]: { ...bolLines[label], nmfc: ev.target.value } })} /></label>{' '}
                    <label>Freight class <input aria-label={`${label}: Freight class`} value={bolLines[label]?.freightClass ?? ''} onChange={(ev) => setBolLines({ ...bolLines, [label]: { ...bolLines[label], freightClass: ev.target.value } })} /></label>{' '}
                    <label>Package type <input aria-label={`${label}: Package type`} value={bolLines[label]?.packageType ?? ''} onChange={(ev) => setBolLines({ ...bolLines, [label]: { ...bolLines[label], packageType: ev.target.value } })} /></label>
                  </fieldset>
                ))}
                <label className="small"><input type="checkbox" checked={bolApproved} disabled={!currentBolScope} onChange={(ev) => setApprovedScope(ev.target.checked ? currentBolScope : null)} /> I have verified these details and approve issuing this as a Bill of Lading</label>
                <p className="muted small">Changes to the plan or document details require a new review and signatures.</p>
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
        <div className="panel-h"><b>Saved scenarios in this browser</b><span>{p.storageError ? 'Unavailable' : `${saved.length} scenario(s)`}</span></div>
        {p.storageError ? <div role="alert"><p>{p.storageError} Saving and deletion remain blocked until the stored data can be read.</p>
          <button className="btn sm" onClick={() => {
            try {
              const raw = window.localStorage.getItem(STORE_KEY);
              if (raw === null) { p.notify('warn', 'No saved data was found to download.'); return; }
              const ok = download('cargofit-saved-scenarios-recovery.txt', raw, 'text/plain');
              p.notify(ok ? 'ok' : 'err', ok ? 'Recovery download requested. Check your downloads.' : 'Recovery download failed in this browser.');
            } catch { p.notify('err', 'Browser storage could not be read for recovery.'); }
          }}>Download original saved data</button>{' '}
          <button className="btn sm" onClick={() => {
            try { p.setSaved(loadAll(window.localStorage)); p.setStorageError(null); p.notify('ok', 'Saved scenarios read successfully.'); }
            catch (e) { p.setStorageError((e as Error).message); }
          }}>Retry reading</button>
        </div> : saved.length === 0 ? <p className="muted">Nothing saved yet.</p> : (
          <div className="saved">
            {saved.map((s) => (
              <article key={s.id} className={s.id === p.currentId ? 'cur' : ''}>
                <header><b>{s.name}</b><span className="muted small">updated {new Date(s.updatedAt).toLocaleString()}</span>
                  <button className="btn sm ghost danger" onClick={() => { if (window.confirm(`Delete “${s.name}” and all ${s.revisions.length} revision(s) from this browser?`)) { try { deleteScenario(window.localStorage, s.id); p.setSaved(loadAll(window.localStorage)); p.notify('ok', 'Scenario deleted from this browser.'); } catch (e) { p.setStorageError((e as Error).message); p.notify('err', `Could not delete: ${(e as Error).message}`); } } }}>Delete</button></header>
                <ul>
                  {s.revisions.slice().reverse().map((r) => (
                    <li key={r.rev}>
                      <span className="mono">r{r.rev}</span> <span className="muted small">{new Date(r.savedAt).toLocaleString()}</span> {r.note && <i>“{r.note}”</i>}
                      <span className="rsum">{r.summaries.map((x) => x.status === 'FEASIBLE_UNDER_MODELED_CONSTRAINTS' ? 'PASS' : x.status === 'PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS' ? 'FAIL' : '·').join(' ')}</span>
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
            {compared.rows.length === 0 ? <p>Same manifest as r{compared.rev.rev}.</p> : <ul className="chg">{compared.rows.map((c) => <li key={c.uid}><b>{c.kind}</b> {c.label}{c.fields.length ? `: ${c.fields.join(', ')}` : ''}</li>)}</ul>}
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
          title={signatureModal.role === 'driver' ? 'Driver Acceptance Signature (Sign on Glass)' : 'Shipper Release Signature (Sign on Glass)'}
          onSave={(dataUrl) => {
            if (signatureModal.role === 'driver') setDriverEvidence({ scope: signatureModal.scope, value: dataUrl });
            else setShipperEvidence({ scope: signatureModal.scope, value: dataUrl });
            setSignatureModal(null);
            p.notify('ok', `${signatureModal.role === 'driver' ? 'Driver' : 'Shipper'} signature captured for this document version.`);
          }}
          onCancel={() => setSignatureModal(null)}
        />
      )}
    </section>
  );
}
