import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "../api/client";
import { useStateChangedRefetch } from "../realtime/useStateChangedRefetch";

type MenuItem = {
  id: number;
  name: string;
  available: boolean;
  low_stock?: boolean;
  reason?: string | null;
};

type CartItem = {
  menu_item_id: number;
  qty: number;
};

type ReservationError = {
  ingredient_name: string;
};

export function OnlinePage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [alert, setAlert] = useState("");
  const timerRef = useRef<number | null>(null);

  const loadMenu = useCallback(async () => {
    const response = await apiFetch("/menu");
    const data = (await response.json()) as MenuItem[];
    setMenu(data);
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  useStateChangedRefetch(loadMenu);

  const items = useMemo<CartItem[]>(() => {
    return (Object.entries(cart) as Array<[string, number]>)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, qty]) => ({ menu_item_id: Number(menuItemId), qty }));
  }, [cart]);

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
  };

  return (
    <section>
      <h1 className="mb-3 text-xl font-bold">Online ordering</h1>
      {alert ? <p className="mb-2 rounded bg-yellow-100 p-2 text-sm">{alert}</p> : null}
      {conflicts.length > 0 ? (
        <ul className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">
          {conflicts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {menu.map((item) => (
          <article key={item.id} className="rounded border bg-white p-3">
            <p>{item.name}</p>
            <button className="mt-2 rounded bg-blue-600 px-2 py-1 text-white" onClick={() => {
              setCart((prev) => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
            }}>
              Add {item.name}
            </button>
          </article>
        ))}
      </div>
      {localStorage.getItem("activeReservationId") ? (
        <div className="mt-4 flex gap-2">
          <button className="rounded bg-green-600 px-3 py-2 text-white" onClick={() => void commit()}>Commit</button>
          <button className="rounded bg-slate-300 px-3 py-2" onClick={() => void release()}>Release</button>
        </div>
      ) : null}
    </section>
  );
}
