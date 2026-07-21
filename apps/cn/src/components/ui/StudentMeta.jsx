// Small right-aligned meta shown beside a student's name in the suggestion
// dropdowns and picker modals: the student's login username and the admin's
// profile note (Students tab → Notes). "—" when either is not set.
export default function StudentMeta({ student }) {
  const username = String(student?.username || '').trim() || '—';
  const note = String(student?.notes || '').trim() || '—';
  return (
    <span className="student-meta" title={`${username} · ${note}`}>
      <span className="student-meta-line">
        <i className="fa-regular fa-user" aria-hidden="true"></i> {username}
      </span>
      <span className="student-meta-line">
        <i className="fa-regular fa-note-sticky" aria-hidden="true"></i> {note}
      </span>
    </span>
  );
}
