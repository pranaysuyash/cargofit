import { createContext, useContext } from 'react';
import type { FlowResources, Shipment } from './types';

/** Transport/session state only. Native products continue to own editable drafts. */
export interface ShipmentSession {
  shipment: Shipment | null;
  selectedId: string;
  online: boolean;
  busy: boolean;
  resources: FlowResources | null;
  submit: (type: string, payload: Record<string, unknown>, expectedRevision?: number) => Promise<Shipment | null>;
  inspect: (record: string) => void;
  productUrl: (productId: string) => string;
}
export const ShipmentSessionContext = createContext<ShipmentSession | null>(null);
export const useShipmentSession = () => useContext(ShipmentSessionContext);

/** A delayed poll may never roll back a newer command response or another selection. */
export function mergeShipmentSnapshot(previous: Shipment | null, next: Shipment, selectedId: string): Shipment | null {
  if (next.id !== selectedId) return previous;
  if (previous?.id === next.id && previous.revision >= next.revision) return previous;
  return next;
}
