import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { shipmentAdapter } from '../engine/shipmentAdapter';
import products from './productRegistry.json';
import { STAGE_LABELS, STAGE_PRODUCTS, type FlowResources, type FlowStage, type ReceiptInput, type Shipment } from './types';
import './shipment.css';
import { ShipmentSessionContext, mergeShipmentSnapshot } from './ShipmentSession';
import { ShipmentInspector } from './ShipmentInspector';
import { ShipmentCanvas } from './ShipmentCanvas';
import { ShipmentFinance } from './ShipmentFinance';
import { stageState } from './shipmentViewModel';

const API = 'http://127.0.0.1:5171';
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
interface Command { type: string; operationId: string; expectedRevision: number; productId: string; payload: Record<string, unknown> }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Shipment request failed (${response.status})`);
  return data as T;
}

export function ShipmentWorkspace({ productId, children }: { productId: string; children?: ReactNode }) {
  const [shipmentId, setShipmentId] = useState(() => new URLSearchParams(window.location.search).get('shipment') ?? '');
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [expanded, setExpanded] = useState(productId === 'command-center-portal');
  const [online, setOnline] = useState(false);
  const [record, setRecord] = useState(() => new URLSearchParams(window.location.search).get('record') ?? '');
  const [list, setList] = useState<{ id: string; reference: string; status: string }[]>([]);
  const [reference, setReference] = useState('Regional distribution scenario');
  const [message, setMessage] = useState('');
  const [connection, setConnection] = useState('Standalone tools available below');
  const [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const [receiver, setReceiver] = useState('');
  const [scans, setScans] = useState<Record<string, { barcode: string; slotCode: string }>>({});
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [weight, setWeight] = useState('');
  const [routeDraft, setRouteDraft] = useState<Partial<Pick<Shipment['input'], 'origin' | 'destination' | 'loadedMiles' | 'deadheadMiles'>>>({});
  const [resources, setResources] = useState<FlowResources | null>(null);
  const creationAttempt = useRef({ reference: '', operationId: '' });
  const operationInFlight = useRef(false);
  const portal = productId === 'command-center-portal';
  const selectedRef = useRef(shipmentId); selectedRef.current = shipmentId;
  useEffect(() => {
    const sync = () => { setRecord(new URLSearchParams(window.location.search).get('record') ?? ''); };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function inspect(key: string) {
    const url = new URL(window.location.href);
    if (key) url.searchParams.set('record', key); else { url.searchParams.delete('record'); url.searchParams.delete('inspectorTab'); }
    window.history.pushState(null, '', url); setRecord(key);
  }
  function productUrl(id: string) {
    const product = products.find(p => p.id === id);
    if (!product) return '#';
    const url = new URL(product.routes.dev); url.hostname = window.location.hostname;
    if (shipmentId) url.searchParams.set('shipment', shipmentId);
    if (id === 'product-01-cargo-fit') url.hash = '/app/cargo';
    return url.toString();
  }
  useEffect(() => {
    if (shipment) window.dispatchEvent(new CustomEvent('trucking:shipment-context', { detail: shipment }));
  }, [shipment]);
  const stage = shipmentAdapter.stage;
  const preview = useMemo(() => {
    if (!shipment || !resources || !shipmentAdapter.evaluate || children) return null;
    try { return shipmentAdapter.evaluate(shipment, resources); }
    catch (error) { return { ok: false, summary: error instanceof Error ? error.message : 'Evaluation unavailable', details: {} }; }
  }, [shipment, resources, children]);

  const select = (id: string) => {
    setShipmentId(id); setShipment(null); setResources(null); setPending(null); setMessage(''); setScans({}); setRecord(''); setOnline(false); setWeight(''); setRouteDraft({});
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('shipment', id); else url.searchParams.delete('shipment');
    url.searchParams.delete('record'); url.searchParams.delete('inspectorTab');
    window.history.replaceState(null, '', url);
  };
  const refresh = useCallback(async () => {
    if (!shipmentId || !isLocal) return;
    const next = await request<Shipment>(`/shipments/${shipmentId}`);
    if (selectedRef.current === shipmentId) { setShipment(previous=>mergeShipmentSnapshot(previous,next,selectedRef.current)); setOnline(true); setConnection('Connected to local scenario service'); }
  }, [shipmentId]);
  useEffect(() => {
    if ((!expanded && !shipmentId) || !isLocal) return;
    let active = true;
    const poll = async () => {
      if (active) setClock(Date.now());
      try {
        if (shipmentId) {
          const [next, usage] = await Promise.all([request<Shipment>(`/shipments/${shipmentId}`), request<FlowResources>(`/resources?exclude=${shipmentId}`)]);
          if (active) { setShipment(prev => mergeShipmentSnapshot(prev,next,selectedRef.current)); setResources(prev => JSON.stringify(prev) === JSON.stringify(usage) ? prev : usage); setOnline(true); setConnection('Connected to local scenario service'); }
        } else {
          const next = await request<typeof list>('/shipments');
          if (active) { setList(next); setOnline(true); setConnection('Local scenario service available'); }
        }
      } catch { if (active) { setOnline(false); setConnection('Local service unavailable. Standalone tools remain available below.'); } }
    };
    void poll(); const timer = window.setInterval(poll, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [expanded, shipmentId]);

  async function run(command: Command) {
    if (operationInFlight.current) return null;
    operationInFlight.current = true;
    setBusy(true); setMessage(''); setPending(command);
    try {
      const next = await request<Shipment>(`/shipments/${shipmentId}/commands`, command);
      if (selectedRef.current === shipmentId) { setShipment(previous=>mergeShipmentSnapshot(previous,next,selectedRef.current)); setPending(null); setMessage('Saved to the shared shipment history.'); }
      return selectedRef.current === shipmentId ? next : null;
    } catch (error) {
      if (selectedRef.current !== shipmentId) return null;
      setMessage(error instanceof Error ? error.message : 'Operation failed.');
      await refresh().catch(() => {});
      return null;
    } finally { operationInFlight.current = false; setBusy(false); }
  }
  function act(type: string, payload: Record<string, unknown> = {}) {
    if (!shipment || busy || pending) return;
    void run({ type, payload, operationId: crypto.randomUUID(), expectedRevision: shipment.revision, productId });
  }
  async function submit(type: string, payload: Record<string, unknown>, expectedRevision = shipment?.revision) {
    if (!shipment || expectedRevision === undefined || busy || pending || !online) return null;
    return run({ type, payload, operationId: crypto.randomUUID(), expectedRevision, productId });
  }
  const blockers = shipment ? (Object.keys(STAGE_LABELS) as FlowStage[]).filter(key => {
    return stageState(shipment, key, new Date(clock).toISOString()) !== 'current';
  }).map(key => STAGE_LABELS[key]) : [];
  if (shipment?.exceptions.some(e => !e.resolved)) blockers.push('Open exception');
  const assignments = (shipment?.results.warehouse?.details.assignments ?? []) as { unitId: string; slotCode: string; barcode: string }[];
  const disabled = busy || Boolean(pending) || !online;

  return <ShipmentSessionContext.Provider value={{ shipment, selectedId: shipmentId, online, busy: disabled, resources, submit, inspect, productUrl }}><section className="shipment-workspace" aria-label="Connected shipment workspace">
    {shipment && <header className="shipment-strip">
      <div><small>LOCAL SCENARIO · {online ? 'Connected' : 'Offline snapshot'} · Input {shipment.inputRevision}</small><strong>{shipment.reference}</strong><span>{shipment.input.origin} → {shipment.input.destination} · {shipment.input.units.length} units · {shipment.input.units.reduce((sum,u)=>sum+u.weightLbs,0).toLocaleString()} lb</span></div>
      <div className="shipment-strip-actions"><button onClick={()=>inspect('shipment')}>Shipment details</button><button onClick={()=>select('')}>Use standalone tools</button></div>
      <nav aria-label="Connected shipment tasks">{['command-center-portal','product-04-asset-studio','product-01-cargo-fit','product-02-freight-pricing'].map(id=><a key={id} aria-current={id===productId?'page':undefined} href={productUrl(id)}>{products.find(p=>p.id===id)?.shortName}</a>)}</nav>
      <p className="shipment-strip-limit">Scenario evidence only. {online ? 'Shared saves are explicit; product drafts stay local until published.' : 'Service unavailable. Saved state may be stale; native tools remain available.'}</p>
    </header>}
    <details open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
      <summary>{shipment ? 'Planning status and shipment actions' : 'Connected shipment workspace'} <span>{shipment ? `${shipment.status.replaceAll('_', ' ')} · ${shipment.status === 'draft' ? `${blockers.length} dispatch blockers` : 'planning locked'}` : 'optional'}</span></summary>
      <div className="shipment-body">
        {!shipment && <p className="shipment-mode">LOCAL SCENARIO · {connection}. Carrier, duty, motion and receipt evidence here are explicitly simulated or manually entered. These actions do not book freight or issue payments.</p>}
        {!isLocal ? <p>Shared local scenarios are available on the loopback previews. This product remains usable independently below.</p> : <>
          {!shipmentId && <div className="shipment-actions">
            <label>Existing shipment <select aria-label="Choose shipment" value="" onChange={e => select(e.target.value)}><option value="">Choose a saved scenario</option>{list.map(s => <option key={s.id} value={s.id}>{s.reference} · {s.status}</option>)}</select></label>
            {portal && <><label>Scenario reference <input aria-label="Scenario reference" value={reference} onChange={e => setReference(e.target.value)} /></label><button disabled={busy} onClick={async () => {
              setBusy(true);
              if (creationAttempt.current.reference !== reference) creationAttempt.current = { reference, operationId: crypto.randomUUID() };
              try { const next = await request<Shipment>('/shipments', creationAttempt.current); select(next.id); setShipment(next); creationAttempt.current = { reference: '', operationId: '' }; }
              catch (error) { setMessage(error instanceof Error ? error.message : 'Creation failed.'); }
              finally { setBusy(false); }
            }}>Create local shipment</button></>}
          </div>}
          {shipment && <>
            <details className="shipment-extra-context"><summary>All products and shipment context</summary>
            <div className="shipment-actions"><button onClick={() => void refresh().catch(e => setMessage(e.message))}>Refresh shipment</button><button onClick={() => select('')}>Use standalone tools</button></div>
            <p className="shipment-identity"><strong>{shipment.reference}</strong> · Shipment {shipment.id} · Record revision {shipment.revision} · Input revision {shipment.inputRevision}</p>
            <p>{shipment.input.origin} → {shipment.input.destination} · {shipment.input.loadedMiles} loaded mi · {shipment.input.units.reduce((n, u) => n + u.weightLbs, 0).toLocaleString()} lb · {shipment.input.units.length} identified handling units</p>
            <p className="shipment-mode">Open a product to review its native draft. Native task controls publish their exact reviewed decision. Movement and receiving are explicit manual scenario events. Original evidence and amendments remain accessible in history.</p>
            <nav className="shipment-products" aria-label="Shipment products">{products.map(p => {
              const url = new URL(p.routes.dev); url.hostname = window.location.hostname; url.searchParams.set('shipment', shipment.id);
              return <a key={p.id} aria-current={p.id === productId ? 'page' : undefined} href={url.toString()}>{p.code} {p.shortName}</a>;
            })}</nav>
            </details>
            <ul className="shipment-stages">{(Object.keys(STAGE_LABELS) as FlowStage[]).map(key => {
              const result = shipment.results[key]; const state = stageState(shipment, key, new Date(clock).toISOString()); const status = state === 'current' ? 'Recorded' : state === 'missing' ? 'Pending' : state[0].toUpperCase() + state.slice(1);
              return <li key={key} data-stage={key}><button className="shipment-record-link" onClick={()=>inspect(`stage:${key}`)}>{STAGE_LABELS[key]}</button><span>{status}</span>{result && <small className="shipment-stage-summary">{result.summary}</small>}{state !== 'current' && <small>{state === 'expired' ? 'Refresh dated policy evidence before another dispatch.' : state === 'stale' ? 'Inputs changed; review and republish.' : state === 'missing' ? 'Review the native task to record a decision.' : 'Inspect the decision and resolve the stated constraints.'}</small>}<a href={productUrl(STAGE_PRODUCTS[key])}>Open product</a></li>;
            })}</ul>
            <details><summary>Handling units and assigned locations</summary><div className="shipment-table-wrap"><table><thead><tr><th>Handling unit</th><th>Barcode</th><th>Mass</th><th>Receiving slot</th></tr></thead><tbody>{shipment.input.units.map(u => <tr key={u.id}><td><button onClick={()=>inspect(`unit:${u.id}`)}>{u.description}</button><small>{u.id}</small></td><td>{u.barcode}</td><td>{u.weightLbs} lb</td><td>{assignments.find(a => a.unitId === u.id)?.slotCode ?? 'Unassigned'}</td></tr>)}</tbody></table></div></details>
            {stage && preview && !(children && ['fit','quote'].includes(stage)) && <div className="shipment-decision"><strong>{STAGE_LABELS[stage]} evaluation</strong><p>{preview.summary}</p>{stage === 'quote' && Array.isArray(preview.details.lines) && <table><thead><tr><th>Accepted term</th><th>USD</th></tr></thead><tbody>{(preview.details.lines as { label: string; cents: number }[]).map(line => <tr key={line.label}><td>{line.label}</td><td>{(line.cents / 100).toFixed(2)}</td></tr>)}</tbody></table>}<button disabled={disabled || !online || shipment.status !== 'draft'} onClick={() => act('evaluate', { stage, result: preview })}>{stage === 'quote' ? 'Accept scenario quote' : 'Publish shipment evaluation'}</button></div>}
            {portal && <>
              {shipment.status === 'draft' && <><p data-testid="dispatch-blockers">{blockers.length ? `Dispatch prerequisites: ${blockers.join(', ')}` : 'All current planning prerequisites recorded.'}</p>
              <button disabled={disabled || blockers.length > 0} onClick={() => act('dispatch')}>Approve scenario dispatch</button></>}
              {shipment.status === 'draft' && <details><summary>Amend shipment manifest</summary><p>Changing these shared inputs retains earlier decisions as stale. Re-evaluate affected products before dispatch. Cargo Fit owns the identified cargo editor.</p><div className="shipment-route-fields">{(['origin','destination','loadedMiles','deadheadMiles'] as const).map(key=><label key={key}>{({origin:'Origin',destination:'Destination',loadedMiles:'Loaded miles',deadheadMiles:'Deadhead miles'})[key]}<input aria-label={`Shared ${key}`} type={key.endsWith('Miles')?'number':'text'} value={routeDraft[key] ?? shipment.input[key]} onChange={e=>setRouteDraft(prev=>({...prev,[key]:key.endsWith('Miles')?Number(e.target.value):e.target.value}))} /></label>)}</div><label>First unit weight (lb) <input aria-label="First unit weight (lb)" type="number" value={weight} placeholder={String(shipment.input.units[0].weightLbs)} onChange={e => setWeight(e.target.value)} /></label><button disabled={disabled || (!weight && !Object.keys(routeDraft).length)} onClick={async () => { const next=await submit('amend', { input: { ...shipment.input, ...routeDraft, units: shipment.input.units.map((u, i) => i === 0 && weight ? { ...u, weightLbs: Number(weight) } : u) } }); if(next){setRouteDraft({});setWeight('');} }}>Save manifest amendment</button></details>}
              <ShipmentFinance shipment={shipment} busy={disabled} inspect={inspect} prepare={() => act('invoice', { totalCents: shipment.results.quote?.details.totalCents })} />
            </>}
            {!children && productId === 'product-05-fleet-telematics' && <div className="shipment-actions"><button disabled={disabled || shipment.status !== 'dispatched'} onClick={() => act('depart', { tractorId: shipment.input.tractorId })}>Record scenario departure</button><button disabled={disabled || shipment.status !== 'in_transit'} onClick={() => act('arrive', { tractorId: shipment.input.tractorId })}>Record scenario arrival</button><button disabled={disabled || shipment.status === 'invoice_ready'} onClick={() => act('exception.open', { message: 'Scenario receiving delay requires review.' })}>Record scenario delay exception</button></div>}
            {!children && productId === 'product-06-warehouse-space-flow' && shipment.status === 'arrived' && <form onSubmit={e => {
              e.preventDefault(); const receipt: ReceiptInput = { receiver, units: shipment.input.units.map(u => ({ id: u.id, barcode: scans[u.id]?.barcode ?? '', slotCode: scans[u.id]?.slotCode ?? '' })) };
              try { shipmentAdapter.verifyReceipt?.(shipment, receipt); act('deliver', receipt as unknown as Record<string, unknown>); }
              catch (error) { setMessage(error instanceof Error ? error.message : 'Receipt validation failed.'); }
            }}><h3>Confirm scenario receiving</h3><p>Enter each barcode and reserved location independently. This is manual scenario evidence.</p><label>Receiver name <input required aria-label="Receiver name" value={receiver} onChange={e => setReceiver(e.target.value)} /></label>{shipment.input.units.map(u => <fieldset key={u.id}><legend>{u.description}</legend><label>Barcode <input required aria-label={`Barcode ${u.id}`} value={scans[u.id]?.barcode ?? ''} onChange={e => setScans(prev => ({ ...prev, [u.id]: { slotCode: prev[u.id]?.slotCode ?? '', barcode: e.target.value } }))} /></label><label>Location <input required aria-label={`Location ${u.id}`} value={scans[u.id]?.slotCode ?? ''} onChange={e => setScans(prev => ({ ...prev, [u.id]: { barcode: prev[u.id]?.barcode ?? '', slotCode: e.target.value } }))} /></label></fieldset>)}<button disabled={disabled} type="submit">Confirm received handling units</button></form>}
            {shipment.exceptions.length > 0 && <div className="shipment-exceptions"><h3>Shipment exceptions</h3>{shipment.exceptions.map(ex => <p key={ex.id}>{ex.message} · {ex.resolved ? `Resolved: ${ex.resolution}` : 'Open'}{portal && !ex.resolved && <><input aria-label="Exception resolution" value={resolutions[ex.id] ?? ''} onChange={e => setResolutions(prev => ({ ...prev, [ex.id]: e.target.value }))} placeholder="Describe the recovery decision" /><button disabled={disabled || !(resolutions[ex.id] ?? '').trim()} onClick={() => act('exception.resolve', { id: ex.id, resolution: resolutions[ex.id] })}>Resolve exception</button></>}</p>)}</div>}
            <details><summary>Shipment history ({shipment.events.length} events)</summary><ol className="shipment-history">{[...shipment.events].reverse().map(e => <li key={e.id}><button onClick={()=>inspect(`event:${e.id}`)}>{e.type}</button> · {e.productId} · {e.at}<p>{e.note}</p></li>)}</ol></details>
          </>}
        </>}
      </div>
    </details>
    {shipmentId && !shipment && <p role="status" className="shipment-message">{connection}. Selected shipment: {shipmentId}. Native tools remain available while the record loads or the service recovers.</p>}
    {message && <p role="status" className="shipment-message">{message}</p>}
    {pending && !busy && <div className="shipment-actions"><button onClick={() => void run(pending)}>Retry same operation</button><button onClick={() => { setPending(null); setMessage('Pending attempt dismissed. Review refreshed state before a new action.'); }}>Dismiss pending attempt</button></div>}
  </section>
  {portal && shipment && <details className="shipment-world"><summary>Shipment overview, spatial plan and timeline</summary><ShipmentCanvas shipment={shipment} inspect={inspect} productUrl={productUrl} now={new Date(clock).toISOString()} /></details>}
  {children && <div className="shipment-native">{portal && shipmentId ? <details className="shipment-preset"><summary>Independent preset lifecycle simulator</summary><p>This sample tour has its own saved order. It does not update the selected connected shipment.</p>{children}</details> : children}</div>}
  {shipment && record && <ShipmentInspector shipment={shipment} record={record} onClose={()=>inspect('')} onSelect={inspect} />}
  </ShipmentSessionContext.Provider>;
}
