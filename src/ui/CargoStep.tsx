import { useMemo, useRef, useState } from 'react';
import { cargoToCsv, importCargoCsv, importCargoTable, type ImportIssue } from '../engine/csv';
import { parseXlsx, type XlsxWorkbook } from '../engine/xlsx';
import { parseEdi204 } from '../engine/edi204';
import { blankRow } from '../engine/scenario';
import { LENGTH_UNITS, MASS_UNITS, fmtNum, toKg, toMm } from '../engine/units';
import { renderCargo3D } from '../engine/viz';
import type { CargoRow, InputIssue, RotationRule } from '../engine/types';
import type { AppApi } from './App';
import { NumInput, download } from './common';
import { SAMPLES, sampleScenario } from './samples';

export function CargoStep(p: AppApi) {
  const { scenario, setScenario, issues, readOnly } = p;
  const [imp, setImp] = useState<{ name: string; issues: ImportIssue[]; count: number } | null>(null);
  const [sheetPicker, setSheetPicker] = useState<{ fileName: string; workbook: XlsxWorkbook } | null>(null);
  const [ediModalOpen, setEdiModalOpen] = useState(false);
  const [ediRawText, setEdiRawText] = useState('');
  const [drag, setDrag] = useState(false);
  const [inspectUid, setInspectUid] = useState<string | null>(null);
  const [orientIdx, setOrientIdx] = useState(0);
  const [yawDeg, setYawDeg] = useState(35);
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

  const importTable = (fileName: string, sheetName: string, table: string[][], mode: 'replace' | 'append') => {
    const r = importCargoTable(table);
    setImp({ name: `${fileName} [${sheetName}]`, issues: r.issues, count: r.rows.length });
    if (r.rows.length === 0) {
      p.notify('err', `No valid cargo rows imported from sheet "${sheetName}": ${r.issues[0]?.message ?? 'empty sheet'}`);
      return;
    }
    setScenario((s) => ({ ...s, rows: mode === 'replace' ? r.rows : [...s.rows, ...r.rows] }));
    const bad = r.issues.filter((i) => i.severity === 'error').length;
    p.notify(bad ? 'warn' : 'ok', `Imported ${r.rows.length} row(s) from "${sheetName}" in ${fileName}${bad ? ` — ${bad} cell(s) need repair below` : ''}.`);
  };

  const importEdiText = (name: string, text: string, mode: 'replace' | 'append') => {
    const res = parseEdi204(text);
    setImp({ name, issues: res.issues, count: res.rows.length });
    if (res.rows.length === 0) {
      p.notify('err', `No cargo rows found in EDI 204 tender (${name}): ${res.issues[0]?.message ?? 'no lading segments'}`);
      return;
    }
    setScenario((s) => ({
      ...s,
      name: res.bolNumber ? `EDI Tender ${res.bolNumber}` : s.name,
      rows: mode === 'replace' ? res.rows : [...s.rows, ...res.rows],
    }));
    const bad = res.issues.filter((i) => i.severity === 'error' || i.severity === 'warning').length;
    p.notify(bad ? 'warn' : 'ok', `Imported ${res.rows.length} row(s) from EDI 204 tender ${res.bolNumber ? `(${res.bolNumber})` : ''} — ${res.stopsCount} stop(s)${bad ? `, ${bad} warning(s)` : ''}.`);
  };

  const onFile = async (f: File | undefined | null) => {
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) {
      try {
        const buf = await f.arrayBuffer();
        const wb = await parseXlsx(buf);
        if (wb.sheets.length === 0) {
          p.notify('err', `No worksheets found in ${f.name}`);
          return;
        }
        if (wb.sheets.length === 1) {
          importTable(f.name, wb.sheets[0].name, wb.sheets[0].data, scenario.rows.length ? 'append' : 'replace');
        } else {
          setSheetPicker({ fileName: f.name, workbook: wb });
        }
      } catch (err) {
        p.notify('err', `Could not read ${f.name} as Excel: ${String(err)}`);
      }
      return;
    }
    const txt = await f.text();
    if (/\.(edi|x12)$/i.test(f.name) || txt.includes('ST*204') || txt.startsWith('ISA*')) {
      importEdiText(f.name, txt, scenario.rows.length ? 'append' : 'replace');
      return;
    }
    importText(f.name, txt, scenario.rows.length ? 'append' : 'replace');
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
          <button className="btn" disabled={disabled} onClick={() => fileRef.current?.click()}>Import CSV / Excel…</button>
          <button className="btn" disabled={disabled} onClick={() => setEdiModalOpen(true)} title="Import ANSI X12 EDI 204 Motor Carrier Load Tender">Import EDI 204…</button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.edi,.x12,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button className="btn" onClick={() => { const ok = download(`${scenario.name || 'cargo'}.csv`.replace(/\s+/g, '-'), cargoToCsv(scenario.rows), 'text/csv'); p.notify(ok ? 'ok' : 'err', ok ? 'Manifest CSV downloaded.' : 'Download failed in this browser.'); }}>Download CSV</button>
          <button className="btn" disabled={disabled} onClick={() => setScenario((s) => ({ ...s, rows: [...s.rows, blankRow()] }))}>+ Add row</button>
        </div>
      </div>

      <div className={`drop${drag ? ' over' : ''}`} role="group" aria-label="CSV and Excel drop zone"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) onFile(e.dataTransfer.files?.[0]); }}>
        <span>Drop a CSV or Excel (.xlsx) file here, or start from an example:</span>
        {SAMPLES.map((s) => (
          <button key={s.id} className="btn sm ghost" disabled={disabled} title={s.blurb}
            onClick={() => { const sc = sampleScenario(s.id); setScenario((cur) => ({ ...cur, name: sc.name, rows: sc.rows })); setImp(null); p.notify('ok', `Loaded “${s.title}”. Edit anything — it is plain data.`); }}>{s.title}</button>
        ))}
        <a className="linkbtn" href="#/app/cargo" onClick={(e) => { e.preventDefault(); const t = SAMPLES[0]; download(t.file, t.csv, 'text/csv'); }}>Download example CSV</a>
      </div>

      {sheetPicker && (
        <div className="panel sheet-picker-panel" role="dialog" aria-modal="true" aria-labelledby="h-sheet-picker">
          <div className="panel-h">
            <b id="h-sheet-picker">Select Worksheet — {sheetPicker.fileName}</b>
            <button className="btn sm ghost" onClick={() => setSheetPicker(null)}>Cancel</button>
          </div>
          <p className="muted small">This workbook contains {sheetPicker.workbook.sheets.length} sheets. Choose which sheet to import into Cargo Fit:</p>
          <div className="sheet-pills">
            {sheetPicker.workbook.sheets.map((s, idx) => (
              <button
                key={idx}
                className="arr-btn"
                onClick={() => {
                  importTable(sheetPicker.fileName, s.name, s.data, scenario.rows.length ? 'append' : 'replace');
                  setSheetPicker(null);
                }}
              >
                <span className="arr-title">📄 {s.name}</span>
                <span className="arr-stat mono">{s.data.length} row(s) detected</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {ediModalOpen && (
        <div className="panel sheet-picker-panel" role="dialog" aria-modal="true" aria-labelledby="h-edi-tender">
          <div className="panel-h">
            <b id="h-edi-tender">ANSI X12 EDI 204 Motor Carrier Load Tender Ingest</b>
            <button className="btn sm ghost" onClick={() => setEdiModalOpen(false)}>Close</button>
          </div>
          <p className="muted small">
            Paste an EDI 204 shipment tender (with segments ST, B2, S5, L5, AT8, MEA, OID) or click “Load Sample Tender”.
            Physical dimensions and weights are parsed per unit; undeclared values remain unmodeled per the zero-invention policy.
          </p>
          <textarea
            className="txt mono"
            style={{ width: '100%', height: 180, fontSize: '0.8rem', padding: 8, fontFamily: 'monospace' }}
            placeholder="ST*204*0001~&#10;B2**SWFT*BOL-889912**PP~&#10;S5*1*LD*24000*L~&#10;L5*1*Electronics Pallets~&#10;AT8*G*L*12000*6*PLT~&#10;MEA*PD*LN*48*IN~&#10;MEA*PD*WD*40*IN~&#10;MEA*PD*HT*60*IN~&#10;SE*8*0001~"
            value={ediRawText}
            onChange={(e) => setEdiRawText(e.target.value)}
          />
          <div className="actions" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              className="btn primary"
              disabled={!ediRawText.trim()}
              onClick={() => {
                importEdiText('pasted-tender.edi', ediRawText, scenario.rows.length ? 'append' : 'replace');
                setEdiModalOpen(false);
              }}
            >
              Parse & Import EDI 204
            </button>
            <button
              className="btn"
              onClick={() => {
                const sampleEdi = `ISA*00*          *00*          *ZZ*ACMESHP        *ZZ*SWFT           *261020*1200*U*00401*000000001*0*P*>~
GS*SM*ACMESHP*SWFT*20261020*1200*1*X*004010~
ST*204*0001~
B2**SWFT*BOL-889912**PP~
B2A*00~
N1*SH*ACME Logistics Dallas Hub~
N3*4400 Interstate Blvd~
N4*Dallas*TX*75201*US~
N1*CN*Apex Distribution Center Chicago~
N3*990 Logistics Way~
N4*Chicago*IL*60601*US~
S5*1*LD*24000*L*1200*E*10*PLT~
L5*1*Consumer Electronics Pallets~
AT8*G*L*12000*6*PLT~
MEA*PD*LN*48*IN~
MEA*PD*WD*40*IN~
MEA*PD*HT*60*IN~
S5*2*UL*12000*L*600*E*5*PLT~
L5*2*Industrial Hardware 48x40x48 in~
AT8*G*L*8000*4*PLT~
SE*18*0001~
GE*1*1~
IEA*1*000000001~`;
                setEdiRawText(sampleEdi);
              }}
            >
              Load Sample 2-Stop Tender
            </button>
            <button className="btn ghost" onClick={() => setEdiRawText('')}>Clear</button>
          </div>
        </div>
      )}

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
              <th>Weight each</th><th>Unit</th><th>Rotation</th><th>Stacking</th><th>Stop</th><th>Size in mm</th><th aria-label="Row actions" />
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
                    <td><NumInput value={r.stop ?? null} label={`Row ${i + 1} delivery stop`} disabled={disabled} width={44} placeholder="—" onChange={(v) => update(r.uid, { stop: v })} /></td>
                    <td className="mono dim conv">{mm ? `${fmtNum(mm[0], 0)}×${fmtNum(mm[1], 0)}×${fmtNum(mm[2], 0)}` : '—'}{r.weight && r.weight > 0 ? ` · ${fmtNum(toKg(r.weight, r.weightUnit), 1)} kg` : ''}</td>
                    <td className="actions-cell">
                      <button className={`btn sm ${inspectUid === r.uid ? 'primary' : 'ghost'}`} title="Inspect 3D box and allowed orientations" onClick={() => { setInspectUid(inspectUid === r.uid ? null : r.uid); setOrientIdx(0); }}>3D</button>
                      <button className="btn sm ghost" aria-label={`Remove row ${i + 1}`} disabled={disabled} onClick={() => setScenario((s) => ({ ...s, rows: s.rows.filter((x) => x.uid !== r.uid) }))}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {inspectUid && (() => {
        const r = scenario.rows.find((x) => x.uid === inspectUid);
        if (!r || !r.length || !r.width || !r.height) return null;
        const lMm = toMm(r.length, r.dimUnit);
        const wMm = toMm(r.width, r.dimUnit);
        const hMm = toMm(r.height, r.dimUnit);
        let orients: [number, number, number][];
        if (r.rotation === 'fixed') orients = [[lMm, wMm, hMm]];
        else if (r.rotation === 'upright') orients = [[lMm, wMm, hMm], [wMm, lMm, hMm]];
        else orients = [[lMm, wMm, hMm], [wMm, lMm, hMm], [lMm, hMm, wMm], [hMm, lMm, wMm], [wMm, hMm, lMm], [hMm, wMm, lMm]];
        // dedup
        const seen = new Set<string>();
        const uniqueOrients = orients.filter((d) => {
          const k = d.map((v) => Math.round(v)).join('x');
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const curOrient = uniqueOrients[orientIdx % uniqueOrients.length] || [lMm, wMm, hMm];
        const [curL, curW, curH] = curOrient;
        const volM3 = (curL * curW * curH) / 1e9;
        const weightKg = r.weight ? toKg(r.weight, r.weightUnit) : null;
        const density = weightKg !== null && volM3 > 0 ? weightKg / volM3 : null;

        const svg3d = renderCargo3D({
          length: curL,
          width: curW,
          height: curH,
          stackable: r.stackable,
          rotation: r.rotation,
          yawDeg,
          label: r.label,
          weightKg,
        });

        return (
          <div className="panel cargo-3d-panel" role="region" aria-label="3D Cargo Inspection">
            <div className="panel-h">
              <b>3D Spatial Inspection · {r.label || 'Selected Cargo'}</b>
              <div className="actions">
                <button className="btn sm ghost" onClick={() => setYawDeg((y) => (y - 30 + 360) % 360)}>⟲ Rotate -30°</button>
                <button className="btn sm ghost" onClick={() => setYawDeg((y) => (y + 30) % 360)}>⟳ Rotate +30°</button>
                <button className="btn sm ghost" onClick={() => setInspectUid(null)}>✕ Close 3D</button>
              </div>
            </div>

            <div className="cargo-3d-grid">
              <div className="cargo-svg-card" dangerouslySetInnerHTML={{ __html: svg3d }} />
              <div className="cargo-details-card">
                <div className="orient-section">
                  <span className="card-lbl">Allowed Orientations ({uniqueOrients.length} for {r.rotation} rule)</span>
                  <div className="orient-pills">
                    {uniqueOrients.map((o, idx) => (
                      <button key={idx} className={`btn sm ${idx === (orientIdx % uniqueOrients.length) ? 'primary' : 'ghost'}`}
                        onClick={() => setOrientIdx(idx)}>
                        {Math.round(o[0])} × {Math.round(o[1])} × {Math.round(o[2])} mm
                        {idx === 0 ? ' (entered)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="physical-specs-grid">
                  <div><span>Placed Size</span><b>{fmtNum(curL, 0)} × {fmtNum(curW, 0)} × {fmtNum(curH, 0)} mm</b></div>
                  <div><span>Footprint Area</span><b>{fmtNum((curL * curW) / 1e6, 3)} m²</b></div>
                  <div><span>Volume</span><b>{fmtNum(volM3, 3)} m³ ({fmtNum(volM3 * 35.3147, 1)} ft³)</b></div>
                  <div><span>Unit Weight</span><b>{weightKg !== null ? `${fmtNum(weightKg, 1)} kg` : 'unknown'}</b></div>
                  <div><span>Est. Density</span><b>{density !== null ? `${fmtNum(density, 0)} kg/m³` : 'n/a (unknown wt)'}</b></div>
                  <div><span>Top Surface</span><b className={r.stackable ? 'ok-t' : 'bad-t'}>{r.stackable ? '✓ Stackable' : '⚠ No-Stack Surface'}</b></div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
