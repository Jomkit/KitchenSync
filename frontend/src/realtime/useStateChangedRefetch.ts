import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const API_BASE_URL = "http://localhost:5000";

export function useStateChangedRefetch(
  refetch: () => void,
  options: { delayMs?: number; suppress?: boolean; onQueued?: () => void } = {}
): void {
  const delayMs = options.delayMs ?? 400;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const socket = io(API_BASE_URL);

    const onStateChanged = () => {
      if (options.suppress) {
        options.onQueued?.();
        return;
      }
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        refetch();
      }, delayMs);
    };

    socket.on("stateChanged", onStateChanged);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      socket.off("stateChanged", onStateChanged);
      socket.disconnect();
    };
  }, [delayMs, options.onQueued, options.suppress, refetch]);
}
