import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "./App";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

function makeToken(role: "kitchen" | "foh" | "online") {
  const payload = btoa(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `x.${payload}.x`;
}

describe("Phase 10 routing and online behavior", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("redirects protected routes when token missing", async () => {
    render(
      <MemoryRouter initialEntries={["/kitchen"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText("Order online")).toBeInTheDocument();
  });

  it("redirects from landing by role", async () => {
    const roles: Array<["kitchen" | "foh" | "online", string]> = [
      ["kitchen", "Kitchen"],
      ["foh", "Front of house"],
      ["online", "Online ordering"],
    ];

    for (const [role, heading] of roles) {
      localStorage.setItem("accessToken", makeToken(role));
      render(
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      );
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      localStorage.clear();
    }
  });

  it("uses PATCH reservations when activeReservationId exists", async () => {
    vi.useFakeTimers();
    localStorage.setItem("accessToken", makeToken("online"));
    localStorage.setItem("activeReservationId", "123");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(new Response(JSON.stringify([{ id: 1, name: "Pizza", available: true }]), { status: 200 }));
      }
      if (url.includes("/reservations/123") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({ id: 123, status: "active" }), { status: 200 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    render(
      <MemoryRouter initialEntries={["/online"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    await screen.findByText("Pizza");
    await userEvent.click(screen.getByRole("button", { name: "Add Pizza" }));

    vi.advanceTimersByTime(450);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/reservations/123"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ items: [{ menu_item_id: 1, qty: 1 }] }),
        })
      );
    });
    vi.useRealTimers();
  });

  it("formats 409 insufficient errors at top of page", async () => {
    vi.useFakeTimers();
    localStorage.setItem("accessToken", makeToken("online"));
    localStorage.setItem("activeReservationId", "123");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 1, name: "Caprese", available: false, reason: "Insufficient Tomatoes" }]), { status: 200 })
        );
      }
      if (url.includes("/reservations/123") && init?.method === "PATCH") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "INSUFFICIENT_INGREDIENTS",
              errors: [
                {
                  ingredient_id: 5,
                  ingredient_name: "Tomatoes",
                  message: "Insufficient Tomatoes",
                  required_qty: 2,
                  available_qty: 0,
                  is_out: true,
                },
              ],
            }),
            { status: 409 }
          )
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    render(
      <MemoryRouter initialEntries={["/online"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    await screen.findByText("Caprese");
    await userEvent.click(screen.getByRole("button", { name: "Add Caprese" }));
    vi.advanceTimersByTime(450);

    expect(await screen.findByText("[Caprese] sold-out: insufficient Tomatoes")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
