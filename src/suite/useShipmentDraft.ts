import { useEffect, useRef, useState } from 'react';
import { useShipmentSession } from './ShipmentSession';
import type { Shipment } from './types';

/** Native values stay product-owned; this hook coordinates reviewed provenance. */
export function useShipmentDraft<T>({ value, importValue, applyValue }: {
  value: T; importValue: (shipment: Shipment) => T; applyValue: (value: T) => void;
}) {
  const session = useShipmentSession();
  const latestSession = useRef(session); latestSession.current = session;
  const [basis, setBasis] = useState<Shipment | null>(null);
  const [incoming, setIncoming] = useState<Shipment | null>(null);
  const [error, setError] = useState('');
  const reviewed = useRef<{ shipment: Shipment; key: string } | null>(null);
  const latest = useRef({ value, importValue, applyValue });
  latest.current = { value, importValue, applyValue };
  const key = JSON.stringify(value);
  function load(shipment: Shipment) {
    try {
      const next = latest.current.importValue(shipment);
      latest.current.applyValue(next);
      reviewed.current = { shipment, key: JSON.stringify(next) };
      setBasis(shipment); setIncoming(null); setError('');
    } catch (cause) {
      setIncoming(shipment);
      setError(cause instanceof Error ? cause.message : 'Shared inputs could not be loaded.');
    }
  }
  useEffect(() => {
    const shipment = session?.shipment;
    if (!shipment || reviewed.current?.shipment.id === shipment.id && reviewed.current.shipment.revision === shipment.revision) return;
    if (reviewed.current?.shipment.id === shipment.id && JSON.stringify(latest.current.value) !== reviewed.current.key) {
      setIncoming(shipment); return;
    }
    load(shipment);
    // Native callback identity is not a reason to replace a working draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.shipment?.id, session?.shipment?.revision]);
  function acknowledge(shipment: Shipment, submittedValue: T) {
    if (shipment.id !== latestSession.current?.selectedId) return;
    const newer = latestSession.current.shipment;
    reviewed.current = { shipment, key: JSON.stringify(submittedValue) };
    setBasis(shipment); setIncoming(newer && newer.revision > shipment.revision ? newer : null); setError('');
  }
  const canSubmit = Boolean(session?.online && !session.busy && session.shipment &&
    basis?.id === session.shipment.id && basis.revision === session.shipment.revision && !incoming && !error);
  return {
    basis, incoming, error,
    dirty: Boolean(reviewed.current && key !== reviewed.current.key),
    detached: Boolean(basis && !session?.selectedId),
    canSubmit,
    canPublish: canSubmit && session?.shipment?.status === 'draft',
    loadCurrent: () => { if (session?.shipment) load(session.shipment); }, acknowledge,
  };
}
