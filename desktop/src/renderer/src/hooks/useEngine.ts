/**
 * useEngine — React hook that subscribes to the attention engine service.
 * Manages connection lifecycle and propagates events to the app store.
 */

import { useEffect, useRef, useCallback } from "react";
import { getEngineService } from "../services/serviceManager";
import { useAppStore } from "../store/appStore";
import type { AttentionEvent } from "../types/contracts";

export function useEngine(): {
  startMonitoring: () => Promise<void>;
  pauseMonitoring: () => Promise<void>;
} {
  const { dispatch, setError } = useAppStore();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    const engine = getEngineService();

    // Health check
    engine
      .getHealth()
      .then(() => {
        dispatch({ type: "SET_ENGINE_CONNECTED", connected: true });
      })
      .catch(() => {
        dispatch({ type: "SET_ENGINE_CONNECTED", connected: false });
      });

    // Subscribe to live events
    unsubscribeRef.current = engine.subscribeToEvents(
      (event: AttentionEvent) => {
        dispatch({ type: "UPDATE_ATTENTION", event });
      },
      (err: Error) => {
        console.error("[useEngine] SSE error:", err.message);
        dispatch({ type: "SET_ENGINE_CONNECTED", connected: false });
        setError("Lost connection to attention engine.");
      }
    );
  }, [dispatch, setError]);

  useEffect(() => {
    connect();
    return () => {
      unsubscribeRef.current?.();
    };
  }, [connect]);

  const startMonitoring = useCallback(async () => {
    try {
      await getEngineService().startMonitoring();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start monitoring");
    }
  }, [setError]);

  const pauseMonitoring = useCallback(async () => {
    try {
      await getEngineService().pauseMonitoring();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause monitoring");
    }
  }, [setError]);

  return { startMonitoring, pauseMonitoring };
}
