import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { UserRole } from "../auth/token";
import { formatCents } from "../pricing/calc";
import { LAST_ORDER_RECEIPT_KEY, type OrderReceipt } from "../pricing/receipt";

export function OrderConfirmedPage({ role }: { role: UserRole | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isFohFlow = role === "foh";
  const receipt = useMemo(() => {
    const routeState = location.state as { receipt?: OrderReceipt } | null;
    if (routeState?.receipt) {
      return routeState.receipt;
    }
    const raw = sessionStorage.getItem(LAST_ORDER_RECEIPT_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as OrderReceipt;
    } catch {
      return null;
    }
  }, [location.state]);

  return (
    <section className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-xl border bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-slate-900">{isFohFlow ? "FOH order confirmed" : "Order confirmed"}</h1>
        <p className="mt-2 text-slate-600">{isFohFlow ? "Ticket sent. Thank you." : "Thank you."}</p>
        {receipt ? (
          <div className="mt-6 rounded border border-slate-200 p-4">
            <h2 className="text-left text-lg font-semibold text-slate-900">Receipt</h2>
            <ul className="mt-3 space-y-2">
              {receipt.lines.map((line) => (
                <li key={line.menu_item_id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="text-left">
                    <p className="font-medium text-slate-900">{line.name}</p>
                    <p className="text-slate-500">
                      {line.qty} x {formatCents(line.unit_price_cents)}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">{formatCents(line.line_total_cents)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-slate-200 pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatCents(receipt.subtotal_cents)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Tax ({receipt.tax_rate_percent}%)</span>
                <span>{formatCents(receipt.tax_cents)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Tip</span>
                <span>{formatCents(receipt.tip_cents)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 font-semibold">
                <span>Total</span>
                <span>{formatCents(receipt.grand_total_cents)}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded bg-slate-100 p-3 text-sm text-slate-600">No recent receipt available.</p>
        )}
        <button
          type="button"
          className="mt-8 rounded bg-blue-600 px-6 py-3 text-white"
          onClick={() => {
            sessionStorage.removeItem(LAST_ORDER_RECEIPT_KEY);
            navigate("/online");
          }}
        >
          {isFohFlow ? "New FOH Order" : "New Order"}
        </button>
      </div>
    </section>
  );
}
