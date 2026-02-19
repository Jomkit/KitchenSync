import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../api/client";
import { parseTokenRole, setToken } from "../auth/token";

const DEMO_USERS = {
  online: { username: "online@example.com", password: "pass" },
  kitchen: { username: "kitchen@example.com", password: "pass" },
  foh: { username: "foh@example.com", password: "pass" },
};

export function LandingPage() {
  return <LandingPageContent isAuthenticated={false} role={null} />;
}

export function LandingPageContent({
  isAuthenticated,
  role,
}: {
  isAuthenticated: boolean;
  role: "kitchen" | "foh" | "online" | null;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isStaff = role === "kitchen" || role === "foh";
  const showOrderOnline = !isAuthenticated || !isStaff;
  const showStaffQuickButtons = !isAuthenticated;

  const quickLogin = async (role: keyof typeof DEMO_USERS) => {
    setError("");
    setNotice("");
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
    const tokenRole = parseTokenRole(data.access_token);
    if (!tokenRole) {
      setError("Unable to read role from access token");
      return;
    }

    if (tokenRole !== role) {
      setNotice(`Logged in as ${tokenRole.toUpperCase()} and redirected accordingly.`);
    }
    const destination = tokenRole === "foh" ? "/online" : `/${tokenRole}`;
    navigate(destination);
  };

  return (
    <section className="min-h-[70vh] bg-slate-50 p-4">
      <div className="mx-auto max-w-xl rounded bg-white p-4 shadow">
        {!isAuthenticated ? (
          <div className="mb-4 flex justify-end">
            <button className="text-sm text-slate-600">Sign up</button>
          </div>
        ) : null}
        <h1 className="mb-3 text-2xl font-bold">KitchenSync</h1>
        {showOrderOnline ? (
          <button className="mb-3 w-full rounded bg-blue-600 p-2 text-white" onClick={() => void quickLogin("online")}>Order online</button>
        ) : null}
        {showStaffQuickButtons ? (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button className="rounded bg-slate-200 p-2" onClick={() => void quickLogin("kitchen")}>Kitchen</button>
              <button className="rounded bg-slate-200 p-2" onClick={() => void quickLogin("foh")}>FOH</button>
              <button className="rounded bg-slate-200 p-2" onClick={() => void quickLogin("online")}>Online</button>
            </div>
          </>
        ) : (
          <p className="text-slate-600">Use the navigation bar to access your available views.</p>
        )}
        {notice ? <p className="mt-3 text-amber-700">{notice}</p> : null}
        {error ? <p className="mt-3 text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
