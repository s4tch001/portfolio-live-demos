// Displayed in the app header. Not tied to a member record — edit this string
// directly if the name ever needs to change.
export const SENIOR_PASTOR_NAME = 'Pastor Sherwin';

// District Leaders are hardcoded, not member rows -- they don't use this
// site. Each Leader in the member directory is manually assigned to one of
// these two. Order matters: Pastor Sherwin displays before Ate Anj.
export const DISTRICT_LEADERS = [
  { id: 'pastor-sherwin', name: SENIOR_PASTOR_NAME },
  { id: 'ate-anj', name: 'Ate Anj' },
];
