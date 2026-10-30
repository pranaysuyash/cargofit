export interface HandlingUnit {
  id: string;
  barcode: string;
  description: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLbs: number;
  stackable: boolean;
  temperatureClass: 'ambient' | 'chilled' | 'frozen';
}

export interface ShipmentInput {
  origin: string;
  destination: string;
  loadedMiles: number;
  deadheadMiles: number;
  equipmentId: string;
  carrierDot: string;
  driverId: string;
  tractorId: string;
  trailerId: string;
  priorRestHours: number;
  units: HandlingUnit[];
}

export type FlowStage = 'asset' | 'fit' | 'warehouse' | 'yard' | 'carrier' | 'quote' | 'hos';
export interface StageResult {
  ok: boolean;
  summary: string;
  details: Record<string, unknown>;
}
export interface ReceiptInput { receiver: string; units: { id: string; barcode: string; slotCode: string }[] }
export interface ShipmentAdapter {
  stage?: FlowStage;
  evaluate?: (shipment: Shipment, resources: FlowResources) => StageResult;
  verifyReceipt?: (shipment: Shipment, receipt: ReceiptInput) => void;
}
export interface FlowResources { warehouseSlotIds: string[]; yardDoorIds: string[] }
export interface StageRecord extends StageResult {
  inputRevision: number;
  recordedAt: string;
  productId: string;
  /** Original observation is unchanged when its input dependency is unchanged. */
  reusedFromInputRevision?: number;
  reusedAt?: string;
}
export interface FlowEvent {
  id: string;
  type: string;
  productId: string;
  at: string;
  inputRevision: number;
  note: string;
  payload?: Record<string, unknown>;
}
export interface Shipment {
  id: string;
  reference: string;
  mode: 'local_scenario';
  revision: number;
  inputRevision: number;
  input: ShipmentInput;
  results: Partial<Record<FlowStage, StageRecord>>;
  status: 'draft' | 'dispatched' | 'in_transit' | 'arrived' | 'delivered' | 'invoice_ready';
  events: FlowEvent[];
  exceptions: { id: string; message: string; resolved: boolean; resolution?: string }[];
  delivery?: { receiver: string; receivedAt: string; units: { id: string; barcode: string; slotCode: string }[] };
  invoice?: { number: string; totalCents: number; currency: 'USD'; preparedAt: string; evidenceEventIds: string[] };
  operations: Record<string, { fingerprint: string }>;
}

export const STAGE_PRODUCTS: Record<FlowStage, string> = {
  asset: 'product-04-asset-studio', fit: 'product-01-cargo-fit',
  warehouse: 'product-06-warehouse-space-flow', yard: 'product-07-yard-dock',
  carrier: 'product-08-carrier-trust', quote: 'product-02-freight-pricing', hos: 'product-03-hos-planner',
};
export const STAGE_LABELS: Record<FlowStage, string> = {
  asset: 'Equipment', fit: 'Loading plan', warehouse: 'Receiving space', yard: 'Dock allocation',
  carrier: 'Carrier policy', quote: 'Accepted scenario quote', hos: 'Duty plan',
};
