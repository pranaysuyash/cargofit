import { useState } from 'react';
import { blankEquipment, DEFAULT_SETTINGS } from '../engine/scenario';
import { normalizeEquipment } from '../engine/normalize';
import { renderEquipment3D } from '../engine/viz';
import { LENGTH_UNITS, MASS_UNITS, fmtNum, fromMm, toMm, toKg } from '../engine/units';
import type { CostSource, EquipmentProfile } from '../engine/types';
import type { AppApi } from './App';
import { NumInput } from './common';
import { equipmentPresets } from './samples';

export function EquipmentStep(p: AppApi) {
  const { scenario, setScenario, issues, readOnly } = p;
  const [inspectEqId, setInspectEqId] = useState<string | null>(null);
  const disabled = !!readOnly;
  const patch = (id: string, x: Partial<EquipmentProfile>) =>
    setScenario((s) => ({ ...s, equipment: s.equipment.map((e) => (e.id === id ? { ...e, ...x } : e)) }));
  const eqIssue = (id: string, field: string) => issues.find((i) => i.scope === 'equipment' && i.rowUid === id && i.field === field);
  const st = scenario.settings;

  return (
    <section className="step" aria-labelledby="h-eq">
      <div className="step-head">
        <div><p className="eyebrow">Step 02</p><h1 id="h-eq">Equipment & loading spaces</h1>
          <p className="sub">Internal dimensions, door opening and declared payload. Presets are <b>illustrative</b> — edit them to match the real vehicle. Leave payload or door empty if unknown: that limit is then reported as <i>not declared</i>, never assumed.</p></div>
        <div className="actions">
          <button className="btn" disabled={disabled} onClick={() => setScenario((s) => ({ ...s, equipment: [...s.equipment, blankEquipment()] }))}>+ Custom profile</button>
          <button className="btn ghost" disabled={disabled} onClick={() => { setScenario((s) => ({ ...s, equipment: equipmentPresets() })); p.notify('ok', 'Illustrative presets restored.'); }}>Reset presets</button>
        </div>
      </div>

      <div className="cards">
        {scenario.equipment.map((e) => {
          const mmL = e.length ? toMm(e.length, e.unit) : null;
          const mmW = e.width ? toMm(e.width, e.unit) : null;
          const mmH = e.height ? toMm(e.height, e.unit) : null;
          const vol = mmL && mmW && mmH ? (mmL * mmW * mmH) / 1e9 : null;
          const ni = (field: 'length' | 'width' | 'height' | 'doorWidth' | 'doorHeight' | 'payload' | 'cost', label: string, w = 80) => (
            <NumInput value={e[field]} label={`${e.name} ${label}`} width={w} disabled={disabled}
              invalid={eqIssue(e.id, field.startsWith('door') ? 'door' : field)?.severity === 'error' ? eqIssue(e.id, field.startsWith('door') ? 'door' : field)?.message : undefined}
              onChange={(v) => patch(e.id, { [field]: v })} />
          );
          return (
            <article key={e.id} className={`eqcard${e.included ? '' : ' off'}`}>
              <header>
                <input className="txt title" aria-label="Equipment name" disabled={disabled} value={e.name} onChange={(ev) => patch(e.id, { name: ev.target.value })} />
                <label className="switch"><input type="checkbox" checked={e.included} disabled={disabled} onChange={(ev) => patch(e.id, { included: ev.target.checked })} /> Compare</label>
              </header>
              <div className="fieldgrid">
                <span className="lab">Internal L × W × H</span>
                <span className="inline">{ni('length', 'length')}<i>×</i>{ni('width', 'width')}<i>×</i>{ni('height', 'height')}
                  <select aria-label={`${e.name} unit`} disabled={disabled} value={e.unit} onChange={(ev) => patch(e.id, { unit: ev.target.value as EquipmentProfile['unit'] })}>{LENGTH_UNITS.map((u) => <option key={u}>{u}</option>)}</select></span>
                <span className="lab">Door opening W × H</span>
                <span className="inline">{ni('doorWidth', 'door width')}<i>×</i>{ni('doorHeight', 'door height')}
                  <button className="btn sm ghost" disabled={disabled || (e.doorWidth === null && e.doorHeight === null)} onClick={() => patch(e.id, { doorWidth: null, doorHeight: null })}>clear</button></span>
                <span className="lab">Declared payload</span>
                <span className="inline">{ni('payload', 'payload', 100)}
                  <select aria-label={`${e.name} mass unit`} disabled={disabled} value={e.massUnit} onChange={(ev) => patch(e.id, { massUnit: ev.target.value as EquipmentProfile['massUnit'] })}>{MASS_UNITS.map((u) => <option key={u}>{u}</option>)}</select></span>
                <span className="lab">Your cost (optional)</span>
                <span className="inline">{ni('cost', 'cost', 100)}
                  <input className="txt cur" aria-label={`${e.name} currency`} disabled={disabled} value={e.currency} maxLength={4} onChange={(ev) => patch(e.id, { currency: ev.target.value.toUpperCase() })} />
                  <select aria-label={`${e.name} cost source`} disabled={disabled} value={e.costSource} onChange={(ev) => patch(e.id, { costSource: ev.target.value as CostSource })}>
                    <option value="none">no cost</option><option value="user">my figure</option><option value="illustrative">illustrative</option></select></span>
              </div>
              <dl className="conv-row">
                <div><dt>Interior (mm)</dt><dd className="mono">{mmL && mmW && mmH ? `${fmtNum(mmL, 0)} × ${fmtNum(mmW, 0)} × ${fmtNum(mmH, 0)}` : '—'}</dd></div>
                <div><dt>Interior (in)</dt><dd className="mono">{mmL && mmW && mmH ? `${fmtNum(fromMm(mmL, 'in'), 1)} × ${fmtNum(fromMm(mmW, 'in'), 1)} × ${fmtNum(fromMm(mmH, 'in'), 1)}` : '—'}</dd></div>
                <div><dt>Volume</dt><dd className="mono">{vol ? `${fmtNum(vol, 2)} m³` : '—'}</dd></div>
                <div><dt>Payload (kg / lb)</dt><dd className="mono">{e.payload ? `${fmtNum(toKg(e.payload, e.massUnit), 0)} / ${fmtNum(toKg(e.payload, e.massUnit) / 0.45359237, 0)}` : 'not declared'}</dd></div>
              </dl>
              <p className="src" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><b>Source:</b> <input className="txt src-in" aria-label={`${e.name} source`} disabled={disabled} value={e.source} onChange={(ev) => patch(e.id, { source: ev.target.value })} /></span>
                <a
                  href={`http://localhost:5176/?vehicle=${encodeURIComponent(e.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn sm"
                  style={{ textDecoration: 'none', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  title="Inspect 3D digital twin, isometric projection, and CAD blueprints in Product 04 Asset Studio"
                >
                  📐 3D Asset Studio (P04) ↗
                </a>
              </p>
              {!!(eqIssue(e.id, 'payload') || eqIssue(e.id, 'door')) && e.included && (
                <p className="note warn">{[eqIssue(e.id, 'payload'), eqIssue(e.id, 'door')].filter(Boolean).map((i) => i!.message).join(' ')}</p>
              )}
              {inspectEqId === e.id && (() => {
                const norm = normalizeEquipment(e);
                if (!norm) return null;
                const svg3d = renderEquipment3D({ eq: norm });
                return (
                  <div className="eq-3d-preview" role="region" aria-label={`${e.name} 3D Bay`}>
                    <div className="eq-svg-wrap" dangerouslySetInnerHTML={{ __html: svg3d }} />
                    <div className="eq-wireframe-info">
                      <span className="small muted">
                        Front bulkhead (x=0) to rear door (x={Math.round(norm.L)}mm).
                        {norm.doorW !== null && norm.doorH !== null && (norm.doorW < norm.W || norm.doorH < norm.H)
                          ? ` ⚠ Bottleneck: Door (${Math.round(norm.doorW)}×${Math.round(norm.doorH)}mm) is smaller than interior (${Math.round(norm.W)}×${Math.round(norm.H)}mm).`
                          : ' Full aperture door.'}
                      </span>
                    </div>
                  </div>
                );
              })()}
              <footer>
                <button className={`btn sm ${inspectEqId === e.id ? 'primary' : 'ghost'}`} onClick={() => setInspectEqId(inspectEqId === e.id ? null : e.id)}>
                  {inspectEqId === e.id ? 'Hide 3D Bay' : '👁 3D Bay Wireframe'}
                </button>
                <button className="btn sm ghost" disabled={disabled} onClick={() => setScenario((s) => ({ ...s, equipment: s.equipment.filter((x) => x.id !== e.id) }))}>Remove profile</button>
              </footer>
            </article>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-h"><b>Planner assumptions</b><span>part of every export; changing any of these recomputes the plans</span></div>
        <div className="settings">
          <label>Minimum base support
            <select disabled={disabled} value={st.minSupportPct} onChange={(e) => setScenario((s) => ({ ...s, settings: { ...s.settings, minSupportPct: Number(e.target.value) } }))}>
              {[100, 90, 80, 70].map((v) => <option key={v} value={v}>{v}% of footprint on surfaces at its base height</option>)}</select></label>
          <label>Search attempts
            <select disabled={disabled} value={st.maxAttempts} onChange={(e) => setScenario((s) => ({ ...s, settings: { ...s.settings, maxAttempts: Number(e.target.value) } }))}>
              {[14, 40, 120, 400].map((v) => <option key={v} value={v}>{v} (deterministic budget)</option>)}</select></label>
          <label>Seed
            <NumInput value={st.seed} label="Seed" width={90} disabled={disabled} onChange={(v) => setScenario((s) => ({ ...s, settings: { ...s.settings, seed: v ?? DEFAULT_SETTINGS.seed } }))} /></label>
        </div>
        <p className="muted small">Same inputs + same seed + same attempts ⇒ same plans. A wall-clock safety cap of {st.maxMs / 1000}s per vehicle also exists; if it ever stops a search it is reported as such and never treated as proof.</p>
      </div>
      <div className="foot-actions"><button className="btn" onClick={() => p.go('cargo')}>← Cargo</button><button className="btn primary" onClick={() => p.go('decision')}>Next: compare options →</button></div>
    </section>
  );
}
