import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../api/client";
import type { UserRole } from "../auth/token";
import { useStateChangedRefetch } from "../realtime/useStateChangedRefetch";

type MenuItem = {
  id: number;
  name: string;
  available: boolean;
  low_stock: boolean;
  reason: string | null;
  ingredients?: string[];
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

export function FohPage({ role }: { role: UserRole | null }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const isFoh = role === "foh";
  const [ttlInfo, setTtlInfo] = useState<ReservationTtlPayload | null>(null);
  const [ttlMinutes, setTtlMinutes] = useState<number>(10);
  const [warningThresholdSeconds, setWarningThresholdSeconds] = useState<number>(30);
  const [ttlError, setTtlError] = useState("");
  const [isSavingTtl, setIsSavingTtl] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch("/menu");
    const data = (await response.json()) as MenuItem[];
    setMenu(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useStateChangedRefetch(load);

  const loadTtlInfo = useCallback(async () => {
    if (!isFoh) {
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
  }, [isFoh]);

  useEffect(() => {
    void loadTtlInfo();
  }, [loadTtlInfo]);

  const updateTtl = async () => {
    if (!ttlInfo || !isFoh) {
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
    <section>
      <h1 className="mb-3 text-xl font-bold">Front of house</h1>
      {isFoh ? (
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {menu.map((item) => (
          <div key={item.id} className="rounded border bg-white p-3" title={item.reason || ""}>
            <p className="font-semibold">{item.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              Ingredients: {item.ingredients?.length ? item.ingredients.join(", ") : "N/A"}
            </p>
            {!item.available ? <p className="text-sm text-red-600">Unavailable</p> : null}
            {item.low_stock ? <p className="mt-2 inline-block rounded bg-yellow-200 px-2 py-1 text-xs">LOW STOCK</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
