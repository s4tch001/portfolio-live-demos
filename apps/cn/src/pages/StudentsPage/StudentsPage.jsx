import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiFetch, queryPath } from '../../lib/apiClient.js';
import { onRealtime } from '../../lib/realtime.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useConfirm } from '../../context/ConfirmProvider.jsx';
import { useData } from '../../context/DataContext.jsx';
import { normalizeAccountStatus } from '../../lib/accountStatus.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import AccountActionsMenu from '../../components/ui/AccountActionsMenu.jsx';
import { SkeletonTableRows } from '../../components/ui/Skeleton.jsx';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll.js';
import StudentModal from './StudentModal.jsx';

// `embedded` renders just the list (no page-header/section) so the Accounts page
// can host it as a "Students" tab; `openAddSignal` is a counter the parent bumps
// to open the Add-Student modal from its own top button.
export default function StudentsPage({ embedded = false, openAddSignal = 0 }) {
  const toast = useToast();
  const showConfirm = useConfirm();
  const data = useData();
  const t = useT();

  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const searchTimer = useRef(null);

  const fetchStudents = useCallback(async (q) => {
    try {
      const list = await apiFetch(queryPath('/students', { search: q, limit: 100000 }));
      if (Array.isArray(list)) setStudents(list);
    } catch (e) {
      /* keep existing */
    } finally {
      setLoaded(true);
    }
  }, []);

  // Initial load: teachers (for handler dropdown + badge) + students.
  useEffect(() => {
    apiFetch('/teachers')
      .then((list) => setTeachers(Array.isArray(list) ? list : []))
      .catch(() => {});
    fetchStudents('');
  }, [fetchStudents]);

  // Debounced server search (legacy queueStudentSearchLoad, 250ms).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchStudents(query.trim()), 250);
    return () => clearTimeout(searchTimer.current);
  }, [query, fetchStudents]);

  // Live: another admin added/edited/removed a student → refresh this (server-
  // filtered) list using the current search. Teacher changes refresh handler names.
  const queryRef = useRef('');
  queryRef.current = query;
  useEffect(
    () =>
      onRealtime('sync', (msg) => {
        if (!msg) return;
        if (msg.resource === 'students') fetchStudents(queryRef.current.trim());
        else if (msg.resource === 'teachers') {
          apiFetch('/teachers').then((l) => Array.isArray(l) && setTeachers(l)).catch(() => {});
        }
      }),
    [fetchStudents],
  );

  // Client-side filter + sort (Active first, alphabetical) — legacy renderStudentsTable.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchStudent = (s) => {
      if (!q) return true;
      const handler = s.teacher_id ? teachers.find((t) => t.id == s.teacher_id) : null;
      return [s.name, s.notes, normalizeAccountStatus(s.status), handler?.fullname].some(
        (v) => String(v || '').toLowerCase().includes(q),
      );
    };
    return students
      .filter(matchStudent)
      .slice()
      .sort((a, b) => {
        const ai = normalizeAccountStatus(a.status) === 'Inactive' ? 1 : 0;
        const bi = normalizeAccountStatus(b.status) === 'Inactive' ? 1 : 0;
        if (ai !== bi) return ai - bi;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [students, teachers, query]);

  // Infinite scroll: reveal the (already-loaded) filtered rows a page at a time.
  const { visible: visibleStudents, hasMore, sentinelRef } = useInfiniteScroll(filtered, {
    pageSize: 30,
  });

  const totalLabel = useMemo(() => {
    if (query.trim()) return t('students.showingMatch', { n: filtered.length });
    return t('students.showing', { n: students.length });
  }, [filtered.length, students.length, query, t]);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  // Embedded mode: open only when the parent actually changes the signal.
  // Comparing with the initial value keeps React Strict Mode's mount-effect
  // replay from opening the modal as soon as /accounts/students loads.
  const previousAddSignal = useRef(openAddSignal);
  useEffect(() => {
    if (openAddSignal === previousAddSignal.current) return;
    previousAddSignal.current = openAddSignal;
    openAdd();
  }, [openAddSignal]);
  const openEdit = (s) => {
    setEditing(s);
    setModalOpen(true);
  };

  const saveStudent = useCallback(
    // `password` is optional (blank on edit = keep unchanged); `username` is the
    // student/parent login. Errors rethrow so StudentModal can flag the field.
    async ({ name, username, notes, teacher_id, password }) => {
      if (editing) {
        const status = normalizeAccountStatus(editing.status);
        const payload = { name, username, notes, teacher_id, status };
        if (password) payload.password = password;
        await apiFetch(`/students/${editing.id}`, 'PUT', payload);
        setStudents((prev) =>
          prev.map((s) =>
            s.id == editing.id ? { ...s, name, username, notes, teacher_id, status } : s,
          ),
        );
        data.upsertStudent({ id: editing.id, name, notes, teacher_id, status });
        toast(t('toast.studentUpdated'));
      } else {
        const res = await apiFetch('/students', 'POST', { name, username, notes, teacher_id, password, status: 'Active' });
        const row = { id: res.id, name, username, notes, teacher_id, status: 'Active' };
        setStudents((prev) => [...prev, row]);
        data.upsertStudent(row);
        toast(t('toast.studentAdded'));
      }
      setModalOpen(false);
    },
    [editing, toast, data, t],
  );

  const deleteStudent = useCallback(
    async (s) => {
      const ok = await showConfirm({
        title: t('students.deleteTitle'),
        lines: [{ label: t('common.name'), value: s.name || t('acct.noName') }],
        okText: t('common.delete'),
        danger: true,
      });
      if (!ok) return;
      try {
        await apiFetch(`/students/${s.id}`, 'DELETE');
        setStudents((prev) => prev.filter((x) => x.id != s.id));
        data.removeStudent(s.id);
        toast(t('toast.studentDeleted'));
      } catch (e) {
        toast(t('toast.studentDeleteErr'));
      }
    },
    [showConfirm, toast, data, t],
  );

  const setStudentStatus = useCallback(
    async (s, status) => {
      const safeStatus = ['Inactive', 'End of Contract'].includes(status) ? status : 'Active';
      try {
        await apiFetch(`/students/${s.id}`, 'PUT', {
          name: s.name,
          notes: s.notes || '',
          teacher_id: s.teacher_id || 0,
          status: safeStatus,
          // Explicit admin action pins the status so the 3-month auto rule won't flip it.
          status_source: 'manual',
        });
        setStudents((prev) =>
          prev.map((x) => (x.id == s.id ? { ...x, status: safeStatus } : x)),
        );
        data.upsertStudent({ id: s.id, status: safeStatus });
      } catch (e) {
        toast(t('toast.statusUpdateErr'));
      }
    },
    [toast, data, t],
  );

  const header = (
    <div className="page-header">
      <div>
        <div className="page-title">{t('students.title')}</div>
        <div className="page-sub">{t('students.subtitle')}</div>
      </div>
      <button className="btn btn-primary" onClick={openAdd}>
        + {t('students.add')}
      </button>
    </div>
  );

  const body = (
    <>
      <div className="filter-bar">
        <span className="filter-label">{totalLabel}</span>
        <input
          type="search"
          className="form-control"
          placeholder={t('students.searchPh')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="stack-cards">
            <thead>
              <tr>
                <th>{t('students.name')}</th>
                <th>{t('students.username')}</th>
                <th>{t('students.info')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {!loaded ? (
                <SkeletonTableRows columns={5} rows={6} />
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state">
                      <div className="empty-icon">
                        <i className="fa-solid fa-user-graduate" aria-hidden="true"></i>
                      </div>
                      <p>{t('students.empty')}</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state">
                      <div className="empty-icon">
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                      </div>
                      <p>{t('students.noMatch')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                {visibleStudents.map((s) => {
                  const handler = s.teacher_id
                    ? teachers.find((t) => t.id == s.teacher_id)
                    : null;
                  const status = normalizeAccountStatus(s.status);
                  // Action menu: Edit + status actions + Delete. Login Blocked (auto,
                  // after 5 failed logins) offers Unblock; End of Contract is an explicit
                  // "officially left" state; both reactivate via Set Active.
                  const statusActions =
                    status === 'Login Blocked'
                      ? [{ label: t('acct.unblock'), onClick: () => setStudentStatus(s, 'Active') }]
                      : status === 'End of Contract'
                      ? [{ label: t('acct.setStatus', { status: t('acctStatus.Active') }), onClick: () => setStudentStatus(s, 'Active') }]
                      : [
                          {
                            label: t('acct.setStatus', {
                              status: t(status === 'Active' ? 'acctStatus.Inactive' : 'acctStatus.Active'),
                            }),
                            onClick: () =>
                              setStudentStatus(s, status === 'Active' ? 'Inactive' : 'Active'),
                          },
                          {
                            label: t('acct.setStatus', { status: t('acctStatus.End of Contract') }),
                            onClick: () => setStudentStatus(s, 'End of Contract'),
                          },
                        ];
                  return (
                    <tr key={s.id}>
                      <td className="account-name-cell">
                        <span style={{ fontWeight: 600, wordBreak: 'break-word' }}>
                          {s.name}
                        </span>
                        {handler && (
                          <div style={{ marginTop: 4 }}>
                            <span
                              className="teacher-color-badge"
                              style={{ background: handler.color || '#2563eb' }}
                            >
                              {handler.fullname}
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 14 }} data-label={t('students.username')}>
                        {s.username ? (
                          <span style={{ fontFamily: 'monospace' }}>{s.username}</span>
                        ) : (
                          <span style={{ color: 'var(--text3)' }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 14 }} data-label={t('students.info')}>
                        {s.notes || '-'}
                      </td>
                      <td data-label={t('common.status')}>
                        <StatusBadge account={s} variant="account" />
                      </td>
                      <td className="account-actions-cell">
                        <AccountActionsMenu
                          ariaLabel={t('students.actions')}
                          actions={[
                            { label: t('common.edit'), onClick: () => openEdit(s) },
                            ...statusActions,
                            { label: t('common.delete'), danger: true, onClick: () => deleteStudent(s) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
                {hasMore && (
                  <tr ref={sentinelRef} aria-hidden="true">
                    <td colSpan="5" style={{ height: 1, padding: 0, border: 0 }} />
                  </tr>
                )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StudentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        student={editing}
        teachers={teachers}
        onSave={saveStudent}
      />
    </>
  );

  if (embedded) return body;
  return (
    <section className="page active" id="page-students">
      {header}
      {body}
    </section>
  );
}
