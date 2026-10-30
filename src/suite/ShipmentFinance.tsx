import type { Shipment } from './types';

/** Finance is a reconciliation over accepted evidence, never a second quote. */
export function ShipmentFinance({ shipment, busy, inspect, prepare }: {
  shipment: Shipment; busy: boolean; inspect: (record: string) => void; prepare: () => void;
}) {
  const quote = shipment.results.quote;
  const lines = Array.isArray(quote?.details.lines) ? quote.details.lines as { label: string; cents: number }[] : [];
  const total = Number(quote?.details.totalCents);
  const exceptions = shipment.exceptions.filter(e => !e.resolved);
  const blocked = !shipment.delivery || exceptions.length > 0 || !quote?.ok || quote.inputRevision !== shipment.inputRevision;
  function exportEvidence() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(shipment, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${shipment.id}-invoice-evidence.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="shipment-finance" aria-label="Invoice evidence reconciliation">
    <h3>{shipment.invoice ? 'Invoice ready for export' : 'Receipt and invoice readiness'}</h3>
    <p>{shipment.invoice ? `USD ${(shipment.invoice.totalCents / 100).toFixed(2)} reconciled to accepted scenario quote and receipt. No invoice sent or payment issued.` : blocked ? `Waiting for ${[!shipment.delivery && 'a complete manual scenario receipt', exceptions.length > 0 && `${exceptions.length} unresolved exception(s)`, (!quote?.ok || quote.inputRevision !== shipment.inputRevision) && 'current accepted terms'].filter(Boolean).join(', ')}.` : 'Receipt and accepted terms are retained, with no open exception. Review the evidence before preparing the draft.'}</p>
    <div className="shipment-actions"><button onClick={() => inspect('stage:quote')}>Inspect accepted terms</button><button onClick={() => inspect('delivery')}>Inspect receipt evidence</button>{shipment.invoice && <button onClick={() => inspect('invoice')}>Inspect invoice record</button>}</div>
    <details><summary>Reconcile terms, units and source events</summary>
      <div className="shipment-table-wrap" role="region" aria-label="Accepted quote terms, horizontally scrollable" tabIndex={0}><table><thead><tr><th scope="col">Accepted term</th><th scope="col">USD</th></tr></thead><tbody>{lines.map((line, index) => <tr key={index}><td>{line.label}</td><td>{(line.cents / 100).toFixed(2)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Accepted total</th><td>{Number.isSafeInteger(total) ? (total / 100).toFixed(2) : 'Not recorded'}</td></tr></tfoot></table></div>
      <p>{shipment.delivery ? `Manually entered by ${shipment.delivery.receiver} at ${shipment.delivery.receivedAt}.` : 'No receiving evidence is recorded.'}</p>
      <div className="shipment-table-wrap" role="region" aria-label="Receipt identity reconciliation, horizontally scrollable" tabIndex={0}><table><thead><tr><th>Handling unit</th><th>Original barcode</th><th>Recorded location</th><th>Identity match</th></tr></thead><tbody>{shipment.input.units.map(unit => {
        const receipt = shipment.delivery?.units.find(r => r.id === unit.id);
        return <tr key={unit.id}><th><button onClick={() => inspect(`unit:${unit.id}`)}>{unit.description}</button></th><td>{unit.barcode}</td><td>{receipt?.slotCode ?? 'Not recorded'}</td><td>{receipt ? receipt.barcode === unit.barcode ? 'Matches original identity' : 'Mismatch: inspect receipt' : 'Not received'}</td></tr>;
      })}</tbody></table></div>
      <p>Invoice evidence links the exact retained events before preparation. Missing older payloads remain unknown.</p>
      <ol>{(shipment.invoice?.evidenceEventIds ?? shipment.events.map(e => e.id)).map(id => {
        const event = shipment.events.find(e => e.id === id);
        return <li key={id}>{event ? <button onClick={() => inspect(`event:${id}`)}>{event.type} · {event.at}</button> : <span>Retained event reference unavailable: {id}</span>}</li>;
      })}</ol>
    </details>
    {shipment.status === 'delivered' && <button disabled={busy || blocked} onClick={prepare}>Prepare reconciled invoice</button>}
    {shipment.invoice && <button disabled={busy} onClick={exportEvidence}>Export invoice evidence JSON</button>}
  </section>;
}
