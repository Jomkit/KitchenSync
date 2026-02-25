import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../api/client";
import { useStateChangedRefetch } from "../realtime/useStateChangedRefetch";

type ReservationStatus = "active" | "committed" | "released" | "expired";

type ReservationSnapshot = {
  id: number;
  status: ReservationStatus;
  expires_at: string;
};

function formatRemaining(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function readActiveReservationId(): string | null {
  return localStorage.getItem("activeReservationId");
}

export function ReservationExpiryPill(): JSX.Element | null {
  const [activeReservationId, setActiveReservationId] = useState<string | null>(() => readActiveReservationId());
  const [snapshot, setSnapshot] = useState<ReservationSnapshot | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadSnapshot = useCallback(async () => {
    const reservationId = readActiveReservationId();
    setActiveReservationId(reservationId);
    if (!reservationId) {
      setSnapshot(null);
      return;
    }

    const response = await apiFetch(`/reservations/${reservationId}`);
    if (response.status === 404) {
      localStorage.removeItem("activeReservationId");
      setActiveReservationId(null);
      setSnapshot(null);
      return;
    }

    if (!response.ok) {
      return;
    }

    const body = (await response.json()) as ReservationSnapshot;
    setSnapshot(body);
    if (body.status !== "active") {
      localStorage.removeItem("activeReservationId");
      setActiveReservationId(null);
    }
  }, []);

  useStateChangedRefetch(() => {
    void loadSnapshot();
  });

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "activeReservationId") {
        void loadSnapshot();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadSnapshot]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
      const nextId = readActiveReservationId();
      setActiveReservationId((current) => (current === nextId ? current : nextId));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const remainingSeconds = useMemo(() => {
    if (!snapshot || snapshot.status !== "active") {
      return null;
    }
    const expiresAtMs = Date.parse(snapshot.expires_at);
    if (Number.isNaN(expiresAtMs)) {
      return null;
    }
    return Math.ceil((expiresAtMs - nowMs) / 1000);
  }, [nowMs, snapshot]);

  if (!activeReservationId || !snapshot) {
    return null;
  }

  const open = pinnedOpen || hovered;
  const statusLabel = snapshot.status === "active"
    ? (remainingSeconds !== null && remainingSeconds > 0 ? "Hold expires in" : "Awaiting expiry sweep")
    : `Reservation ${snapshot.status}`;
  const timeLabel = snapshot.status === "active" && remainingSeconds !== null
    ? formatRemaining(remainingSeconds)
    : "--:--";

  return (
    <div
      className="fixed top-20 left-1/2 z-50 -translate-x-1/2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
          pinnedOpen ? "bg-slate-900 text-white shadow-inner translate-y-[1px]" : "bg-white/80 text-slate-700 shadow"
        }`}
        onClick={() => setPinnedOpen((prev) => !prev)}
      >
        TTL
      </button>

      {open ? (
        <div
          className={`absolute left-1/2 top-full mt-1 min-w-[12rem] -translate-x-1/2 rounded border p-2 text-xs transition ${
            pinnedOpen ? "bg-white text-slate-900 shadow-lg" : "bg-white/35 text-slate-900 backdrop-blur-[1px]"
          }`}
        >
          <p className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">{statusLabel}</span>
            <span className="text-lg font-bold leading-none">{timeLabel}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
