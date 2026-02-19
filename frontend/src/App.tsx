import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { clearAuth, getCurrentUser, type UserRole } from "./auth/token";
import { LandingPage } from "./pages/LandingPage";
import { KitchenPage } from "./pages/KitchenPage";
import { FohPage } from "./pages/FohPage";
import { OnlinePage } from "./pages/OnlinePage";

function ProtectedRoute({ children, allow, role }: { children: JSX.Element; allow: UserRole[]; role: UserRole | null }) {
  const location = useLocation();

  if (!role || !allow.includes(role)) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}

function LandingRoute({ role }: { role: UserRole | null }) {
  if (role === "kitchen") {
    return <Navigate to="/kitchen" replace />;
  }
  if (role === "foh") {
    return <Navigate to="/foh" replace />;
  }
  if (role === "online") {
    return <Navigate to="/online" replace />;
  }

  return <LandingPage />;
}

function Shell({ children, role, email }: { children: JSX.Element; role: UserRole | null; email: string | null }) {
  const navigate = useNavigate();
  const roleLabel = role === "kitchen" ? "Kitchen" : role === "foh" ? "FOH" : "Online";

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-4">
        <nav className="flex items-center gap-2 rounded bg-white p-3 shadow">
          {role === "kitchen" ? <span className="text-sm">Kitchen</span> : null}
          {role === "foh" ? <span className="text-sm">FOH</span> : null}
          {role === "online" ? <span className="text-sm">Online</span> : null}
          {(role === "kitchen" || role === "foh") ? (
            <span className="text-sm text-slate-600">
              Logged in as {email || "staff"} ({roleLabel})
            </span>
          ) : null}
          {role ? (
            <button
              className="ml-auto rounded bg-slate-200 px-3 py-1 text-sm"
              onClick={() => {
                clearAuth();
                navigate("/");
              }}
            >
              Logout
            </button>
          ) : null}
        </nav>
        {children}
      </div>
    </main>
  );
}

export function AppRoutes() {
  const location = useLocation();
  const currentUser = getCurrentUser();
  const role = currentUser?.role || null;
  const email = currentUser?.email || null;

  return (
    <Routes location={location}>
      <Route path="/" element={<LandingRoute role={role} />} />
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute allow={["kitchen", "foh"]} role={role}>
            <Shell role={role} email={email}>
              <KitchenPage role={role} />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/foh"
        element={
          <ProtectedRoute allow={["kitchen", "foh"]} role={role}>
            <Shell role={role} email={email}>
              <FohPage />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/online"
        element={
          <ProtectedRoute allow={["online"]} role={role}>
            <Shell role={role} email={email}>
              <OnlinePage />
            </Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default AppRoutes;
