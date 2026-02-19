import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../api/client";
import { setToken } from "../auth/token";

const DEMO_USERS = {
  online: { username: "online@example.com", password: "pass" },
  kitchen: { username: "kitchen@example.com", password: "pass" },
  foh: { username: "foh@example.com", password: "pass" },
};

export function LandingPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const quickLogin = async (role: keyof typeof DEMO_USERS) => {
    setError("");
    const response = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify(DEMO_USERS[role]),
    });

    if (!response.ok) {
      setError("Unable to login demo user");
      return;
    }

    const data = (await response.json()) as { access_token: string };
    setToken(data.access_token);
    navigate(`/${role}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-xl rounded bg-white p-4 shadow">
        <div className="mb-4 flex justify-end">
          <button className="text-sm text-slate-600">Sign up</button>
        </div>
        <h1 className="mb-3 text-2xl font-bold">KitchenSync</h1>
        <button className="mb-3 w-full rounded bg-blue-600 p-2 text-white" onClick={() => void quickLogin("online")}>Order online</button>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button className="rounded bg-slate-200 p-2" onClick={() => void quickLogin("kitchen")}>Kitchen</button>
          <button className="rounded bg-slate-200 p-2" onClick={() => void quickLogin("foh")}>FOH</button>
          <button className="rounded bg-slate-200 p-2" onClick={() => void quickLogin("online")}>Online</button>
        </div>
        {error ? <p className="mt-3 text-red-600">{error}</p> : null}
      </div>
    </main>
  );
}
