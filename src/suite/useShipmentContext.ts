import { useEffect, useRef } from 'react';
import type { Shipment } from './types';
import { useShipmentSession } from './ShipmentSession';

/** Imports a shared snapshot once per relevant revision, preserving local edits. */
export function useShipmentContext(apply: (shipment: Shipment) => void, execution = false, dependency: 'asset' | 'fit' | 'record' = 'asset'): void {
  const session = useShipmentSession();
  const callback = useRef(apply); callback.current = apply;
  const last = useRef('');
  useEffect(() => {
    const accept = (s: Shipment) => {
      if (!s || new URLSearchParams(window.location.search).get('shipment') !== s.id) return;
      const key = `${s.id}:${s.inputRevision}:${s.results.asset?.recordedAt ?? ''}:${dependency === 'record' ? s.revision : dependency === 'fit' ? s.results.fit?.recordedAt ?? '' : ''}:${execution ? `${s.results.warehouse?.recordedAt ?? ''}:${s.delivery?.receivedAt ?? ''}` : ''}`;
      if (key === last.current) return;
      callback.current(s); last.current = key;
    };
    if (session) {
      if (session.shipment) accept(session.shipment);
      else last.current = '';
      return;
    }
    const receive = (event: Event) => accept((event as CustomEvent<Shipment>).detail);
    window.addEventListener('trucking:shipment-context', receive);
    return () => window.removeEventListener('trucking:shipment-context', receive);
  }, [execution, dependency, session?.shipment, Boolean(session)]);
}
