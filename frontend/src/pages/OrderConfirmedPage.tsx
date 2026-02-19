import { useNavigate } from "react-router-dom";
import type { UserRole } from "../auth/token";

export function OrderConfirmedPage({ role }: { role: UserRole | null }) {
  const navigate = useNavigate();
  const isFohFlow = role === "foh";

  return (
    <section className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-xl border bg-white p-8 text-center shadow">
        <h1 className="text-3xl font-bold text-slate-900">{isFohFlow ? "FOH order confirmed" : "Order confirmed"}</h1>
        <p className="mt-2 text-slate-600">{isFohFlow ? "Ticket sent. Thank you." : "Thank you."}</p>
        <button
          type="button"
          className="mt-8 rounded bg-blue-600 px-6 py-3 text-white"
          onClick={() => navigate("/online")}
        >
          {isFohFlow ? "New FOH Order" : "New Order"}
        </button>
      </div>
    </section>
  );
}
