import { Navigate, Outlet } from 'react-router';
import { useAuth, defaultRouteFor } from '../../context/AuthContext.jsx';

// Block unauthenticated access — redirect to login.
export function RequireAuth() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

// Block non-matching roles — redirect to the user's default landing route.
export function RequireRole({ role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={defaultRouteFor(user)} replace />;
  return <Outlet />;
}

// Block students (China build) — they may only reach /schedule. Any other
// authed route bounces them back to their default landing.
export function RequireNotStudent() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'student') return <Navigate to={defaultRouteFor(user)} replace />;
  return <Outlet />;
}

// Permission gate. myPerm returns true while perms are still loading (legacy
// default-allow), so there's no flash; once loaded it enforces and redirects.
export function RequirePerm({ permKey }) {
  const { user, myPerm } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!myPerm(permKey)) return <Navigate to={defaultRouteFor(user)} replace />;
  return <Outlet />;
}

// Master-admin-only gate (devpau).
export function RequireMaster() {
  const { user, isMasterAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isMasterAdmin()) return <Navigate to={defaultRouteFor(user)} replace />;
  return <Outlet />;
}

// Catch-all redirect: authed → role default; logged-out → public landing.
export function IndexRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? defaultRouteFor(user) : '/'} replace />;
}

// Login route wrapper — if already authenticated, bounce to the default page.
export function LoginRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to={defaultRouteFor(user)} replace />;
  return children;
}

// Landing ("/") wrapper — a logged-in (incl. remember-me) user skips the landing
// and goes straight into the app; everyone else sees the public landing page.
export function LandingRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to={defaultRouteFor(user)} replace />;
  return children;
}
