import { useNavigate } from "react-router-dom";

export function AppCrashedPage() {
  const navigate = useNavigate();

  return (
    <section className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-900">
      <div className="w-full max-w-lg rounded-xl border bg-white p-8 text-center shadow">
        <h1 className="text-3xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-slate-600">
          An unexpected error occurred. You can refresh and continue, or return home.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            type="button"
            className="rounded bg-blue-600 px-6 py-3 text-white"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
          <button
            type="button"
            className="rounded bg-slate-200 px-6 py-3"
            onClick={() => navigate("/")}
          >
            Go home
          </button>
        </div>
      </div>
    </section>
  );
}
