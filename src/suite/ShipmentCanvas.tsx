import { useEffect, useId, useMemo, useState } from 'react';
import type { FlowStage, HandlingUnit, Shipment } from './types';
import { STAGE_LABELS, STAGE_PRODUCTS } from './types';
import { filterEvents, filterUnits, inputAtEvent, modeledWaypoints, RELATIONS, scenarioLocation, spatialModel, stageState } from './shipmentViewModel';
import './canvas.css';

export interface ShipmentCanvasProps {
  shipment: Shipment;
  inspect: (record: string) => void;
  productUrl: (productId: string) => string;
  now?: string;
}
const stages: FlowStage[] = ['asset', 'fit', 'warehouse', 'yard', 'carrier', 'quote', 'hos'];
const number = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
const stamp = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().replace('T', ' ').replace('Z', ' UTC') : `${value} (unrecognized time)`;
const short = (stage: string) => ({ asset: 'Equipment', fit: 'Loading plan', warehouse: 'Receiving space', yard: 'Dock', carrier: 'Carrier policy', quote: 'Accepted terms', hos: 'Duty plan', dispatch: 'Dispatch', movement: 'Movement', receipt: 'Receipt', invoice: 'Invoice' }[stage] ?? stage);

/** A read-only projection of the canonical shipment, with a complete structured path beside each visual. */
export function ShipmentCanvas({ shipment, inspect, productUrl, now = new Date().toISOString() }: ShipmentCanvasProps) {
  const [mode, setMode] = useState<'overview' | 'spatial' | 'timeline'>('overview');
  const [unitQuery, setUnitQuery] = useState('');
  const [eventQuery, setEventQuery] = useState('');
  const [eventType, setEventType] = useState('all');
  const [replayId, setReplayId] = useState<string | null>(null);
  const unique = useId();
  useEffect(() => { setReplayId(null); setUnitQuery(''); setEventQuery(''); setEventType('all'); }, [shipment.id]);
  const model = useMemo(() => spatialModel(shipment), [shipment]);
  const replay = useMemo(() => replayId ? inputAtEvent(shipment, replayId) : null, [shipment, replayId]);
  const units = filterUnits(shipment.input.units, unitQuery);
  const events = filterEvents(shipment.events, eventQuery, eventType);
  const waypoints = modeledWaypoints(shipment.results.hos);
  const stageInspect = (stage: FlowStage) => inspect(`stage:${stage}`);
  const unitInspect = (unit: HandlingUnit) => inspect(`unit:${unit.id}`);
  const totalWeight = shipment.input.units.reduce((sum, unit) => sum + unit.weightLbs, 0);
  const currentStages = stages.filter(stage => stageState(shipment, stage, now) === 'current').length;
  const unresolved = shipment.exceptions.filter(exception => !exception.resolved);
  const nodes = [
    { id: 'asset', x: 20, y: 20 }, { id: 'fit', x: 215, y: 20 }, { id: 'quote', x: 410, y: 20 },
    { id: 'warehouse', x: 20, y: 145 }, { id: 'yard', x: 215, y: 145 }, { id: 'hos', x: 410, y: 145 }, { id: 'carrier', x: 605, y: 145 },
    { id: 'dispatch', x: 215, y: 285 }, { id: 'movement', x: 410, y: 285 }, { id: 'receipt', x: 605, y: 285 }, { id: 'invoice', x: 605, y: 410 },
  ];
  const node = (id: string) => nodes.find(n => n.id === id)!;
  const graphEdges = [
    ['asset', 'fit', 'envelope'], ['fit', 'quote', 'fit basis'], ['warehouse', 'yard', 'receiving'],
    ['dispatch', 'movement', 'depart'], ['movement', 'receipt', 'arrive'], ['receipt', 'invoice', 'evidence'],
  ];
  const UnitTable = ({ values, historical = false }: { values: HandlingUnit[]; historical?: boolean }) => <div className="shipment-canvas-scroll" tabIndex={0} role="region" aria-label={historical ? 'Historical manifest table, horizontally scrollable' : 'Unit geometry and receiving table, horizontally scrollable'}>
    <table><caption>{historical ? 'Exact manifest at selected event. Inspection opens the current identity; original values remain in this table and event payload.' : 'Current identified units, declared geometry and recorded receiving assignments'}</caption><thead><tr><th scope="col">Unit</th><th scope="col">Identity / barcode</th><th scope="col">Declared dimensions / mass</th><th scope="col">Planned position, mm</th><th scope="col">Receiving slot / evidence</th></tr></thead><tbody>{values.map(unit => {
      const placement = !historical ? model.placements.find(p => p.unitId === unit.id) : null;
      const assignments = shipment.results.warehouse?.details.assignments;
      const assignment = !historical && Array.isArray(assignments) ? assignments.find(a => a.unitId === unit.id) : null;
      const receipt = !historical ? shipment.delivery?.units.find(u => u.id === unit.id) : null;
      return <tr key={unit.id}><th scope="row"><button type="button" onClick={() => unitInspect(unit)}>{unit.description}</button></th><td><code>{unit.id}</code><br/><code>{unit.barcode}</code></td><td>{number(unit.lengthIn)} × {number(unit.widthIn)} × {number(unit.heightIn)} in<br/>{number(unit.weightLbs)} lb · {unit.temperatureClass}<br/>{unit.stackable ? 'Stackable' : 'No stacking'}</td><td>{placement ? <>x {number(placement.x)}, y {number(placement.y)}, z {number(placement.z)}<br/>{number(placement.dx)} × {number(placement.dy)} × {number(placement.dz)} mm</> : historical ? 'Historical arrangement not projected' : 'No supported current placement'}</td><td>{historical ? 'Historical receiving state not projected' : receipt ? <>{receipt.slotCode}<br/>Manually entered local receipt</> : assignment ? <>{String(assignment.slotCode)}<br/>Planned assignment · {stageState(shipment, 'warehouse', now)}</> : 'No receiving assignment recorded'}</td></tr>;
    })}</tbody></table>{values.length === 0 && <p>No units match this search.</p>}</div>;

  return <section className="shipment-canvas" aria-labelledby={`${unique}-title`}>
    <header className="shipment-canvas-heading"><div><span className="shipment-canvas-eyebrow">SHIPMENT OPERATIONS</span><h2 id={`${unique}-title`}>One shipment, connected decisions</h2><p>{shipment.input.origin} → {shipment.input.destination} · {shipment.input.units.length} units · {number(totalWeight)} lb · input {shipment.inputRevision}</p></div><button type="button" onClick={() => inspect('shipment')}>Inspect shipment</button></header>
    <div className="shipment-canvas-summary"><span><strong>{shipment.status.replaceAll('_', ' ')}</strong> · local scenario</span><span>{currentStages}/7 current planning decisions</span><span>{unresolved.length} unresolved exceptions</span><span>{shipment.events.length} retained events</span></div>
    <div className="shipment-canvas-toolbar" role="group" aria-label="Shipment view">{(['overview', 'spatial', 'timeline'] as const).map(view => <button type="button" key={view} aria-pressed={mode === view} onClick={() => setMode(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}</div>
    <p className="shipment-canvas-location">{scenarioLocation(shipment)}</p>

    {mode === 'overview' && <div>
      <figure className="shipment-canvas-figure"><div className="shipment-canvas-scroll"><svg viewBox="0 0 800 505" role="img" aria-label="Decision relationship graph. Full dependency descriptions and product actions follow below.">
        <defs><marker id={`${unique}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4a6785"/></marker></defs>
        {graphEdges.map(([from, to, label]) => { const a = node(from), b = node(to), vertical = a.x === b.x; return <g key={`${from}-${to}`}><line x1={a.x + (vertical ? 85 : 170)} y1={a.y + (vertical ? 70 : 35)} x2={b.x + (vertical ? 85 : 0)} y2={b.y + (vertical ? 0 : 35)} stroke="#4a6785" strokeWidth="1.5" markerEnd={`url(#${unique}-arrow)`}/><text x={vertical ? a.x + 92 : (a.x + b.x + 170) / 2} y={vertical ? (a.y + b.y + 70) / 2 : a.y + 25} fontSize="10" textAnchor={vertical ? 'start' : 'middle'}>{label}</text></g>; })}
        <path d="M 105 225 L 105 255 L 690 255 L 690 225 M 300 255 L 300 285" fill="none" stroke="#7b8c9f" strokeDasharray="4 3" markerEnd={`url(#${unique}-arrow)`}/><text x="400" y="248" textAnchor="middle" fontSize="11">All seven current decisions + no open exception required</text>
        {nodes.map(n => <g key={n.id}><rect x={n.x} y={n.y} width="170" height="70" rx="3" fill="#f5f8fc" stroke="#a8b9cb"/><text x={n.x + 12} y={n.y + 27} fontSize="13" fontWeight="650">{short(n.id)}</text><text x={n.x + 12} y={n.y + 48} fontSize="11" fill="#405a76">{stages.includes(n.id as FlowStage) ? stageState(shipment, n.id as FlowStage, now) : n.id === 'invoice' ? shipment.invoice ? 'prepared, not paid' : 'not prepared' : n.id === 'receipt' ? shipment.delivery ? 'manual receipt retained' : 'not recorded' : n.id === 'movement' ? shipment.events.some(e => e.type === 'depart') ? 'scenario events retained' : 'not departed' : shipment.status === 'draft' ? 'not dispatched' : 'dispatch event retained'}</text></g>)}
      </svg></div><figcaption>Edges label the relationship, not elapsed time or geography. Every decisive fact is available in the structured records below.</figcaption></figure>
      <div className="shipment-canvas-stage-grid">{stages.map(stage => <article key={stage} className="shipment-canvas-stage"><div className="shipment-canvas-stage-top"><h3>{STAGE_LABELS[stage]}</h3><span data-state={stageState(shipment, stage, now)}>{stageState(shipment, stage, now)}</span></div><p>{shipment.results[stage]?.summary ?? 'No saved decision. Open the owning product to review and publish.'}</p><p className="shipment-canvas-meta">{shipment.results[stage] ? `Input ${shipment.results[stage]!.inputRevision} · ${stamp(shipment.results[stage]!.recordedAt)}` : 'No observation timestamp'}</p><div className="shipment-canvas-actions"><button type="button" onClick={() => stageInspect(stage)}>Inspect {short(stage).toLowerCase()}</button><a href={productUrl(STAGE_PRODUCTS[stage])}>Open {short(stage).toLowerCase()} task</a></div></article>)}</div>
      <details><summary>All dependency relationships</summary><ul>{RELATIONS.map((edge, i) => <li key={i}>{short(edge.from)} → {short(edge.to)}: {edge.label}</li>)}</ul></details>
      <div className="shipment-canvas-execution"><article><h3>Movement</h3><p>{scenarioLocation(shipment)}</p><a href={productUrl('product-05-fleet-telematics')}>Open movement task</a></article><article><h3>Receiving</h3><p>{shipment.delivery ? `${shipment.delivery.units.length} units received by ${shipment.delivery.receiver} at ${stamp(shipment.delivery.receivedAt)}. Manually entered scenario receipt.` : 'No receipt recorded.'}</p><a href={productUrl('product-06-warehouse-space-flow')}>Open receiving task</a></article><article><h3>Invoice</h3><p>{shipment.invoice ? `USD ${(shipment.invoice.totalCents / 100).toFixed(2)} prepared at ${stamp(shipment.invoice.preparedAt)}. ${shipment.invoice.evidenceEventIds.length} linked evidence events. No payment recorded.` : 'No invoice prepared.'}</p><button type="button" onClick={() => inspect('shipment')}>Inspect finance evidence</button></article></div>
      {shipment.exceptions.length > 0 && <details><summary>Shipment exceptions ({unresolved.length} unresolved)</summary><ul>{shipment.exceptions.map(exception => <li key={exception.id}><strong>{exception.resolved ? 'Resolved' : 'Open'}:</strong> {exception.message}{exception.resolution && <p>Resolution: {exception.resolution}</p>}</li>)}</ul></details>}
    </div>}

    {mode === 'spatial' && <div>
      <figure className="shipment-canvas-figure"><h3>Accepted loading arrangement</h3><p>{model.reason}</p>{model.available && model.envelope && <><div className="shipment-canvas-scroll" role="region" aria-label="Scaled loading plan, horizontally scrollable" tabIndex={0}><svg className="shipment-canvas-load" viewBox={`-500 -500 ${model.envelope.length + 1000} ${model.envelope.width + 1000}`} role="img" aria-label="Top view of recorded equipment and handling-unit placements. Coordinates and dimensions are listed in the unit table below."><rect x="0" y="0" width={model.envelope.length} height={model.envelope.width} fill="#f4f7fb" stroke="#526b86" strokeWidth="30"/>{model.placements.map(p => <g key={p.unitId}><rect x={p.x} y={p.y} width={p.dx} height={p.dy} fill="#d9e8fb" stroke="#195da8" strokeWidth="22"/><text x={p.x + Math.min(80, p.dx / 8)} y={p.y + p.dy / 2} fontSize={Math.min(190, p.dx / 3, p.dy / 3)} fill="#183d68">HU {p.ordinal}</text></g>)}<text x={model.envelope.length / 2} y="-170" textAnchor="middle" fontSize="210">{number(model.envelope.length)} mm interior length</text></svg></div><figcaption>{number(model.envelope.length)} × {number(model.envelope.width)} × {number(model.envelope.height)} mm envelope. Top view omits height; z and box height remain in the table. HU numbers follow manifest order. Recorded {stamp(model.recordedAt!)}.</figcaption></>}{!model.available && <button type="button" onClick={() => stageInspect('fit')}>Inspect retained loading result</button>}</figure>
      <p className="shipment-canvas-notice">Receiving locations are categorical identifiers. Measured rack, yard, door geometry and current GPS coordinates are not retained; no physical route, clearance or live freight position is drawn.</p>
      <label className="shipment-canvas-search">Find unit by description, original ID or barcode<input value={unitQuery} onChange={event => setUnitQuery(event.target.value)} type="search"/></label><p role="status">{units.length} matching units</p><UnitTable values={units}/>
    </div>}

    {mode === 'timeline' && <div>
      <div className="shipment-canvas-event-controls"><label>Find retained event<input type="search" value={eventQuery} onChange={event => setEventQuery(event.target.value)} placeholder="Type, payload, barcode or source"/></label><label>Event type<select value={eventType} onChange={event => setEventType(event.target.value)}><option value="all">All event types</option>{Array.from(new Set(shipment.events.map(event => event.type))).map(type => <option key={type}>{type}</option>)}</select></label></div>
      <p className="shipment-canvas-meta">Recorded order, actual event timestamps in UTC. Vertical spacing is ordinal and does not encode elapsed time. {events.length} matching events.</p>
      {replay && <section className="shipment-canvas-replay" aria-label="Historical manifest replay"><div className="shipment-canvas-stage-top"><h3>Manifest at input {replay.inputRevision}</h3><button type="button" onClick={() => setReplayId(null)}>Close replay</button></div><p>{replay.reason}</p><p className="shipment-canvas-meta">{replay.event ? `${replay.event.type} · ${stamp(replay.event.at)}` : 'Unknown event'}. Replay covers manifest inputs only. Today’s stage decisions, receipt and invoice are not projected backwards.</p>{replay.input ? <><p>{replay.input.origin} → {replay.input.destination} · {replay.input.equipmentId} · carrier DOT {replay.input.carrierDot} · {replay.input.loadedMiles} loaded mi + {replay.input.deadheadMiles} deadhead mi</p><UnitTable values={replay.input.units} historical/><details><summary>Exact reconstructed input and source events</summary><pre>{JSON.stringify({ input: replay.input, sourceEventIds: replay.sourceEventIds }, null, 2)}</pre></details></> : <p>No historical values are inferred. Inspect the original event payload.</p>}</section>}
      <ol className="shipment-canvas-timeline">{events.map(event => <li key={event.id}><time dateTime={event.at}>{stamp(event.at)}</time><div><h3>{event.type} · input {event.inputRevision}</h3><p>{event.note}</p><p className="shipment-canvas-meta">{event.productId}</p></div><div className="shipment-canvas-actions"><button type="button" onClick={() => inspect(`event:${event.id}`)}>Inspect event payload</button><button type="button" aria-pressed={replayId === event.id} onClick={() => setReplayId(event.id)}>Replay manifest here</button></div></li>)}</ol>{events.length === 0 && <p>No retained events match this filter.</p>}
      <section className="shipment-canvas-modeled"><h3>Separately recorded duty model</h3><p className="shipment-canvas-notice">Relative modeled offsets, not observed departure or arrival times and not an ETA. Duty result is {stageState(shipment, 'hos', now)}. Full-rest local scenario only.</p>{waypoints.length ? <div className="shipment-canvas-scroll" tabIndex={0} role="region" aria-label="Modeled duty waypoints, horizontally scrollable"><table><caption>Retained duty-plan waypoint values</caption><thead><tr><th scope="col">Waypoint</th><th scope="col">Modeled duration</th><th scope="col">Cumulative offset</th><th scope="col">Duty / location</th></tr></thead><tbody>{waypoints.map(waypoint => <tr key={waypoint.id}><th scope="row">{waypoint.title}</th><td>{waypoint.durationMinutes} min</td><td>+{waypoint.cumulativeTimeMinutes} min</td><td>{waypoint.dutyStatus}<br/>{waypoint.location}</td></tr>)}</tbody></table></div> : <p>No complete supported modeled waypoint record is retained.</p>}<button type="button" onClick={() => stageInspect('hos')}>Inspect duty assumptions and source</button></section>
    </div>}
    <footer>Read-only projection of shipment {shipment.id}, record {shipment.revision}. Native products own edits and publication. All evidence remains local scenario data; no physical, provider or production verification is inferred.</footer>
  </section>;
}
