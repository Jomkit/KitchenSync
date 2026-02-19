import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { clearAuth, getCurrentRole, type UserRole } from "./auth/token";
import { LandingPage } from "./pages/LandingPage";
import { KitchenPage } from "./pages/KitchenPage";
import { FohPage } from "./pages/FohPage";
import { OnlinePage } from "./pages/OnlinePage";

function ProtectedRoute({ children, allow }: { children: JSX.Element; allow: UserRole[] }) {
  const role = getCurrentRole();
  const location = useLocation();

  if (!role || !allow.includes(role)) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}

function LandingRoute() {
  const role = getCurrentRole();
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

function Shell({ children }: { children: JSX.Element }) {
  const role = getCurrentRole();
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-4">
        <nav className="flex items-center gap-2 rounded bg-white p-3 shadow">
          {role === "kitchen" ? <span className="text-sm">Kitchen</span> : null}
          {role === "foh" ? <span className="text-sm">FOH</span> : null}
          {role === "online" ? <span className="text-sm">Online</span> : null}
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
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute allow={["kitchen", "foh"]}>
            <Shell>
              <KitchenPage role={getCurrentRole() as UserRole} />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/foh"
        element={
          <ProtectedRoute allow={["kitchen", "foh"]}>
            <Shell>
              <FohPage />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/online"
        element={
          <ProtectedRoute allow={["online"]}>
            <Shell>
              <OnlinePage />
            </Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default AppRoutes;
