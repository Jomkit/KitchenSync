import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../api/client";
import { useStateChangedRefetch } from "../realtime/useStateChangedRefetch";

type MenuItem = {
  id: number;
  name: string;
  available: boolean;
  low_stock: boolean;
  reason: string | null;
  ingredients?: string[];
};

export function FohPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);

  const load = useCallback(async () => {
    const response = await apiFetch("/menu");
    const data = (await response.json()) as MenuItem[];
    setMenu(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useStateChangedRefetch(load);

  return (
    <section>
      <h1 className="mb-3 text-xl font-bold">Front of house</h1>
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
