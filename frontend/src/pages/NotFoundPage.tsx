import { useNavigate } from "react-router-dom";

import type { UserRole } from "../auth/token";

export function NotFoundPage({ role }: { role: UserRole | null }) {
  const navigate = useNavigate();
  const isAuthenticated = Boolean(role);
  const defaultPath = role === "kitchen" ? "/kitchen" : role === "foh" || role === "online" ? "/online" : "/";

  return (
    <section className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-xl border bg-white p-8 text-center shadow">
        <h1 className="text-3xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-slate-600">
          The page you requested does not exist or has moved.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="rounded bg-blue-600 px-6 py-3 text-white"
            onClick={() => navigate(defaultPath)}
          >
            {isAuthenticated ? "Go to dashboard" : "Go to home"}
          </button>
          <button
            type="button"
            className="rounded bg-slate-200 px-6 py-3 text-slate-800"
            onClick={() => navigate(-1)}
          >
            Go back
          </button>
        </div>
      </div>
    </section>
  );
}
