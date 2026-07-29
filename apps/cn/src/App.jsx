import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { LanguageProvider } from './i18n/LanguageProvider.jsx';
import { ThemeProvider } from './context/ThemeProvider.jsx';
import { ToastProvider } from './context/ToastProvider.jsx';
import { ConfirmProvider } from './context/ConfirmProvider.jsx';
import { NotificationsProvider } from './context/NotificationsProvider.jsx';
import { DataProvider } from './context/DataContext.jsx';
import { MaintenanceProvider, useMaintenance } from './context/MaintenanceProvider.jsx';
import OfflineIndicator from './components/Layout/OfflineIndicator.jsx';
import MaintenancePage from './pages/public/MaintenancePage.jsx';
import {
  RequireAuth,
  RequireRole,
  RequireNotStudent,
  RequirePerm,
  RequireMaster,
  IndexRedirect,
  LoginRoute,
  LandingRoute,
} from './components/guards/index.jsx';

import LandingPage from './pages/public/LandingPage.jsx';

const AppShell = lazy(() => import('./components/Layout/AppShell.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage.jsx'));
const PrivacyPolicy = lazy(() => import('./pages/public/PrivacyPolicy.jsx'));
const TermsOfService = lazy(() => import('./pages/public/TermsOfService.jsx'));
const SchedulePage = lazy(() => import('./pages/SchedulePage/SchedulePage.jsx'));
const StudentSchedulePage = lazy(() => import('./pages/StudentHome/StudentSchedulePage.jsx'));
const LessonTrackerPage = lazy(() => import('./pages/LessonTrackerPage/LessonTrackerPage.jsx'));
const AccountsPage = lazy(() => import('./pages/AccountsPage/AccountsPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage/ReportsPage.jsx'));
const RemainingClassesPage = lazy(() => import('./pages/RemainingClassesPage/RemainingClassesPage.jsx'));
const SecurityPage = lazy(() => import('./pages/SecurityPage/SecurityPage.jsx'));
const PUBLIC_PATHS = new Set(['/', '/login', '/privacy', '/terms']);

// /schedule serves two very different pages by role: students/parents get a
// simple placeholder; admins/teachers get the full scheduling UI. A wrapper
// (not a conditional inside SchedulePage) keeps hook order stable per component.
function ScheduleRoute() {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentSchedulePage />;
  return <SchedulePage />;
}

// Accounts tabs live in the path (/accounts/teachers|admins|students). Bare
// /accounts (or a legacy ?tab= deep link) redirects to the right sub-path.
const ACCOUNT_TABS = ['teachers', 'admins', 'students'];
function AccountsIndexRedirect() {
  const [sp] = useSearchParams();
  const legacy = sp.get('tab');
  const tab = ACCOUNT_TABS.includes(legacy) ? legacy : 'admins';
  return <Navigate to={'/accounts/' + tab} replace />;
}

// When maintenance is ON, show the maintenance page to EVERYONE except devpau —
// for EVERY route, including the landing page (/), /login and the legal pages.
// A logged-out devpau therefore can't reach /login during maintenance; recover
// with tool.ps1 → "Maintenance mode" (toggles it off server-side). Rendered
// directly (not a redirect) so it can't race the auth guard, and the URL is
// preserved for when maintenance ends.
function AppBody() {
  const { maintenance, ready } = useMaintenance();
  const { isMasterAdmin } = useAuth();
  const { pathname } = useLocation();
  const devpau = isMasterAdmin();
  if (!devpau) {
    // Show maintenance immediately when we know (or last knew) it's on — no flash.
    // Every path is gated; only a logged-in devpau (e.g. Remember Me) gets through.
    if (maintenance) return <MaintenancePage />;
    // Keep authenticated routes gated until the status is confirmed. Public
    // pages may paint immediately and will switch to maintenance if it is on;
    // this avoids holding their first render behind a network round trip.
    if (!ready && !PUBLIC_PATHS.has(pathname)) {
      return (
        <div style={{ position: 'fixed', inset: 'var(--portfolio-demo-notice-height, 0px) 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
          <span className="spinner" aria-label="Loading"></span>
        </div>
      );
    }
  }
  return (
    <Suspense
      fallback={
        <div
          style={{
            alignItems: 'center',
            background: 'var(--bg)',
            display: 'flex',
            inset: 'var(--portfolio-demo-notice-height, 0px) 0 0',
            justifyContent: 'center',
            position: 'fixed',
          }}
        >
          <span className="spinner" aria-label="Loading"></span>
        </div>
      }
    >
      <Routes>
      {/* Public — accessible without login. */}
      <Route
        path="/"
        element={
          <LandingRoute>
            <LandingPage />
          </LandingRoute>
        }
      />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route
        path="/login"
        element={
          <LoginRoute>
            <LoginPage />
          </LoginRoute>
        }
      />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {/* Schedule: students get a placeholder, admin/teacher get the real view */}
          <Route path="/schedule" element={<ScheduleRoute />} />

          {/* Admin + teacher (students blocked) */}
          <Route element={<RequireNotStudent />}>
            <Route path="/lesson-tracker" element={<LessonTrackerPage />} />
          </Route>

          {/* Admin only */}
          <Route element={<RequireRole role="admin" />}>
            {/* Tabs are path-based: /accounts/teachers|admins|students. Bare
                /accounts (or a legacy ?tab= link) redirects to a sub-path. */}
            <Route path="/accounts" element={<AccountsIndexRedirect />} />
            <Route path="/accounts/:tab" element={<AccountsPage />} />
            {/* Students merged into the Accounts page as a tab — keep the old
                path working by redirecting to that tab. */}
            <Route path="/students" element={<Navigate to="/accounts/students" replace />} />
            <Route path="/reports" element={<ReportsPage />} />

            {/* Admin + view_classes permission */}
            <Route element={<RequirePerm permKey="view_classes" />}>
              <Route
                path="/remaining-classes/*"
                element={<RemainingClassesPage />}
              />
            </Route>

            {/* Master admin (devpau) only. This guard is UX — it redirects the
                wrong user away; the /dev/security endpoints do the real gating. */}
            <Route element={<RequireMaster />}>
              <Route path="/security" element={<SecurityPage />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<IndexRedirect />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <NotificationsProvider>
              <DataProvider>
                <MaintenanceProvider>
                <OfflineIndicator />
                <BrowserRouter>
                <AppBody />
                </BrowserRouter>
                </MaintenanceProvider>
              </DataProvider>
            </NotificationsProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
