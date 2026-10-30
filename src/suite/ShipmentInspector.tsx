import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { STAGE_LABELS, STAGE_PRODUCTS, type FlowEvent, type FlowStage, type Shipment } from './types';
import './inspector.css';
import { inputAtEvent } from './shipmentViewModel';

type InspectorTab = 'details' | 'checks' | 'history' | 'source';
const TABS: InspectorTab[] = ['details', 'checks', 'history', 'source'];
const stages = Object.keys(STAGE_LABELS) as FlowStage[];
const readTab = (): InspectorTab => {
  const value = new URLSearchParams(window.location.search).get('inspectorTab');
  return TABS.includes(value as InspectorTab) ? value as InspectorTab : 'details';
};
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Retains source keys and values rather than selecting a lossy field allowlist. */
export function StructuredValue({ value }: { value: unknown }) {
  if (value === null) return <span className="shipment-inspector-empty">null</span>;
  if (value === undefined) return <span className="shipment-inspector-empty">Not recorded</span>;
  if (Array.isArray(value)) return value.length ? <ol className="shipment-inspector-values">{value.map((entry, index) => <li key={index}>{object(entry) || Array.isArray(entry) ? <details><summary>Record {index + 1}{object(entry) && typeof entry.id === 'string' ? ` · ${entry.id}` : ''}</summary><StructuredValue value={entry} /></details> : <StructuredValue value={entry} />}</li>)}</ol> : <span className="shipment-inspector-empty">Empty list (0 records)</span>;
  if (object(value)) return Object.keys(value).length ? <dl className="shipment-inspector-fields">{Object.entries(value).map(([key, entry]) => <div key={key}><dt>{label(key)}<code>{key}</code></dt><dd>{object(entry) || Array.isArray(entry) ? <details><summary>Inspect {Array.isArray(entry) ? `${entry.length} records` : `${Object.keys(entry).length} fields`}</summary><StructuredValue value={entry} /></details> : <StructuredValue value={entry} />}</dd></div>)}</dl> : <span className="shipment-inspector-empty">Empty object (0 fields)</span>;
  return <span>{typeof value === 'boolean' ? String(value) : String(value)}</span>;
}

function references(value: unknown, identifiers: string[]): boolean {
  if (typeof value === 'string') return identifiers.includes(value);
  if (Array.isArray(value)) return value.some(entry => references(entry, identifiers));
  if (object(value)) return Object.values(value).some(entry => references(entry, identifiers));
  return false;
}

