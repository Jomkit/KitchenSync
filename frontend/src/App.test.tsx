import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  const emailByRole = {
    kitchen: "kitchen@example.com",
    foh: "foh@example.com",
    online: "online@example.com",
  };
  const payload = btoa(
    JSON.stringify({
      role,
      email: emailByRole[role],
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  );
  return `x.${payload}.x`;
}

describe("Phase 10 routing and online behavior", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(new Response("[]", { status: 200 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
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
      ["foh", "FOH ordering"],
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
    const user = userEvent.setup();
    localStorage.setItem("accessToken", makeToken("online"));
    localStorage.setItem("activeReservationId", "123");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 1, name: "Pizza", available: true, max_qty_available: 10 }]), { status: 200 })
        );
      }
      if (url.includes("/reservations/123") && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 123,
              status: "active",
              expires_at: new Date(Date.now() + 600_000).toISOString(),
            }),
            { status: 200 }
          )
        );
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

    await screen.findByRole("button", { name: "Add Pizza" });
    await user.click(screen.getByRole("button", { name: "Add Pizza" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/reservations/123"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ items: [{ menu_item_id: 1, qty: 1 }] }),
        })
      );
    });
  });

  it("formats 409 insufficient errors at top of page", async () => {
    const user = userEvent.setup();
    localStorage.setItem("accessToken", makeToken("online"));
    localStorage.setItem("activeReservationId", "123");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([{ id: 1, name: "Caprese", available: true, max_qty_available: 10, reason: "Insufficient Tomatoes" }]),
            { status: 200 }
          )
        );
      }
      if (url.includes("/reservations/123") && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 123,
              status: "active",
              expires_at: new Date(Date.now() + 600_000).toISOString(),
            }),
            { status: 200 }
          )
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
    await user.click(screen.getByRole("button", { name: "Add Caprese" }));
    await waitFor(() => {
      expect(screen.getByText("[Caprese] sold-out: insufficient Tomatoes")).toBeInTheDocument();
    });
  });

  it("quick login buttons route to their respective role views", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/login")) {
        const body = JSON.parse(String(init?.body || "{}")) as { username?: string };
        if (body.username === "kitchen@example.com") {
          return Promise.resolve(new Response(JSON.stringify({ access_token: makeToken("kitchen") }), { status: 200 }));
        }
        if (body.username === "foh@example.com") {
          return Promise.resolve(new Response(JSON.stringify({ access_token: makeToken("foh") }), { status: 200 }));
        }
        if (body.username === "online@example.com") {
          return Promise.resolve(new Response(JSON.stringify({ access_token: makeToken("online") }), { status: 200 }));
        }
      }
      if (url.includes("/ingredients")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/menu")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/admin/reservation-ttl")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ttl_seconds: 600,
              ttl_minutes: 10,
              min_minutes: 1,
              max_minutes: 15,
              warning_threshold_seconds: 30,
              warning_min_seconds: 5,
              warning_max_seconds: 120,
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const kitchenApp = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Kitchen" }));
    expect(await screen.findByRole("heading", { name: "Kitchen" })).toBeInTheDocument();
    expect(screen.getByText("Logged in as kitchen@example.com (Kitchen)")).toBeInTheDocument();
    kitchenApp.unmount();

    localStorage.clear();
    const fohApp = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: "FOH" }));
    expect(await screen.findByRole("heading", { name: "FOH ordering" })).toBeInTheDocument();
    expect(screen.getByText("Logged in as foh@example.com (FOH)")).toBeInTheDocument();
    fohApp.unmount();

    localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: "Online" }));
    expect(await screen.findByRole("heading", { name: "Online ordering" })).toBeInTheDocument();
  });

  it("shows Active Order nav link for online users and returns to /online from menu", async () => {
    const user = userEvent.setup();
    localStorage.setItem("accessToken", makeToken("online"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    render(
      <MemoryRouter initialEntries={["/menu"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    const activeOrderLink = await screen.findByRole("link", { name: "Active Order" });
    await user.click(activeOrderLink);
    expect(await screen.findByRole("heading", { name: "Online ordering" })).toBeInTheDocument();
  });

  it("shows Active Order nav link for foh users and returns to /online from menu", async () => {
    const user = userEvent.setup();
    localStorage.setItem("accessToken", makeToken("foh"));

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/admin/reservation-ttl")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ttl_seconds: 600,
              ttl_minutes: 10,
              min_minutes: 1,
              max_minutes: 15,
              warning_threshold_seconds: 30,
              warning_min_seconds: 5,
              warning_max_seconds: 120,
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    render(
      <MemoryRouter initialEntries={["/menu"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    const activeOrderLink = await screen.findByRole("link", { name: "Active Order" });
    await user.click(activeOrderLink);
    expect(await screen.findByRole("heading", { name: "FOH ordering" })).toBeInTheDocument();
  });

  it("hydrates cart from existing active reservation without sending immediate PATCH", async () => {
    localStorage.setItem("accessToken", makeToken("online"));
    localStorage.setItem("activeReservationId", "123");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 1, name: "Pizza", available: true, max_qty_available: 10 }]), { status: 200 })
        );
      }
      if (url.includes("/reservations/123") && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 123,
              status: "active",
              expires_at: new Date(Date.now() + 600_000).toISOString(),
              items: [{ menu_item_id: 1, qty: 2, notes: null }],
            }),
            { status: 200 }
          )
        );
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

    await screen.findByRole("button", { name: "Add Pizza" });
    expect(await screen.findByRole("button", { name: "Decrease Pizza" })).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 700));
    const patchCalls = fetchMock.mock.calls.filter(([input, init]) => {
      const url = String(input);
      const request = init as RequestInit | undefined;
      return url.includes("/reservations/123") && request?.method === "PATCH";
    });
    expect(patchCalls).toHaveLength(0);
  });

  it("auto-opens and turns red for foh when remaining time hits warning threshold", async () => {
    localStorage.setItem("accessToken", makeToken("foh"));
    localStorage.setItem("activeReservationId", "123");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/admin/reservation-ttl")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ttl_seconds: 600,
              ttl_minutes: 10,
              min_minutes: 1,
              max_minutes: 15,
              warning_threshold_seconds: 30,
              warning_min_seconds: 5,
              warning_max_seconds: 120,
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes("/reservations/123") && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 123,
              status: "active",
              expires_at: new Date(Date.now() + 20_000).toISOString(),
            }),
            { status: 200 }
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

    await screen.findByText("Hold expires in");
    expect(screen.getByRole("button", { name: "TTL" }).className).toContain("bg-red-700");
  });

  it("keeps pill closed when foh manually closes it under warning threshold", async () => {
    const user = userEvent.setup();
    localStorage.setItem("accessToken", makeToken("foh"));
    localStorage.setItem("activeReservationId", "123");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/admin/reservation-ttl")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ttl_seconds: 600,
              ttl_minutes: 10,
              min_minutes: 1,
              max_minutes: 15,
              warning_threshold_seconds: 30,
              warning_min_seconds: 5,
              warning_max_seconds: 120,
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes("/reservations/123") && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 123,
              status: "active",
              expires_at: new Date(Date.now() + 20_000).toISOString(),
            }),
            { status: 200 }
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

    await screen.findByText("Hold expires in");
    const ttlButton = screen.getByRole("button", { name: "TTL" });
    await user.click(ttlButton);
    await user.unhover(ttlButton);
    await waitFor(() => {
      expect(screen.queryByText("Hold expires in")).not.toBeInTheDocument();
    });
    expect(ttlButton.className).toContain("bg-red-100");
  });

  it("ends ordering session when active reservation becomes expired", async () => {
    localStorage.setItem("accessToken", makeToken("online"));
    localStorage.setItem("activeReservationId", "123");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/menu")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/admin/reservation-ttl")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ttl_seconds: 600,
              ttl_minutes: 10,
              min_minutes: 1,
              max_minutes: 15,
              warning_threshold_seconds: 30,
              warning_min_seconds: 5,
              warning_max_seconds: 120,
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes("/reservations/123") && !init?.method) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 123,
              status: "expired",
              expires_at: new Date(Date.now() - 5_000).toISOString(),
            }),
            { status: 200 }
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

    expect(
      await screen.findByText("Your reservation expired. Items were released. Please start a new order.")
    ).toBeInTheDocument();
    expect(localStorage.getItem("activeReservationId")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

});
