import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { clearAuth, getCurrentUser, type UserRole } from "./auth/token";
import { ReservationExpiryPill } from "./components/ReservationExpiryPill";
import { LandingPage, LandingPageContent } from "./pages/LandingPage";
import { KitchenPage } from "./pages/KitchenPage";
import { FohPage } from "./pages/FohPage";
import { OnlinePage } from "./pages/OnlinePage";
import { OrderConfirmedPage } from "./pages/OrderConfirmedPage";
import { MenuPage } from "./pages/MenuPage";

function ProtectedRoute({ children, allow, role }: { children: JSX.Element; allow: UserRole[]; role: UserRole | null }) {
  const location = useLocation();

  if (!role || !allow.includes(role)) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}

function LandingRoute({ role }: { role: UserRole | null }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  if (searchParams.get("landing") === "1") {
    if (role) {
      const currentUser = getCurrentUser();
      return (
        <Shell role={role} email={currentUser?.email || null}>
          <LandingPageContent isAuthenticated role={role} />
        </Shell>
      );
    }
    return <LandingPage />;
  }

  if (role === "kitchen") {
    return <Navigate to="/kitchen" replace />;
  }
  if (role === "foh") {
    return <Navigate to="/online" replace />;
  }
  if (role === "online") {
    return <Navigate to="/online" replace />;
  }

  return <LandingPage />;
}

function Shell({ children, role, email }: { children: JSX.Element; role: UserRole | null; email: string | null }) {
  const navigate = useNavigate();
  const roleLabel = role === "kitchen" ? "Kitchen" : role === "foh" ? "FOH" : "Online";
  const isStaff = role === "kitchen" || role === "foh";
  const canAccessOnlineOrdering = role === "online" || role === "foh";
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `rounded px-3 py-1 text-sm ${isActive ? "bg-slate-200 font-medium" : "text-slate-700 hover:bg-slate-100"}`;

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
      {role ? <ReservationExpiryPill role={role} /> : null}
      <div className="mx-auto max-w-6xl space-y-4">
        <nav className="flex items-center gap-2 rounded bg-white p-3 shadow">
          <NavLink to="/?landing=1" className={navItemClass}>
            Home
          </NavLink>
          {isStaff ? (
            <NavLink to="/kitchen" className={navItemClass}>
              Kitchen
            </NavLink>
          ) : null}
          {isStaff ? (
            <NavLink to="/foh" className={navItemClass}>
              FOH
            </NavLink>
          ) : null}
          <NavLink to="/menu" className={navItemClass}>
            Menu
          </NavLink>
          {canAccessOnlineOrdering ? (
            <NavLink to="/online" className={navItemClass}>
              Active Order
            </NavLink>
          ) : null}
          {isStaff ? (
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
              <FohPage role={role} />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/online"
        element={
          <ProtectedRoute allow={["online", "foh"]} role={role}>
            <Shell role={role} email={email}>
              <OnlinePage role={role} />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/online/confirmed"
        element={
          <ProtectedRoute allow={["online", "foh"]} role={role}>
            <Shell role={role} email={email}>
              <OrderConfirmedPage role={role} />
            </Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/menu"
        element={
          <ProtectedRoute allow={["kitchen", "foh", "online"]} role={role}>
            <Shell role={role} email={email}>
              <MenuPage />
            </Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default AppRoutes;
