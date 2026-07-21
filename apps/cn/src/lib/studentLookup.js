// Shared student-record resolution for display lookups (Username/Info shown
// beside student names). ID-first: a schedule row that carries `student_id`
// resolves to that exact student even when names are duplicated; unlinked rows
// (student_id 0/absent — old data, trial names) fall back to the exact name.
// Pure display concern — never used for writes.

// Find the student record behind a schedule-like row ({ student, student_id }).
export function findStudentForSchedule(students, sched) {
  if (!sched) return null;
  const list = Array.isArray(students) ? students : [];
  const sid = Number(sched.student_id) || 0;
  if (sid > 0) {
    const byId = list.find((s) => Number(s.id) === sid);
    if (byId) return byId;
  }
  return findStudentByName(list, sched.student);
}

// Exact-name (case/space-insensitive) fallback. First match wins — the same
// semantics the app had before schedules carried ids.
export function findStudentByName(students, name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  const list = Array.isArray(students) ? students : [];
  return list.find((s) => String(s.name || '').trim().toLowerCase() === key) || null;
}
