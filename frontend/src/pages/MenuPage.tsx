import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../api/client";
import { readApiError } from "../api/errors";
import { useStateChangedRefetch } from "../realtime/useStateChangedRefetch";

type MenuItem = {
  id: number;
  name: string;
  available: boolean;
  low_stock: boolean;
  reason: string | null;
  ingredients?: string[];
};

export function MenuPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/menu");
      if (!response.ok) {
        setError(await readApiError(response, "Unable to load menu."));
        return;
      }
      const data = (await response.json()) as MenuItem[];
      setMenu(data);
      setError("");
    } catch {
      setError("Unable to load menu.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useStateChangedRefetch(load);

  return (
    <section>
      <h1 className="mb-3 text-xl font-bold">Menu</h1>
      {error ? <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {menu.map((item) => (
          <article key={item.id} className="rounded border bg-white p-3" title={item.reason || ""}>
            <p className="font-semibold">{item.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              Ingredients: {item.ingredients?.length ? item.ingredients.join(", ") : "N/A"}
            </p>
            {!item.available ? <p className="text-sm text-red-600">Unavailable</p> : null}
            {item.low_stock ? <p className="mt-2 inline-block rounded bg-yellow-200 px-2 py-1 text-xs">LOW STOCK</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
