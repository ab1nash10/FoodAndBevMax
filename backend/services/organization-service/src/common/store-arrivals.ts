import { Injectable } from '@nestjs/common';
import { logger } from '@aahar/logging';

/** A batch of an item that just reached a store. */
export interface StoreArrival {
  batchNumber: string;
  itemId: string;
  storeId: string;
}

type Listener = (arrivals: StoreArrival[]) => Promise<void>;

/**
 * Tells whoever is waiting for a batch that it reached a store (an ERP reverse waits for stock
 * the restaurants send back). Modules that put stock into a store call `arrived` after their
 * transaction commits; a listener's failure is logged and never fails the caller, whose stock
 * is already saved. In-process: every pod hears only its own arrivals, which is all it needs.
 */
@Injectable()
export class StoreArrivals {
  private readonly listeners: Listener[] = [];

  listen(listener: Listener) {
    this.listeners.push(listener);
  }

  async arrived(arrivals: StoreArrival[]) {
    if (arrivals.length === 0) return;

    for (const listener of this.listeners) {
      try {
        await listener(arrivals);
      } catch (error) {
        logger.error({ err: error }, 'store_arrival_listener_failed');
      }
    }
  }
}
