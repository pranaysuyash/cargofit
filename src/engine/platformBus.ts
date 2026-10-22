/**
 * Cross-Tab Platform Event Bus (trucking-platform-bus).
 * Provides zero-latency, local-first reactive synchronization across all sovereign
 * Trucking products (Ports 5170, 5173, 5174, 5175, 5176, 5177, 5178) using
 * the browser's native BroadcastChannel API with in-memory fallback for test environments.
 */

export const PLATFORM_CHANNEL_NAME = 'trucking-platform-mesh-v1';

export interface PlatformEventPayloads {
  ORDER_SELECTED: {
    orderId: string;
    orderNumber: string;
    customerName: string;
    origin: string;
    destination: string;
    distanceMiles: number;
    vehicleId: string;
    packageId: string;
    packageCount: number;
    totalPayloadLbs: number;
    timestamp: string;
  };
  VEHICLE_CHANGED: {
    vehicleId: string;
    vehicleName: string;
    maxPayloadLbs: number;
    trailerLengthFt: number;
    source: string;
  };
  CARGO_LOAD_UPDATED: {
    packageId: string;
    itemCount: number;
    totalWeightLbs: number;
    axleLegal: boolean;
    source: string;
  };
  PRICING_UPDATED: {
    orderId: string;
    ratePerMile: number;
    fuelSurcharge: number;
    totalQuote: number;
    operatingRatioPct: number;
  };
  HOS_SCHEDULE_UPDATED: {
    corridorId: string;
    totalTransitHours: number;
    driverMode: 'solo' | 'team';
    layoverCount: number;
    isLegal: boolean;
  };
  TELEMATICS_STREAM_TICK: {
    vehicleUnitNumber: string;
    speedMph: number;
    engineRpm: number;
    coolantTempF: number;
    fuelLevelPct: number;
    nearestCity: string;
    status: string;
  };
  SAFETY_ALERT: {
    alertId: string;
    unitNumber: string;
    category: 'HARSH_BRAKE' | 'DTC_FAULT' | 'TEMP_EXCURSION' | 'SPEED_VIOLATION';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: string;
  };
}

export type PlatformEventType = keyof PlatformEventPayloads;

export interface PlatformMessage<T extends PlatformEventType = PlatformEventType> {
  type: T;
  payload: PlatformEventPayloads[T];
  senderPort?: number;
  senderProduct: string;
  timestamp: string;
}

type EventHandler<T extends PlatformEventType> = (payload: PlatformEventPayloads[T], message: PlatformMessage<T>) => void;

class PlatformEventBus {
  private channel: BroadcastChannel | null = null;
  private memoryListeners = new Map<string, Set<(message: any) => void>>();
  private initialized = false;

  constructor() {
    this.initChannel();
  }

  private initChannel() {
    if (this.initialized) return;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(PLATFORM_CHANNEL_NAME);
        this.channel.onmessage = (event: MessageEvent<PlatformMessage>) => {
          this.dispatchToLocalListeners(event.data);
        };
      } catch {
        this.channel = null;
      }
    }
    this.initialized = true;
  }

  private dispatchToLocalListeners(msg: PlatformMessage) {
    if (!msg || !msg.type) return;
    const listeners = this.memoryListeners.get(msg.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(msg);
        } catch (err) {
          console.error(`Error executing listener for ${msg.type}:`, err);
        }
      }
    }
    // Also trigger wildcard listeners
    const wildcard = this.memoryListeners.get('*');
    if (wildcard) {
      for (const listener of wildcard) {
        try {
          listener(msg);
        } catch (err) {
          console.error('Error executing wildcard listener:', err);
        }
      }
    }
  }

  public publish<T extends PlatformEventType>(
    type: T,
    payload: PlatformEventPayloads[T],
    meta?: { senderProduct?: string; senderPort?: number }
  ): PlatformMessage<T> {
    this.initChannel();
    const message: PlatformMessage<T> = {
      type,
      payload,
      senderProduct: meta?.senderProduct || 'unknown',
      senderPort: meta?.senderPort,
      timestamp: new Date().toISOString(),
    };

    // Broadcast across browser tabs
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch (err) {
        console.warn('BroadcastChannel postMessage failed:', err);
      }
    }

    // Also dispatch to local listeners in current window/process
    this.dispatchToLocalListeners(message);

    return message;
  }

  public subscribe<T extends PlatformEventType>(
    type: T,
    handler: EventHandler<T>
  ): () => void {
    this.initChannel();
    if (!this.memoryListeners.has(type)) {
      this.memoryListeners.set(type, new Set());
    }

    const wrapper = (msg: PlatformMessage<T>) => {
      handler(msg.payload, msg);
    };

    this.memoryListeners.get(type)!.add(wrapper as any);

    return () => {
      const set = this.memoryListeners.get(type);
      if (set) {
        set.delete(wrapper as any);
        if (set.size === 0) this.memoryListeners.delete(type);
      }
    };
  }

  public getActiveListenerCount(type?: PlatformEventType): number {
    if (type) {
      return this.memoryListeners.get(type)?.size || 0;
    }
    let sum = 0;
    for (const set of this.memoryListeners.values()) {
      sum += set.size;
    }
    return sum;
  }

  public close() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.memoryListeners.clear();
    this.initialized = false;
  }
}

export const platformBus = new PlatformEventBus();
