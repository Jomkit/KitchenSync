import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

type MenuItem = Record<string, unknown>;
type Ingredient = Record<string, unknown>;

const API_BASE_URL = "http://localhost:5000";

function App() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [lastPongAt, setLastPongAt] = useState<string>("not received");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const socket = useMemo<Socket>(() => io(API_BASE_URL), []);

  const fetchMenu = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/menu`);
    if (!response.ok) {
      throw new Error(`Failed to load menu (${response.status})`);
    }

    const data = (await response.json()) as MenuItem[];
    setMenu(data);
  }, []);

  const fetchIngredients = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/ingredients`);
    if (!response.ok) {
      throw new Error(`Failed to load ingredients (${response.status})`);
    }

    const data = (await response.json()) as Ingredient[];
    setIngredients(data);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      setErrorMessage("");
      await Promise.all([fetchMenu(), fetchIngredients()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh data";
      setErrorMessage(message);
    }
  }, [fetchIngredients, fetchMenu]);

  useEffect(() => {
    socket.on("connect", () => {
      setConnectionStatus("connected");
      socket.emit("ping", { source: "frontend" });
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    socket.on("pong", () => {
      setLastPongAt(new Date().toLocaleTimeString());
    });

    socket.on("stateChanged", () => {
      void refreshData();
    });

    void refreshData();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [refreshData, socket]);

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-bold">KitchenSync Dashboard</h1>

        <section className="rounded-lg bg-white p-4 shadow-sm">
          <p>
            Socket status: <span className="font-semibold">{connectionStatus}</span>
          </p>
          <p>
            Last pong: <span className="font-semibold">{lastPongAt}</span>
          </p>
          {errorMessage ? <p className="mt-2 text-red-600">{errorMessage}</p> : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold">Menu</h2>
            <pre className="overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(menu, null, 2)}
            </pre>
          </article>

          <article className="rounded-lg bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold">Ingredients</h2>
            <pre className="overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(ingredients, null, 2)}
            </pre>
          </article>
        </section>
      </div>
    </main>
  );
}

export default App;
