// The steward's orders, shared by every screen: checked every few seconds, ringing for what is
// new or ready, and Delivered held a few seconds for Undo.
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState, Vibration } from 'react-native';
import { newAlerts, type DeliveryAlert } from './alerts';
import { ApiError, deliveriesApi } from './api';
import type { Delivery, UndeliveredReason } from './types';

// ponytail: checked every 5 s while the app is open; push notifications (ringing on a locked
// phone) come with the AWS address, Firebase and the store builds.
const POLL_MS = 5_000;
/** How long "Delivered" can be undone before it is sent. */
export const UNDO_MS = 5_000;

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

interface Deliveries {
  alerts: DeliveryAlert[];
  /** A phone order handed over with the guest's code, sent at once: why not, or null when done. */
  deliverWithCode: (order: Delivery, code: string) => Promise<string | null>;
  dismissAlerts: () => void;
  /** Why the last check failed; cleared by the next good one. */
  error: string | null;
  giveBack: (order: Delivery, reason: UndeliveredReason) => Promise<boolean>;
  /** The order marked Delivered a moment ago, waiting out its Undo. */
  held: Delivery | null;
  loading: boolean;
  markDelivered: (order: Delivery) => void;
  orders: Delivery[];
  undo: () => void;
}

const DeliveriesContext = createContext<Deliveries | null>(null);

export function useDeliveries() {
  const value = useContext(DeliveriesContext);
  if (!value) throw new Error('useDeliveries needs DeliveriesProvider');
  return value;
}

export function DeliveriesProvider({ children }: { children: ReactNode }) {
  // The screen stays on while signed in, so the phone does not lock and miss a ring.
  useKeepAwake();
  const [orders, setOrders] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<DeliveryAlert[]>([]);
  const seen = useRef<Delivery[] | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const next = await deliveriesApi.list();
      const found = newAlerts(seen.current, next);
      seen.current = next;
      if (found.length) setAlerts((current) => [...current, ...found]);
      setOrders(next);
      setError(null);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Rings and buzzes until the steward taps Got it, even with the phone on silent.
  const ring = useAudioPlayer(require('../assets/ring.wav'));
  const ringing = alerts.length > 0;

  useEffect(() => {
    void setAudioModeAsync({ interruptionMode: 'duckOthers', playsInSilentMode: true }).catch(
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!ringing) return;
    // ring.wav is a 1.5 s chime: played again every 1.5 s, beside a buzz on the same beat.
    const chime = () => {
      void ring.seekTo(0);
      ring.play();
    };
    chime();
    const timer = setInterval(chime, 1_500);
    Vibration.vibrate([0, 400, 250, 400, 450], true);
    return () => {
      clearInterval(timer);
      ring.pause();
      Vibration.cancel();
    };
  }, [ring, ringing]);

  // Delivered waits UNDO_MS, then is sent; the app going to the background sends it at once.
  const [held, setHeld] = useState<Delivery | null>(null);
  const heldRef = useRef<{ order: Delivery; timer: ReturnType<typeof setTimeout> } | null>(null);

  const sendHeld = useCallback(() => {
    const waiting = heldRef.current;
    if (!waiting) return;
    heldRef.current = null;
    clearTimeout(waiting.timer);
    setHeld(null);
    deliveriesApi.delivered(waiting.order.id).then(
      () => load(),
      (failure: unknown) => {
        Alert.alert(`#${waiting.order.orderNumber} not delivered`, messageOf(failure));
        void load();
      },
    );
  }, [load]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
      else sendHeld();
    });
    return () => {
      subscription.remove();
      sendHeld();
    };
  }, [load, sendHeld]);

  const markDelivered = useCallback(
    (order: Delivery) => {
      sendHeld(); // One tapped just before goes now.
      heldRef.current = { order, timer: setTimeout(sendHeld, UNDO_MS) };
      setHeld(order);
    },
    [sendHeld],
  );

  const undo = useCallback(() => {
    if (heldRef.current) clearTimeout(heldRef.current.timer);
    heldRef.current = null;
    setHeld(null);
  }, []);

  const deliverWithCode = useCallback(
    async (order: Delivery, code: string) => {
      try {
        await deliveriesApi.delivered(order.id, code);
        await load();
        return null;
      } catch (failure) {
        return messageOf(failure);
      }
    },
    [load],
  );

  const giveBack = useCallback(
    async (order: Delivery, reason: UndeliveredReason) => {
      try {
        await deliveriesApi.notDelivered(order.id, reason);
        await load();
        return true;
      } catch (failure) {
        Alert.alert('Not given back', messageOf(failure));
        return false;
      }
    },
    [load],
  );

  return (
    <DeliveriesContext.Provider
      value={{
        alerts,
        deliverWithCode,
        dismissAlerts: () => setAlerts([]),
        error,
        giveBack,
        held,
        loading,
        markDelivered,
        orders,
        undo,
      }}
    >
      {children}
    </DeliveriesContext.Provider>
  );
}
