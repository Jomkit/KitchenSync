import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { LAST_ORDER_RECEIPT_KEY, type OrderReceipt } from "../pricing/receipt";
import { OrderConfirmedPage } from "./OrderConfirmedPage";

const receiptFixture: OrderReceipt = {
  lines: [
    {
      menu_item_id: 1,
      name: "Classic Burger",
      qty: 2,
      unit_price_cents: 1299,
      line_total_cents: 2598,
    },
    {
      menu_item_id: 2,
      name: "Fries",
      qty: 1,
      unit_price_cents: 899,
      line_total_cents: 899,
    },
  ],
  subtotal_cents: 3497,
  tax_rate_percent: 8,
  tax_cents: 280,
  tip_mode: "preset",
  tip_percent: 15,
  tip_cents: 525,
  grand_total_cents: 4302,
  created_at_iso: "2026-02-25T00:00:00.000Z",
};

describe("OrderConfirmedPage", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("renders receipt from route state", () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/online/confirmed", state: { receipt: receiptFixture } }]}>
        <Routes>
          <Route path="/online/confirmed" element={<OrderConfirmedPage role="online" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Receipt")).toBeInTheDocument();
    expect(screen.getByText("Classic Burger")).toBeInTheDocument();
    expect(screen.getByText("$43.02")).toBeInTheDocument();
  });

  it("renders receipt from session storage when route state missing", () => {
    sessionStorage.setItem(LAST_ORDER_RECEIPT_KEY, JSON.stringify(receiptFixture));
    render(
      <MemoryRouter initialEntries={["/online/confirmed"]}>
        <Routes>
          <Route path="/online/confirmed" element={<OrderConfirmedPage role="online" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Classic Burger")).toBeInTheDocument();
    expect(screen.getByText("$43.02")).toBeInTheDocument();
  });

  it("shows fallback message when receipt is unavailable", () => {
    render(
      <MemoryRouter initialEntries={["/online/confirmed"]}>
        <Routes>
          <Route path="/online/confirmed" element={<OrderConfirmedPage role="online" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("No recent receipt available.")).toBeInTheDocument();
  });
});
