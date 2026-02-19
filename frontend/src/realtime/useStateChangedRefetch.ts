import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

import { logger } from "../logging/logger";

const API_BASE_URL = "http://localhost:5000";

export function useStateChangedRefetch(
  refetch: () => void,
  options: { delayMs?: number; suppress?: boolean; onQueued?: () => void } = {}
): void {
  const delayMs = options.delayMs ?? 400;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const socket = io(API_BASE_URL);
    const onConnect = () => logger.info("socket connected", { url: API_BASE_URL, socketId: socket.id });
    const onConnectError = (error: unknown) => logger.warn("socket connect_error", { error });

    const onStateChanged = () => {
      logger.debug("socket stateChanged received", { suppress: Boolean(options.suppress) });
      if (options.suppress) {
        options.onQueued?.();
        logger.debug("socket refetch queued while suppressed");
        return;
      }
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        logger.debug("socket triggering refetch");
        refetch();
      }, delayMs);
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("stateChanged", onStateChanged);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("stateChanged", onStateChanged);
      socket.disconnect();
      logger.info("socket disconnected");
    };
  }, [delayMs, options.onQueued, options.suppress, refetch]);
}
