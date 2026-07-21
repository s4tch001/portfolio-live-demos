// Central nav definition shared by Sidebar + MobileNav. Mirrors the legacy
// sidebar items (index.html:293-360) and buildMobileNav (app.js:1531-1581).
// Sidebar uses the long label; mobile uses the short one.
export const NAV_ITEMS = [
  // Students is now a tab inside the Accounts page (/accounts/students), so it
  // no longer has its own top-level nav item. The /accounts link redirects to
  // /accounts/teachers and stays highlighted across all sub-tabs.
  { id: 'accounts', path: '/accounts', icon: 'fa-users', sidebarKey: 'nav.accounts', mobileKey: 'nav.accounts', adminOnly: true },
  { id: 'schedule', path: '/schedule', icon: 'fa-calendar-days', sidebarKey: 'nav.schedule', mobileKey: 'nav.schedule', adminOnly: false },
  { id: 'reports', path: '/reports', icon: 'fa-chart-column', sidebarKey: 'nav.reports', mobileKey: 'nav.reportsShort', adminOnly: true },
  { id: 'lesson-tracker', path: '/lesson-tracker', icon: 'fa-table-list', sidebarKey: 'nav.lessonTracker', mobileKey: 'nav.trackerShort', adminOnly: false },
  { id: 'remaining-classes', path: '/remaining-classes', icon: 'fa-clock', sidebarKey: 'nav.remaining', mobileKey: 'nav.remainingShort', adminOnly: true, permKey: 'view_classes' },
  // master: devpau only — same flag the Dev Tools sub-tab uses (remainingConstants.js).
  // Not a permKey: admin permissions default to allowed, so a new key would hand
  // this to every existing admin.
  { id: 'security', path: '/security', icon: 'fa-shield-halved', sidebarKey: 'nav.security', mobileKey: 'nav.securityShort', adminOnly: true, master: true },
];

// Filter to the items the current user may see (role + permission gated).
// Students (China build) only ever see the Schedule tab.
// isMaster defaults to "not master" so existing callers keep working — the nav is
// cosmetic anyway; the server gates the data.
export function visibleNavItems(user, myPerm, isMaster = () => false) {
  const isAdmin = !!user && user.role === 'admin';
  const isStudent = !!user && user.role === 'student';
  return NAV_ITEMS.filter((it) => {
    if (isStudent) return it.id === 'schedule';
    if (it.adminOnly && !isAdmin) return false;
    if (it.master && !isMaster()) return false;
    if (it.permKey && !myPerm(it.permKey)) return false;
    return true;
  });
}
