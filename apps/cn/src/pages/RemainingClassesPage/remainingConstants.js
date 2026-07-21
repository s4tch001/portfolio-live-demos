// Remaining Classes constants — ported from legacy app.js.

// `labelKey` → i18n key (translated at render). English `label` kept as a
// fallback for any non-UI consumer.
export const PERM_LABELS = {
  view_classes: 'Access Classes Tab',
  view_modify: 'Access Modify Remaining Classes',
  view_remaining: 'Access Remaining Classes',
  view_receipts: 'Access Receipts',
  view_yearly: 'Access Annual Report',
  view_permissions: 'Access Permissions',
  view_logs: 'Access Activity Logs',
  notify_low_balance: 'Receive Low Balance Alerts',
};
export const PERM_LABEL_KEYS = {
  view_classes: 'rperm.view_classes',
  view_modify: 'rperm.view_modify',
  view_remaining: 'rperm.view_remaining',
  view_receipts: 'rperm.view_receipts',
  view_yearly: 'rperm.view_yearly',
  view_permissions: 'rperm.view_permissions',
  view_logs: 'rperm.view_logs',
  notify_low_balance: 'rperm.notify_low_balance',
};

export const DEV_TABLES = [
  { table: 'students', label: 'Students', labelKey: 'rdev.tblStudents', icon: 'fa-user-graduate' },
  { table: 'teachers', label: 'Teachers (Accounts)', labelKey: 'rdev.tblTeachers', icon: 'fa-chalkboard-user' },
  { table: 'schedules', label: 'Schedules', labelKey: 'rdev.tblSchedules', icon: 'fa-calendar-days' },
  { table: 'reports', label: 'Class Reports', labelKey: 'rdev.tblReports', icon: 'fa-file-lines' },
  { table: 'report_drafts', label: 'Report Drafts', labelKey: 'rdev.tblDrafts', icon: 'fa-pen' },
  { table: 'class_transactions', label: 'Class Transactions (Receipts)', labelKey: 'rdev.tblTxns', icon: 'fa-receipt' },
  { table: 'class_usage', label: 'Class Usage', labelKey: 'rdev.tblUsage', icon: 'fa-list-check' },
  { table: 'notifications', label: 'Notifications', labelKey: 'rdev.tblNotifs', icon: 'fa-bell' },
  { table: 'logs', label: 'Activity Logs', labelKey: 'rdev.tblLogs', icon: 'fa-clipboard-list' },
  { table: 'sessions', label: 'Sessions (Logins / Remember Me)', labelKey: 'rdev.tblSessions', icon: 'fa-key' },
];

// Sub-tabs in display order, each gated by a permission key (devtools = master).
// Mirrors the legacy ensureAllowedRemainingTab order.
export const REMAINING_TABS = [
  { id: 'modify', label: 'Modify Remaining Classes', labelKey: 'rtab.modify', perm: 'view_modify', icon: 'fa-pen-to-square' },
  { id: 'view', label: 'View Remaining Classes', labelKey: 'rtab.view', perm: 'view_remaining', icon: 'fa-list-check' },
  { id: 'receipts', label: 'View Receipts', labelKey: 'rtab.receipts', perm: 'view_receipts', icon: 'fa-receipt' },
  { id: 'yearly', label: 'Annual Report', labelKey: 'rtab.yearly', perm: 'view_yearly', icon: 'fa-chart-line' },
  { id: 'permissions', label: 'Permissions', labelKey: 'rtab.permissions', perm: 'view_permissions', icon: 'fa-user-shield' },
  { id: 'devtools', label: 'Dev Tools', labelKey: 'rtab.devtools', master: true, icon: 'fa-screwdriver-wrench' },
];