export function ShipmentInspector({ shipment, record, onClose, onSelect }: {
  shipment: Shipment; record: string; onClose: () => void; onSelect: (record: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  const [tab, setTab] = useState<InspectorTab>(readTab);
  const titleId = useId();
  const descriptionId = useId();
  const contentId = useId();
  const recordId = record.slice(record.indexOf(':') + 1);
  const stage = record.startsWith('stage:') && stages.includes(recordId as FlowStage) ? recordId as FlowStage : undefined;
  const unit = record.startsWith('unit:') ? shipment.input.units.find(entry => entry.id === recordId) : undefined;
  const event = record.startsWith('event:') ? shipment.events.find(entry => entry.id === recordId) : undefined;
  const stageRecord = stage ? shipment.results[stage] : undefined;
  const selected = record === 'shipment' ? shipment : record === 'delivery' ? shipment.delivery : record === 'invoice' ? shipment.invoice : unit ?? stageRecord ?? event;
  const heading = record === 'shipment' ? shipment.reference : record === 'delivery' ? 'Manual scenario receipt' : record === 'invoice' ? 'Draft invoice evidence' : unit ? unit.description : stage ? STAGE_LABELS[stage] : event ? event.type : 'Record unavailable';
  const relatedEvents = useMemo(() => shipment.events.filter(entry => {
    if (record === 'shipment') return true;
    if (record === 'delivery') return entry.type === 'deliver' || entry.payload?.stage === 'warehouse';
    if (record === 'invoice') return entry.type === 'invoice' || shipment.invoice?.evidenceEventIds.includes(entry.id);
    if (event) return entry.id === event.id;
    if (stage) return entry.payload?.stage === stage || entry.productId === STAGE_PRODUCTS[stage];
    if (unit) return references(entry.payload, [unit.id, unit.barcode]);
    return false;
  }), [shipment.events, record, event, stage, unit]);
  const raw = useMemo(() => selected === undefined ? undefined : JSON.stringify(selected, null, 2), [selected]);
  const manifestReplay = shipment.events.length ? inputAtEvent(shipment, shipment.events[shipment.events.length - 1].id) : null;
  const manifestEvents = manifestReplay?.input ? shipment.events.filter(entry => manifestReplay.sourceEventIds.includes(entry.id)) : [];
  const manifestEvent = manifestEvents[manifestEvents.length - 1];
  const evidenceEvent = event ?? [...shipment.events].reverse().find(entry => record === 'delivery' ? entry.type === 'deliver' : record === 'invoice' ? entry.type === 'invoice' : false);
  const unitContext = unit ? {
    loadingDecision: shipment.results.fit,
    receivingDecision: shipment.results.warehouse,
    receipt: shipment.delivery?.units.filter(entry => entry.id === unit.id),
  } : undefined;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    title.current?.focus();
    return () => {
      if (node?.open) node.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    setTab(readTab());
    title.current?.focus();
    const sync = () => setTab(readTab());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [record]);
  function changeTab(next: InspectorTab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('inspectorTab', next);
    window.history.replaceState(window.history.state, '', url);
  }
  function select(next: string) {
    changeTab('details');
    onSelect(next);
  }
  const eventLink = (entry: FlowEvent) => <button type="button" onClick={() => select(`event:${entry.id}`)}>Inspect exact event</button>;

  return <dialog ref={dialog} className="shipment-inspector" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={e => { e.preventDefault(); latestClose.current(); }}>
    <div className="shipment-inspector-shell">
      <header className="shipment-inspector-header">
        <div><p className="shipment-inspector-eyebrow">Shipment record inspector</p><h2 id={titleId} ref={title} tabIndex={-1}>{heading}</h2><code className="shipment-inspector-record-key">{record}</code></div>
        <button type="button" className="shipment-inspector-close" aria-label="Close shipment record inspector" onClick={onClose}>Close</button>
      </header>
      <p id={descriptionId} className="shipment-inspector-limit">Local scenario evidence. Recorded calculations and manual entries do not establish live carrier, device, physical loading or receipt verification.</p>
      <nav className="shipment-inspector-tabs" aria-label="Record sections">{TABS.map(key => <button key={key} type="button" aria-pressed={tab === key} aria-controls={contentId} onClick={() => changeTab(key)}>{label(key)}{key === 'history' ? ` (${relatedEvents.length})` : ''}</button>)}</nav>
      <section id={contentId} className="shipment-inspector-content" aria-label={`${label(tab)} for ${heading}`}>
        {selected === undefined && <div className="shipment-inspector-notice" role="status"><strong>{stage ? 'No decision recorded for this stage.' : 'This exact record was not found in the current shipment.'}</strong><p>Requested key: <code>{record}</code>. No other record has been substituted. Inspect the shipment or choose an existing record below.</p></div>}
        {tab === 'details' && <>
          {record === 'shipment' ? <><StructuredValue value={{ id: shipment.id, reference: shipment.reference, mode: shipment.mode, status: shipment.status, revision: shipment.revision, inputRevision: shipment.inputRevision, input: shipment.input, exceptions: shipment.exceptions, delivery: shipment.delivery, invoice: shipment.invoice }} /><h3>Planning records</h3><div className="shipment-inspector-related">{stages.map(key => <button key={key} type="button" onClick={() => select(`stage:${key}`)}>{STAGE_LABELS[key]} · {!shipment.results[key] ? 'Missing' : shipment.results[key]!.inputRevision !== shipment.inputRevision ? 'Stale' : shipment.results[key]!.ok ? 'Recorded' : 'Rejected'}</button>)}</div></> : selected !== undefined && <StructuredValue value={selected} />}
          {unit && <><h3>Related shipment decisions</h3><p>These complete stage details retain all units for context. Locate original identifier <code>{unit.id}</code> when inspecting placements or assignments.</p><StructuredValue value={unitContext} /></>}
        </>}
        {tab === 'checks' && <>
          <h3>Recorded decision freshness</h3>
          <p>Current input revision: <strong>{shipment.inputRevision}</strong>. A recorded decision is current only when it references this revision. These statuses describe the saved scenario.</p>
          <div className="shipment-inspector-table-wrap"><table><thead><tr><th>Decision</th><th>Status</th><th>Input revision</th><th>Summary</th></tr></thead><tbody>{(stage ? [stage] : stages).map(key => {
            const result = shipment.results[key];
            return <tr key={key}><th><button type="button" onClick={() => select(`stage:${key}`)}>{STAGE_LABELS[key]}</button></th><td>{!result ? 'Missing' : result.inputRevision !== shipment.inputRevision ? 'Stale' : result.ok ? 'Recorded pass' : 'Rejected'}</td><td>{result?.inputRevision ?? 'Not recorded'}</td><td>{result?.summary ?? 'No saved evaluation.'}</td></tr>;
          })}</tbody></table></div>
          {unit && <><h3>Unit identity and evidence</h3><StructuredValue value={{ id: unit.id, barcode: unit.barcode, barcodePresent: Boolean(unit.barcode) }} /><p>A barcode in the manifest is an identifier. Physical scanning is not established by that field. Only the separately recorded receipt describes a manually entered scenario scan.</p></>}
          <h3>Exceptions</h3>{shipment.exceptions.length ? <StructuredValue value={shipment.exceptions} /> : <p>No exceptions recorded. This does not establish that every real-world issue has been detected.</p>}
          {stageRecord && <><h3>Complete recorded checks and assumptions</h3><StructuredValue value={stageRecord.details} /></>}
          <p>Carrier expiry, source dates and other product-specific constraints remain in their complete recorded details and must be reviewed with the owning product. This inspector does not independently certify those constraints.</p>
        </>}
        {tab === 'history' && <>
          <p>{record === 'shipment' ? 'All saved shipment events, newest first.' : unit ? 'Events whose exact payload contains this original unit ID or barcode. This is a reference lookup, not a complete independent unit audit trail.' : stage ? 'Events naming this stage or its owning product. Product-level events may contain related context.' : event ? 'This exact saved event.' : 'No matching history for the requested key.'}</p>
          {relatedEvents.length ? <ol className="shipment-inspector-events">{[...relatedEvents].reverse().map(entry => <li key={entry.id}><h3>{entry.type}</h3><p>{entry.note}</p><dl><dt>Event ID</dt><dd><code>{entry.id}</code></dd><dt>Source product</dt><dd>{entry.productId}</dd><dt>Recorded at</dt><dd><time dateTime={entry.at}>{entry.at}</time></dd><dt>Input revision</dt><dd>{entry.inputRevision}</dd></dl>{eventLink(entry)}<details><summary>Exact event payload</summary>{entry.payload === undefined ? <p>No payload recorded.</p> : <><StructuredValue value={entry.payload} /><pre tabIndex={0} aria-label={`Exact JSON payload for event ${entry.id}`}>{JSON.stringify(entry.payload, null, 2)}</pre></>}</details></li>)}</ol> : <p>No matching events recorded.</p>}
        </>}
        {tab === 'source' && <>
          <h3>Source and revision</h3><StructuredValue value={{ shipmentId: shipment.id, shipmentRecordRevision: shipment.revision, currentInputRevision: shipment.inputRevision, selectedRecordKey: record, sourceProductId: stageRecord?.productId ?? evidenceEvent?.productId ?? (unit || record === 'shipment' ? manifestEvent?.productId : undefined), recordedAt: stageRecord?.recordedAt ?? evidenceEvent?.at ?? (unit || record === 'shipment' ? manifestEvent?.at : undefined), sourceInputRevision: stageRecord?.inputRevision ?? evidenceEvent?.inputRevision ?? (unit || record === 'shipment' ? shipment.inputRevision : undefined), manifestEventId: unit || record === 'shipment' ? manifestEvent?.id : undefined, manifestSourceEventIds: unit || record === 'shipment' ? manifestReplay?.sourceEventIds : undefined, manifestReconstruction: unit || record === 'shipment' ? manifestReplay?.reason : undefined }} />
          <p>Values come directly from the selected live local-service shipment snapshot. Earlier event payloads retain their original values; current manifest fields may differ after amendment. Additional source or reuse metadata is retained in the complete selected record below.</p>
          {raw !== undefined && <details className="shipment-inspector-raw"><summary>Complete selected record JSON</summary><pre tabIndex={0} aria-label="Complete selected record JSON">{raw}</pre></details>}
        </>}
        <aside className="shipment-inspector-links" aria-label="Related records"><h3>Related records</h3><div className="shipment-inspector-related">{record !== 'shipment' && <button type="button" onClick={() => select('shipment')}>Shipment {shipment.reference}</button>}{(unit || event || stage) && stages.filter(key => key !== stage).map(key => <button key={key} type="button" onClick={() => select(`stage:${key}`)}>{STAGE_LABELS[key]}</button>)}</div>{(!unit && !event) && <details><summary>Handling units ({shipment.input.units.length})</summary><div className="shipment-inspector-related">{shipment.input.units.map(entry => <button key={entry.id} type="button" onClick={() => select(`unit:${entry.id}`)}>{entry.description}<small>{entry.id} · {entry.barcode}</small></button>)}</div></details>}</aside>
      </section>
    </div>
  </dialog>;
}
