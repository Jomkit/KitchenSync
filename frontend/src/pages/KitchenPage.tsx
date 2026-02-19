import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../api/client";
import type { UserRole } from "../auth/token";
import { useStateChangedRefetch } from "../realtime/useStateChangedRefetch";

type Ingredient = {
  id: number;
  name: string;
  on_hand_qty: number;
  active_reserved_qty: number;
  available_qty: number;
  low_stock_threshold_qty: number;
  low_stock: boolean;
  is_out: boolean;
};

export function KitchenPage({ role }: { role: UserRole | null }) {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [queuedRefresh, setQueuedRefresh] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch("/ingredients");
    const data = (await response.json()) as Ingredient[];
    setItems(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useStateChangedRefetch(load, {
    suppress: isEditing,
    onQueued: () => setQueuedRefresh(true),
  });

  const save = async (id: number, patch: Partial<Pick<Ingredient, "on_hand_qty" | "is_out">>) => {
    if (role !== "kitchen") {
      return;
    }
    const response = await apiFetch(`/ingredients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setErrors((prev) => ({ ...prev, [id]: body.error || "Update failed" }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await load();
  };

  const updateLocal = (id: number, patch: Partial<Ingredient>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const setAvailableQty = (item: Ingredient, nextAvailableQty: number) => {
    const clampedAvailableQty = Math.max(0, nextAvailableQty);
    const nextOnHandQty = clampedAvailableQty + item.active_reserved_qty;
    updateLocal(item.id, {
      available_qty: clampedAvailableQty,
      on_hand_qty: nextOnHandQty,
      low_stock: clampedAvailableQty <= item.low_stock_threshold_qty,
    });
    void save(item.id, { on_hand_qty: nextOnHandQty });
  };

  return (
    <section className="space-y-2">
      <h1 className="text-xl font-bold">Kitchen</h1>
      {role !== "kitchen" ? <p className="text-sm text-slate-500">Read-only for FOH role.</p> : null}
      {items.map((item) => (
        <div key={item.id} className="rounded border bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{item.name}</span>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={item.is_out}
                disabled={role !== "kitchen"}
                onChange={(event) => {
                  updateLocal(item.id, { is_out: event.target.checked });
                  void save(item.id, { is_out: event.target.checked });
                }}
              />
              Out
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-slate-600">Available Qty</span>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-slate-100 font-semibold text-slate-700 enabled:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Decrease ${item.name}`}
              disabled={role !== "kitchen" || item.is_out}
              onClick={() => {
                setAvailableQty(item, item.available_qty - 1);
              }}
            >
              -
            </button>
            <input
              className="w-20 rounded border px-2"
              value={item.available_qty}
              disabled={item.is_out || role !== "kitchen"}
              onFocus={() => setIsEditing(true)}
              onBlur={() => {
                setIsEditing(false);
                if (queuedRefresh) {
                  setQueuedRefresh(false);
                  void load();
                }
              }}
              onChange={(event) => {
                const value = Number(event.target.value) || 0;
                setAvailableQty(item, value);
              }}
            />
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-slate-100 font-semibold text-slate-700 enabled:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Increase ${item.name}`}
              disabled={role !== "kitchen" || item.is_out}
              onClick={() => {
                setAvailableQty(item, item.available_qty + 1);
              }}
            >
              +
            </button>
            <span>Reserved: {item.active_reserved_qty}</span>
            <span>Available: {item.available_qty}</span>
            <span>{item.low_stock ? "LOW" : "OK"}</span>
          </div>
          {errors[item.id] ? <p className="mt-1 text-sm text-red-600">{errors[item.id]}</p> : null}
        </div>
      ))}
    </section>
  );
}
