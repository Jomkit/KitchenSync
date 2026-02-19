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
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isReserving, setIsReserving] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [alert, setAlert] = useState("");
  const timerRef = useRef<number | null>(null);
  const reservingTimerRef = useRef<number | null>(null);

  const loadMenu = useCallback(async () => {
    const response = await apiFetch("/menu");
    const data = (await response.json()) as MenuItem[];
    setMenu(data);
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  useStateChangedRefetch(loadMenu);

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
    const matched = [...menu]
      .sort((a, b) => a.id - b.id)
      .find((item) => item.reason?.toLowerCase().includes(ingredientName.toLowerCase()));
    return `[${matched?.name || "Item"}] sold-out: insufficient ${ingredientName}`;
  }, [menu]);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    if (items.length === 0) {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      void (async () => {
        const reservationId = localStorage.getItem("activeReservationId");
        const path = reservationId ? `/reservations/${reservationId}` : "/reservations";
        const method = reservationId ? "PATCH" : "POST";

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
          return;
        }

        if (!response.ok) {
          return;
        }

        setConflicts([]);
        const body = (await response.json()) as { id: number };
        if (!reservationId && body.id) {
          localStorage.setItem("activeReservationId", String(body.id));
        }
      })();
    }, 400);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [items, loadMenu, mapConflictLine]);

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

  const adjustCartQty = (menuItemId: number, delta: number) => {
    setCart((prev) => {
      const currentQty = prev[menuItemId] || 0;
      const maxQty = maxQtyByMenuItem[menuItemId] ?? 0;
      const nextQty = delta > 0
        ? (maxQty <= 0 ? currentQty : currentQty + delta)
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
    if (delta > 0) {
      showReservingIndicator();
      setIsCartOpen(true);
    }
  };

  const commit = async () => {
    const reservationId = localStorage.getItem("activeReservationId");
    if (!reservationId) {
      return;
    }
    const response = await apiFetch(`/reservations/${reservationId}/commit`, { method: "POST" });
    if (response.status === 409) {
      localStorage.removeItem("activeReservationId");
      await loadMenu();
      setAlert("Your reservation expired or inventory changed. Please try again.");
      return;
    }
    if (response.ok) {
      localStorage.removeItem("activeReservationId");
      setCart({});
      navigate("/online/confirmed");
    }
  };

  const release = async () => {
    const reservationId = localStorage.getItem("activeReservationId");
    if (!reservationId) {
      return;
    }
    await apiFetch(`/reservations/${reservationId}/release`, { method: "POST" });
    localStorage.removeItem("activeReservationId");
    setCart({});
    clearAuth();
    navigate("/");
  };

  return (
    <section className="relative pb-20">
      <h1 className="mb-3 text-xl font-bold">{pageTitle}</h1>
      {alert ? <p className="mb-2 rounded bg-yellow-100 p-2 text-sm">{alert}</p> : null}
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
                disabled={!item.available || getItemMaxQty(item) <= 0}
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
                    onClick={() => adjustCartQty(item.id, -1)}
                  >
                    -
                  </button>
                  <span className="min-w-6 text-center text-sm font-semibold">{cart[item.id]}</span>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-slate-100 font-semibold disabled:opacity-50"
                    aria-label={`Increase ${item.name}`}
                    disabled={getItemMaxQty(item) <= 0}
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
                    onClick={() => adjustCartQty(item.menu_item_id, -1)}
                  >
                    -
                  </button>
                  <span className="min-w-6 text-center text-sm font-semibold">{item.qty}</span>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-slate-100 font-semibold disabled:opacity-50"
                    disabled={getItemMaxQty(menuItem) <= 0}
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
        {localStorage.getItem("activeReservationId") ? (
          <div className="mt-4 flex gap-2">
            <button className="rounded bg-green-600 px-3 py-2 text-white" onClick={() => void commit()}>Checkout</button>
            <button className="rounded bg-slate-300 px-3 py-2" onClick={() => void release()}>Cancel order</button>
          </div>
        ) : null}
      </aside>
    </section>
  );
}
