import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../api/client";
import type { UserRole } from "../auth/token";
import { clearAuth } from "../auth/token";
import { useStateChangedRefetch } from "../realtime/useStateChangedRefetch";

type MenuItem = {
  id: number;
  name: string;
  available: boolean;
  max_qty_available?: number;
  low_stock?: boolean;
  reason?: string | null;
  ingredients?: string[];
};

type CartItem = {
  menu_item_id: number;
  qty: number;
};

type ReservationError = {
  ingredient_name: string;
};

type ReservationStatus = "active" | "committed" | "released" | "expired";

type ReservationSnapshot = {
  id: number;
  status: ReservationStatus;
  expires_at: string;
};

type ReservationTtlPayload = {
  ttl_seconds: number;
  ttl_minutes: number;
  min_minutes: number;
  max_minutes: number;
  warning_threshold_seconds: number;
  warning_min_seconds: number;
  warning_max_seconds: number;
};

function getItemMaxQty(item: MenuItem): number {
  if (typeof item.max_qty_available === "number") {
    return Math.max(0, item.max_qty_available);
  }
  return Number.MAX_SAFE_INTEGER;
}

export function OnlinePage({ role }: { role: UserRole | null }) {
  const navigate = useNavigate();
  const isFohFlow = role === "foh";
  const pageTitle = isFohFlow ? "FOH ordering" : "Online ordering";
  const addLabelPrefix = isFohFlow ? "Add ticket" : "Add";
  const reservingLabel = isFohFlow ? "Reserving for FOH..." : "Reserving...";
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeReservationId, setActiveReservationId] = useState<string | null>(
    () => localStorage.getItem("activeReservationId")
  );
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [isSyncingReservation, setIsSyncingReservation] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [alert, setAlert] = useState("");
  const [ttlInfo, setTtlInfo] = useState<ReservationTtlPayload | null>(null);
  const [ttlMinutes, setTtlMinutes] = useState<number>(10);
  const [warningThresholdSeconds, setWarningThresholdSeconds] = useState<number>(30);
  const [ttlError, setTtlError] = useState("");
  const [isSavingTtl, setIsSavingTtl] = useState(false);
  const [isExpiryCleanupPending, setIsExpiryCleanupPending] = useState(false);
  const [expiryCleanupMessage, setExpiryCleanupMessage] = useState("");
  const [cleanupTargetReservationId, setCleanupTargetReservationId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const reservingTimerRef = useRef<number | null>(null);
  const expiryCleanupIntervalRef = useRef<number | null>(null);
  const expiryCleanupCheckInFlightRef = useRef(false);
  const handledEndedReservationIdRef = useRef<string | null>(null);
  const menuRef = useRef<MenuItem[]>([]);

  const clearActiveReservation = useCallback(() => {
    localStorage.removeItem("activeReservationId");
    setActiveReservationId(null);
  }, []);

  const stopExpiryCleanupFlow = useCallback(() => {
    if (expiryCleanupIntervalRef.current) {
      window.clearInterval(expiryCleanupIntervalRef.current);
      expiryCleanupIntervalRef.current = null;
    }
    expiryCleanupCheckInFlightRef.current = false;
    setIsExpiryCleanupPending(false);
    setExpiryCleanupMessage("");
    setCleanupTargetReservationId(null);
  }, []);

  const handleReservationEnded = useCallback(
    (reason: "expired" | "released" | "missing" | "conflict", reservationId: string | null = activeReservationId) => {
      if (!reservationId) {
        return;
      }
      if (handledEndedReservationIdRef.current === reservationId) {
        return;
      }
      handledEndedReservationIdRef.current = reservationId;
      clearActiveReservation();
      setCart({});
      setConflicts([]);
      setIsCartOpen(false);
      stopExpiryCleanupFlow();
      if (reason === "expired" || reason === "conflict") {
        setAlert("Your reservation expired. Items were released. Please start a new order.");
      }
    },
    [activeReservationId, clearActiveReservation, stopExpiryCleanupFlow]
  );

  const loadMenu = useCallback(async () => {
    const response = await apiFetch("/menu");
    const data = (await response.json()) as MenuItem[];
    setMenu(data);
  }, []);

  const loadTtlInfo = useCallback(async () => {
    if (!isFohFlow) {
      return;
    }
    const response = await apiFetch("/admin/reservation-ttl");
    if (!response.ok) {
      setTtlError("Unable to load reservation TTL.");
      return;
    }
    const body = (await response.json()) as ReservationTtlPayload;
    setTtlInfo(body);
    setTtlMinutes(body.ttl_minutes);
    setWarningThresholdSeconds(body.warning_threshold_seconds ?? 30);
    setTtlError("");
  }, [isFohFlow]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    void loadTtlInfo();
  }, [loadTtlInfo]);

  useStateChangedRefetch(loadMenu);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "activeReservationId") {
        setActiveReservationId(localStorage.getItem("activeReservationId"));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const checkReservationStatus = useCallback(async (reservationId: string): Promise<ReservationStatus | "missing" | "error"> => {
    const response = await apiFetch(`/reservations/${reservationId}`);
    if (response.status === 404) {
      return "missing";
    }
    if (!response.ok) {
      return "error";
    }
    const body = (await response.json()) as ReservationSnapshot;
    return body.status;
  }, []);

  const startTimerElapsedCleanup = useCallback((reservationId: string) => {
    if (!reservationId) {
      return;
    }
    if (activeReservationId && activeReservationId !== reservationId) {
      return;
    }
    if (cleanupTargetReservationId === reservationId && isExpiryCleanupPending) {
      return;
    }

    setIsExpiryCleanupPending(true);
    setCleanupTargetReservationId(reservationId);
    setExpiryCleanupMessage("Reservation expired. Finalizing your session...");

    const runCheck = () => {
      if (expiryCleanupCheckInFlightRef.current) {
        return;
      }
      expiryCleanupCheckInFlightRef.current = true;
      void (async () => {
        try {
          const status = await checkReservationStatus(reservationId);
          if (status === "active") {
            setExpiryCleanupMessage("Checking reservation status...");
            return;
          }
          if (status === "error") {
            setExpiryCleanupMessage("Checking reservation status... retrying");
            return;
          }
          if (status === "missing") {
            handleReservationEnded("missing", reservationId);
            return;
          }
          if (status === "expired") {
            handleReservationEnded("expired", reservationId);
            await loadMenu();
            return;
          }
          handleReservationEnded("released", reservationId);
        } finally {
          expiryCleanupCheckInFlightRef.current = false;
        }
      })();
    };

    runCheck();
    if (expiryCleanupIntervalRef.current) {
      window.clearInterval(expiryCleanupIntervalRef.current);
    }
    expiryCleanupIntervalRef.current = window.setInterval(runCheck, 1500);
  }, [
    activeReservationId,
    checkReservationStatus,
    cleanupTargetReservationId,
    handleReservationEnded,
    isExpiryCleanupPending,
    loadMenu,
  ]);

  useEffect(() => {
    const onReservationTimerElapsed = (event: Event) => {
      const customEvent = event as CustomEvent<{ reservationId?: string }>;
      const reservationId = customEvent.detail?.reservationId;
      if (!reservationId) {
        return;
      }
      startTimerElapsedCleanup(reservationId);
    };
    window.addEventListener("reservationTimerElapsed", onReservationTimerElapsed as EventListener);
    return () => {
      window.removeEventListener("reservationTimerElapsed", onReservationTimerElapsed as EventListener);
    };
  }, [startTimerElapsedCleanup]);

  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);

  const maxQtyByMenuItem = useMemo(() => {
    const limits: Record<number, number> = {};
    for (const item of menu) {
      limits[item.id] = getItemMaxQty(item);
    }
    return limits;
  }, [menu]);

  const items = useMemo<CartItem[]>(() => {
    return (Object.entries(cart) as Array<[string, number]>)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, qty]) => ({ menu_item_id: Number(menuItemId), qty }));
  }, [cart]);
  const cartCount = items.reduce((total, item) => total + item.qty, 0);

  const mapConflictLine = useCallback((ingredientName: string): string => {
    const matched = [...menuRef.current]
      .sort((a, b) => a.id - b.id)
      .find((item) => item.reason?.toLowerCase().includes(ingredientName.toLowerCase()));
    return `[${matched?.name || "Item"}] sold-out: insufficient ${ingredientName}`;
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    if (items.length === 0) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      void (async () => {
        const path = activeReservationId ? `/reservations/${activeReservationId}` : "/reservations";
        const method = activeReservationId ? "PATCH" : "POST";

        setIsSyncingReservation(true);
        try {
          const response = await apiFetch(path, {
            method,
            body: JSON.stringify({ items }),
          });

          if (response.status === 409) {
            const body = (await response.json()) as { code?: string; errors?: ReservationError[] };
            if (body.code === "INSUFFICIENT_INGREDIENTS" && body.errors) {
              setConflicts(body.errors.map((error) => mapConflictLine(error.ingredient_name)));
              return;
            }
            handleReservationEnded("conflict", activeReservationId);
            await loadMenu();
            return;
          }

          if (response.status === 404) {
            handleReservationEnded("missing", activeReservationId);
            return;
          }

          if (!response.ok) {
            return;
          }

          setConflicts([]);
          const body = (await response.json()) as { id: number };
          if (!activeReservationId && body.id) {
            localStorage.setItem("activeReservationId", String(body.id));
            handledEndedReservationIdRef.current = null;
            setActiveReservationId(String(body.id));
          }
        } finally {
          setIsSyncingReservation(false);
        }
      })();
    }, 400);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [activeReservationId, handleReservationEnded, items, loadMenu, mapConflictLine]);

  useEffect(() => {
    if (!activeReservationId) {
      return;
    }
    if (isExpiryCleanupPending) {
      return;
    }

    let cancelled = false;
    const checkReservation = async () => {
      const status = await checkReservationStatus(activeReservationId);
      if (cancelled) {
        return;
      }
      if (status === "active" || status === "error") {
        return;
      }
      if (status === "missing") {
        handleReservationEnded("missing", activeReservationId);
        return;
      }
      if (status === "expired") {
        handleReservationEnded("expired", activeReservationId);
        await loadMenu();
        return;
      }
      handleReservationEnded("released", activeReservationId);
    };

    void checkReservation();
    const id = window.setInterval(() => {
      void checkReservation();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeReservationId, checkReservationStatus, handleReservationEnded, isExpiryCleanupPending, loadMenu]);

  useEffect(() => {
    return () => {
      stopExpiryCleanupFlow();
    };
  }, [stopExpiryCleanupFlow]);

  useEffect(() => {
    return () => {
      if (reservingTimerRef.current) {
        window.clearTimeout(reservingTimerRef.current);
      }
    };
  }, []);

  const showReservingIndicator = () => {
    setIsReserving(true);
    if (reservingTimerRef.current) {
      window.clearTimeout(reservingTimerRef.current);
    }
    reservingTimerRef.current = window.setTimeout(() => {
      setIsReserving(false);
      reservingTimerRef.current = null;
    }, 1600);
  };

  const isInteractionBlocked = isSyncingReservation || isExpiryCleanupPending;

  const adjustCartQty = (menuItemId: number, delta: number) => {
    setCart((prev) => {
      const currentQty = prev[menuItemId] || 0;
      const maxQty = maxQtyByMenuItem[menuItemId] ?? 0;
      if (isInteractionBlocked) {
        return prev;
      }
      const nextQty = delta > 0
        ? (maxQty <= 0 ? currentQty : Math.min(maxQty, currentQty + delta))
        : Math.max(0, currentQty + delta);
      if (nextQty === currentQty) {
        return prev;
      }
      const next = { ...prev };
      if (nextQty === 0) {
        delete next[menuItemId];
      } else {
        next[menuItemId] = nextQty;
      }
      return next;
    });
      if (delta > 0 && !isInteractionBlocked) {
      showReservingIndicator();
      setIsCartOpen(true);
    }
  };

  const commit = async () => {
    if (items.length === 0) {
      return;
    }
    if (isInteractionBlocked) {
      return;
    }
    if (!activeReservationId) {
      return;
    }
    const response = await apiFetch(`/reservations/${activeReservationId}/commit`, { method: "POST" });
    if (response.status === 409) {
      handleReservationEnded("expired", activeReservationId);
      await loadMenu();
      return;
    }
    if (response.ok) {
      clearActiveReservation();
      setCart({});
      navigate("/online/confirmed");
    }
  };

  const release = async () => {
    if (!activeReservationId) {
      return;
    }
    if (isInteractionBlocked) {
      return;
    }
    await apiFetch(`/reservations/${activeReservationId}/release`, { method: "POST" });
    handleReservationEnded("released", activeReservationId);
    clearAuth();
    navigate("/");
  };

  const updateTtl = async () => {
    if (!ttlInfo) {
      return;
    }
    setIsSavingTtl(true);
    setTtlError("");
    try {
      const response = await apiFetch("/admin/reservation-ttl", {
        method: "PATCH",
        body: JSON.stringify({
          ttl_minutes: ttlMinutes,
          warning_threshold_seconds: warningThresholdSeconds,
        }),
      });
      if (!response.ok) {
        const errorBody = (await response.json()) as { error?: string };
        setTtlError(errorBody.error || "Unable to update TTL.");
        return;
      }
      const body = (await response.json()) as ReservationTtlPayload;
      setTtlInfo(body);
      setTtlMinutes(body.ttl_minutes);
      setWarningThresholdSeconds(body.warning_threshold_seconds ?? warningThresholdSeconds);
    } finally {
      setIsSavingTtl(false);
    }
  };

  return (
    <section className="relative pb-20">
      <h1 className="mb-3 text-xl font-bold">{pageTitle}</h1>
      {isFohFlow ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded bg-white p-2 shadow-sm">
          <p className="text-sm font-medium">
            Reservation TTL:
            {" "}
            {ttlInfo ? `${ttlInfo.ttl_minutes} min` : "--"}
          </p>
          <p className="text-sm font-medium">
            Warning threshold:
            {" "}
            {ttlInfo ? `${ttlInfo.warning_threshold_seconds}s` : "--"}
          </p>
          <label className="text-sm" htmlFor="ttl-minutes-select">Set to</label>
          <select
            id="ttl-minutes-select"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={ttlMinutes}
            onChange={(event) => setTtlMinutes(Number(event.target.value))}
          >
            {Array.from({ length: 15 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{value} min</option>
            ))}
          </select>
          <label className="text-sm" htmlFor="warning-threshold-select">Warn at</label>
          <select
            id="warning-threshold-select"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={warningThresholdSeconds}
            onChange={(event) => setWarningThresholdSeconds(Number(event.target.value))}
          >
            {Array.from({ length: 116 }, (_, index) => index + 5).map((value) => (
              <option key={value} value={value}>{value}s</option>
            ))}
          </select>
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isSavingTtl}
            onClick={() => void updateTtl()}
          >
            {isSavingTtl ? "Saving..." : "Apply TTL"}
          </button>
          {ttlError ? <p className="text-sm text-red-600">{ttlError}</p> : null}
        </div>
      ) : null}
      {alert ? <p className="mb-2 rounded bg-yellow-100 p-2 text-sm">{alert}</p> : null}
      {isExpiryCleanupPending ? (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/30">
          <div className="w-full max-w-sm rounded border bg-white p-4 text-center shadow-lg">
            <p className="text-sm font-medium text-slate-900">
              {expiryCleanupMessage || "Checking reservation status..."}
            </p>
            <p className="mt-2 text-xs text-slate-600">Please wait while we finalize your session.</p>
          </div>
        </div>
      ) : null}
      {conflicts.length > 0 ? (
        <ul className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">
          {conflicts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isCartOpen ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {menu.map((item) => (
          <article key={item.id} className="rounded border bg-white p-3">
            <p className="font-medium">{item.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              Ingredients: {item.ingredients?.length ? item.ingredients.join(", ") : "N/A"}
            </p>
            {item.reason ? <p className="mt-1 text-xs text-slate-500">{item.reason}</p> : null}
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                disabled={!item.available || getItemMaxQty(item) <= 0 || isInteractionBlocked}
                className="rounded bg-blue-600 px-3 py-1 text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={() => adjustCartQty(item.id, 1)}
              >
                {addLabelPrefix} {item.name}
              </button>
              {(cart[item.id] || 0) > 0 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-slate-100 font-semibold"
                    aria-label={`Decrease ${item.name}`}
                    disabled={isInteractionBlocked}
                    onClick={() => adjustCartQty(item.id, -1)}
                  >
                    -
                  </button>
                  <span className="min-w-6 text-center text-sm font-semibold">{cart[item.id]}</span>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-slate-100 font-semibold disabled:opacity-50"
                    aria-label={`Increase ${item.name}`}
                    disabled={getItemMaxQty(item) <= 0 || isInteractionBlocked}
                    onClick={() => adjustCartQty(item.id, 1)}
                  >
                    +
                  </button>
                </div>
              ) : null}
            </div>
            {getItemMaxQty(item) <= 0 && Number.isFinite(getItemMaxQty(item)) ? (
              <p className="mt-2 text-xs text-red-600">Sold out</p>
            ) : null}
          </article>
        ))}
      </div>

      <button
        type="button"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-xl text-white shadow-lg"
        aria-label="Toggle cart"
        onClick={() => setIsCartOpen((prev) => !prev)}
        disabled={isExpiryCleanupPending}
      >
        🛒
        {cartCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{cartCount}</span>
        ) : null}
      </button>

      <aside
        className={`fixed right-0 top-0 z-30 h-full w-[22rem] bg-white p-4 shadow-2xl transition-transform ${
          isCartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cart</h2>
          <button
            type="button"
            className="rounded bg-slate-200 px-2 py-1 text-sm"
            disabled={isInteractionBlocked}
            onClick={() => setIsCartOpen(false)}
          >
            Close
          </button>
        </div>

        {items.length === 0 ? <p className="text-sm text-slate-500">Your cart is empty.</p> : null}
        <ul className="space-y-2">
          {items.map((item) => {
            const menuItem = menu.find((entry) => entry.id === item.menu_item_id);
            if (!menuItem) {
              return null;
            }
            return (
              <li key={item.menu_item_id} className="rounded border p-2">
                <p className="text-sm font-medium">{menuItem.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-slate-100 font-semibold"
                    disabled={isInteractionBlocked}
                    onClick={() => adjustCartQty(item.menu_item_id, -1)}
                  >
                    -
                  </button>
                  <span className="min-w-6 text-center text-sm font-semibold">{item.qty}</span>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-slate-100 font-semibold disabled:opacity-50"
                    disabled={getItemMaxQty(menuItem) <= 0 || isInteractionBlocked}
                    onClick={() => adjustCartQty(item.menu_item_id, 1)}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {isReserving ? (
          <p className="mt-4 inline-block rounded bg-blue-50 px-3 py-1 text-sm text-blue-700">
            {reservingLabel}
          </p>
        ) : null}
        {activeReservationId ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded bg-green-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={items.length === 0 || isInteractionBlocked}
              onClick={() => void commit()}
            >
              Checkout
            </button>
            <button className="rounded bg-slate-300 px-3 py-2 disabled:opacity-50" disabled={isInteractionBlocked} onClick={() => void release()}>Cancel order</button>
          </div>
        ) : null}
      </aside>
    </section>
  );
}
