import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/apiClient.js';
import { onRealtime } from '../../lib/realtime.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useConfirm } from '../../context/ConfirmProvider.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import {
  normalizeAccountStatus,
  compareAccountsForList,
} from '../../lib/accountStatus.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import AccountActionsMenu from '../../components/ui/AccountActionsMenu.jsx';
import { SkeletonTableRows } from '../../components/ui/Skeleton.jsx';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll.js';
import TeacherModal from './TeacherModal.jsx';
import AdminModal from './AdminModal.jsx';
import StudentsPage from '../StudentsPage/StudentsPage.jsx';

function accountMatchesSearch(account, query) {
  if (!query) return true;
  const status = normalizeAccountStatus(account?.status);
  return [account?.fullname, account?.username, status].some((v) =>
    String(v || '').toLowerCase().includes(query),
  );
}

const codeStyle = {
  background: 'var(--surface2)',
  padding: '3px 8px',
  borderRadius: 5,
  fontSize: 13,
};

export default function AccountsPage() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const { user } = useAuth();
  const data = useData();
  // NOTE: this file uses `t`/`a` as the teacher/admin row objects, so the
  // translator is aliased `tr` here to avoid shadowing.
  const tr = useT();

  // Localized "Unblock Account" / "Set Active|Inactive" action label (was the
  // shared accountStatusActionLabel, now translated inline).
  const statusActionLabel = (status, nextStatus) =>
    status === 'Login Blocked' && nextStatus === 'Active'
      ? tr('acct.unblock')
      : tr('acct.setStatus', { status: tr('acctStatus.' + nextStatus) });

  const [teachers, setTeachers] = useState([]);
  const [admins, setAdmins] = useState([]);
  // Active tab lives in the URL path (/accounts/:tab) so it survives a refresh
  // and deep-links. Tab-bar order is Admins · Teachers · Students (display only).
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const TABS = ['teachers', 'admins', 'students'];
  const tab = TABS.includes(tabParam) ? tabParam : 'admins';
  const setTab = (next) => navigate('/accounts/' + next, { replace: true });
  // Normalize an unknown /accounts/:tab to the default sub-path (Admins).
  useEffect(() => {
    if (tabParam && !TABS.includes(tabParam)) navigate('/accounts/admins', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);
  // Bumped by the "+ Add Student" button to open the embedded StudentsPage modal.
  const [studentsAddTick, setStudentsAddTick] = useState(0);
  const [teacherQuery, setTeacherQuery] = useState('');
  const [adminQuery, setAdminQuery] = useState('');
  const [teacherModal, setTeacherModal] = useState({ open: false, editing: null });
  const [adminModal, setAdminModal] = useState({ open: false, editing: null });
  const [loaded, setLoaded] = useState(false);

  const loadAccounts = useCallback(() => {
    return Promise.all([apiFetch('/teachers'), apiFetch('/admins')])
      .then(([t, a]) => {
        if (Array.isArray(t)) setTeachers(t);
        if (Array.isArray(a)) setAdmins(a);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Live: another admin added/edited/removed a teacher or admin account → refresh.
  useEffect(
    () =>
      onRealtime('sync', (msg) => {
        if (msg && (msg.resource === 'teachers' || msg.resource === 'admins')) loadAccounts();
      }),
    [loadAccounts],
  );

  const usernameTaken = useCallback(
    (role, username, editId) => {
      const normalized = String(username || '').trim().toLowerCase();
      if (!normalized) return false;
      const idValue = String(editId || '');
      const teacherHit = teachers.some(
        (t) =>
          String(t.username || '').trim().toLowerCase() === normalized &&
          (role !== 'teacher' || String(t.id) !== idValue),
      );
      const adminHit = admins.some(
        (a) =>
          String(a.username || '').trim().toLowerCase() === normalized &&
          (role !== 'admin' || String(a.id) !== idValue),
      );
      return teacherHit || adminHit;
    },
    [teachers, admins],
  );

  const filteredTeachers = useMemo(() => {
    const q = teacherQuery.trim().toLowerCase();
    return (q ? teachers.filter((t) => accountMatchesSearch(t, q)) : teachers)
      .slice()
      .sort(compareAccountsForList);
  }, [teachers, teacherQuery]);

  // The master admin (devpau) is never shown in the Accounts list (it can't be
  // managed here). Filtered at display only, so the username-uniqueness check
  // above still sees it.
  const visibleAdmins = useMemo(
    () => admins.filter((a) => String(a.username || '').trim().toLowerCase() !== 'devpau'),
    [admins],
  );

  const filteredAdmins = useMemo(() => {
    const q = adminQuery.trim().toLowerCase();
    return (q ? visibleAdmins.filter((a) => accountMatchesSearch(a, q)) : visibleAdmins)
      .slice()
      .sort(compareAccountsForList);
  }, [visibleAdmins, adminQuery]);

  // Infinite scroll: reveal each (already-loaded) filtered list a page at a time.
  const teacherScroll = useInfiniteScroll(filteredTeachers, { pageSize: 30 });
  const adminScroll = useInfiniteScroll(filteredAdmins, { pageSize: 30 });

  // ---- Teacher mutations ----
  const saveTeacher = useCallback(
    async (payload, isEdit) => {
      if (isEdit) {
        const id = teacherModal.editing.id;
        await apiFetch(`/teachers/${id}`, 'PUT', payload);
        setTeachers((prev) =>
          prev.map((t) => (t.id == id ? { ...t, ...payload, id } : t)),
        );
        data.upsertTeacher({ ...payload, id });
        toast(tr('toast.teacherUpdated'));
      } else {
        const res = await apiFetch('/teachers', 'POST', payload);
        const row = { ...payload, id: res && res.id ? res.id : Date.now() };
        setTeachers((prev) => [...prev, row]);
        data.upsertTeacher(row);
        toast(tr('toast.teacherAdded'));
      }
      setTeacherModal({ open: false, editing: null });
    },
    [teacherModal.editing, toast, data],
  );

  const setTeacherStatus = useCallback(
    async (t, status) => {
      const previousStatus = normalizeAccountStatus(t.status);
      const safeStatus = normalizeAccountStatus(status);
      try {
        await apiFetch(`/teachers/${t.id}`, 'PUT', {
          username: t.username,
          fullname: t.fullname,
          color: t.color || '#2563eb',
          status: safeStatus,
        });
        setTeachers((prev) => prev.map((x) => (x.id == t.id ? { ...x, status: safeStatus } : x)));
        data.upsertTeacher({ id: t.id, status: safeStatus });
        toast(
          previousStatus === 'Login Blocked' && safeStatus === 'Active'
            ? tr('toast.teacherUnblocked')
            : tr('toast.teacherMarked', { status: tr('acctStatus.' + safeStatus) }),
        );
      } catch (e) {
        toast(tr('toast.teacherStatusErr'));
      }
    },
    [toast, data],
  );

  const deleteTeacher = useCallback(
    async (t) => {
      const ok = await showConfirm({
        title: tr('acct.deleteTeacherTitle'),
        lines: [
          { label: tr('common.username'), value: t.username || tr('acct.noUsername') },
          { label: tr('common.name'), value: t.fullname || tr('acct.noName') },
        ],
        okText: tr('common.delete'),
        danger: true,
      });
      if (!ok) return;
      try {
        await apiFetch(`/teachers/${t.id}`, 'DELETE');
        setTeachers((prev) => prev.filter((x) => x.id !== t.id));
        data.removeTeacher(t.id);
        toast(tr('toast.teacherDeleted'));
      } catch (e) {
        toast(tr('toast.teacherDeleteErr'));
      }
    },
    [showConfirm, toast, data],
  );

  // ---- Admin mutations ----
  const saveAdmin = useCallback(
    async (payload, isEdit) => {
      if (isEdit) {
        const id = adminModal.editing.id;
        await apiFetch(`/admins/${id}`, 'PUT', payload);
        setAdmins((prev) =>
          prev.map((a) =>
            a.id == id
              ? { ...a, fullname: payload.fullname, username: payload.username, status: payload.status }
              : a,
          ),
        );
        toast(tr('toast.adminUpdated'));
      } else {
        const res = await apiFetch('/admins', 'POST', { ...payload, status: 'Active' });
        setAdmins((prev) => [
          ...prev,
          { id: res.id, username: payload.username, fullname: payload.fullname, status: 'Active' },
        ]);
        toast(tr('toast.adminAdded'));
      }
      setAdminModal({ open: false, editing: null });
    },
    [adminModal.editing, toast],
  );

  const setAdminStatus = useCallback(
    async (a, status) => {
      const previousStatus = normalizeAccountStatus(a.status);
      const safeStatus = normalizeAccountStatus(status);
      try {
        await apiFetch(`/admins/${a.id}`, 'PUT', {
          username: a.username,
          fullname: a.fullname,
          status: safeStatus,
        });
        setAdmins((prev) => prev.map((x) => (x.id == a.id ? { ...x, status: safeStatus } : x)));
        toast(
          previousStatus === 'Login Blocked' && safeStatus === 'Active'
            ? tr('toast.adminUnblocked')
            : tr('toast.adminMarked', { status: tr('acctStatus.' + safeStatus) }),
        );
      } catch (e) {
        toast(tr('toast.adminStatusErr'));
      }
    },
    [toast],
  );

  const deleteAdmin = useCallback(
    async (a) => {
      if (user.id == a.id) {
        toast(tr('toast.cannotDeleteSelf'));
        return;
      }
      const ok = await showConfirm({
        title: tr('acct.deleteAdminTitle'),
        lines: [
          { label: tr('common.username'), value: a.username || tr('acct.noUsername') },
          { label: tr('common.name'), value: a.fullname || tr('acct.noName') },
        ],
        okText: tr('common.delete'),
        danger: true,
      });
      if (!ok) return;
      try {
        await apiFetch(`/admins/${a.id}`, 'DELETE');
        setAdmins((prev) => prev.filter((x) => x.id != a.id));
        toast(tr('toast.adminDeleted'));
      } catch (e) {
        toast(tr('toast.adminDeleteErr'));
      }
    },
    [user.id, showConfirm, toast],
  );

  const renderTeacherRows = () => {
    if (!loaded) return <SkeletonTableRows columns={4} rows={6} />;
    if (!teachers.length)
      return emptyRow('fa-users', tr('acct.noTeachers'));
    if (!filteredTeachers.length)
      return emptyRow('fa-magnifying-glass', tr('acct.noTeachersMatch'));
    return [
      ...teacherScroll.visible.map((t) => {
      const status = normalizeAccountStatus(t.status);
      const nextStatus = status === 'Active' ? 'Inactive' : 'Active';
      return (
        <tr key={t.id}>
          <td className="account-name-cell">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: t.color || '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {(t.fullname || '').charAt(0)}
              </div>
              <span style={{ fontWeight: 600, wordBreak: 'break-word' }}>{t.fullname}</span>
            </div>
          </td>
          <td className="account-username-cell" data-label={tr('common.username')}>
            <code className="account-username-code" style={codeStyle}>
              {t.username}
            </code>
          </td>
          <td data-label={tr('common.status')}>
            <StatusBadge account={t} variant="account" />
          </td>
          <td className="account-actions-cell">
            <AccountActionsMenu
              ariaLabel={tr('acct.teacherActions')}
              actions={[
                { label: tr('common.edit'), onClick: () => setTeacherModal({ open: true, editing: t }) },
                {
                  label: statusActionLabel(status, nextStatus),
                  onClick: () => setTeacherStatus(t, nextStatus),
                },
                { label: tr('common.delete'), danger: true, onClick: () => deleteTeacher(t) },
              ]}
            />
          </td>
        </tr>
      );
      }),
      teacherScroll.hasMore && (
        <tr key="__sentinel" ref={teacherScroll.sentinelRef} aria-hidden="true">
          <td colSpan="4" style={{ height: 1, padding: 0, border: 0 }} />
        </tr>
      ),
    ];
  };

  const renderAdminRows = () => {
    if (!loaded) return <SkeletonTableRows columns={4} rows={6} />;
    if (!visibleAdmins.length) return emptyRow('fa-lock', tr('acct.noAdmins'));
    if (!filteredAdmins.length)
      return emptyRow('fa-magnifying-glass', tr('acct.noAdminsMatch'));
    return [
      ...adminScroll.visible.map((a) => {
      const status = normalizeAccountStatus(a.status);
      const nextStatus = status === 'Active' ? 'Inactive' : 'Active';
      const canDelete = user.id != a.id;
      return (
        <tr key={a.id}>
          <td className="account-name-cell">
            <span style={{ fontWeight: 600, wordBreak: 'break-word' }}>{a.fullname}</span>
          </td>
          <td className="account-username-cell" data-label={tr('common.username')}>
            <code className="account-username-code" style={codeStyle}>
              {a.username}
            </code>
          </td>
          <td data-label={tr('common.status')}>
            <StatusBadge account={a} variant="account" />
          </td>
          <td className="account-actions-cell">
            <AccountActionsMenu
              ariaLabel={tr('acct.adminActions')}
              actions={[
                { label: tr('common.edit'), onClick: () => setAdminModal({ open: true, editing: a }) },
                {
                  label: statusActionLabel(status, nextStatus),
                  onClick: () => setAdminStatus(a, nextStatus),
                },
                {
                  label: tr('common.delete'),
                  danger: true,
                  disabled: !canDelete,
                  onClick: () => deleteAdmin(a),
                },
              ]}
            />
          </td>
        </tr>
      );
      }),
      adminScroll.hasMore && (
        <tr key="__sentinel" ref={adminScroll.sentinelRef} aria-hidden="true">
          <td colSpan="4" style={{ height: 1, padding: 0, border: 0 }} />
        </tr>
      ),
    ];
  };

  return (
    <section className="page active" id="page-accounts">
      <div className="page-header">
        <div>
          <div className="page-title">{tr('acct.title')}</div>
          <div className="page-sub">{tr('acct.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* One button that follows the active tab (same slot + primary style):
              Add Teacher / Add Admin / Add Student. */}
          {tab === 'teachers' ? (
            <button
              className="btn btn-primary"
              onClick={() => setTeacherModal({ open: true, editing: null })}
            >
              + {tr('acct.addTeacher')}
            </button>
          ) : tab === 'admins' ? (
            <button
              className="btn btn-primary"
              onClick={() => setAdminModal({ open: true, editing: null })}
            >
              + {tr('acct.addAdmin')}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setStudentsAddTick((n) => n + 1)}
            >
              + {tr('students.add')}
            </button>
          )}
        </div>
      </div>
      <div className="tab-bar">
        <button
          className={'tab-btn' + (tab === 'admins' ? ' active' : '')}
          onClick={() => setTab('admins')}
        >
          <i className="fa-solid fa-user-shield" aria-hidden="true"></i>
          <span className="tab-label">{tr('acct.tabAdmins')}</span>
        </button>
        <button
          className={'tab-btn' + (tab === 'teachers' ? ' active' : '')}
          onClick={() => setTab('teachers')}
        >
          <i className="fa-solid fa-chalkboard-user" aria-hidden="true"></i>
          <span className="tab-label">{tr('acct.tabTeachers')}</span>
        </button>
        <button
          className={'tab-btn' + (tab === 'students' ? ' active' : '')}
          onClick={() => setTab('students')}
        >
          <i className="fa-solid fa-user-graduate" aria-hidden="true"></i>
          <span className="tab-label">{tr('students.title')}</span>
        </button>
      </div>

      <div className={'tab-pane' + (tab === 'teachers' ? ' active' : '')} id="tab-teachers">
        <div className="filter-bar">
          <span className="filter-label">{tr('acct.searchTeachers')}</span>
          <input
            type="search"
            className="form-control"
            placeholder={tr('acct.searchTeachersPh')}
            value={teacherQuery}
            onChange={(e) => setTeacherQuery(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <div className="card">
          <div className="table-wrap">
            <table className="accounts-table stack-cards">
              <colgroup>
                <col className="account-col-name" />
                <col className="account-col-username" />
                <col className="account-col-status" />
                <col className="account-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>{tr('common.fullName')}</th>
                  <th>{tr('common.username')}</th>
                  <th>{tr('common.status')}</th>
                  <th>{tr('common.actions')}</th>
                </tr>
              </thead>
              <tbody>{renderTeacherRows()}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={'tab-pane' + (tab === 'admins' ? ' active' : '')} id="tab-admins">
        <div className="filter-bar">
          <span className="filter-label">{tr('acct.searchAdmins')}</span>
          <input
            type="search"
            className="form-control"
            placeholder={tr('acct.searchAdminsPh')}
            value={adminQuery}
            onChange={(e) => setAdminQuery(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>
        <div className="card">
          <div className="table-wrap">
            <table className="accounts-table stack-cards">
              <colgroup>
                <col className="account-col-name" />
                <col className="account-col-username" />
                <col className="account-col-status" />
                <col className="account-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>{tr('common.fullName')}</th>
                  <th>{tr('common.username')}</th>
                  <th>{tr('common.status')}</th>
                  <th>{tr('common.actions')}</th>
                </tr>
              </thead>
              <tbody>{renderAdminRows()}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={'tab-pane' + (tab === 'students' ? ' active' : '')} id="tab-students">
        {/* The Students management UI (list, search, modal) lives in StudentsPage,
            rendered here as a tab. Its "+ Add Student" button is hoisted to the
            page header above and fires via openAddSignal. Mounted only when the
            tab is active so it doesn't fetch students in the background. */}
        {tab === 'students' && (
          <StudentsPage embedded openAddSignal={studentsAddTick} />
        )}
      </div>

      <TeacherModal
        open={teacherModal.open}
        onClose={() => setTeacherModal({ open: false, editing: null })}
        teacher={teacherModal.editing}
        isUsernameTaken={(u, id) => usernameTaken('teacher', u, id)}
        onSave={saveTeacher}
      />
      <AdminModal
        open={adminModal.open}
        onClose={() => setAdminModal({ open: false, editing: null })}
        admin={adminModal.editing}
        isUsernameTaken={(u, id) => usernameTaken('admin', u, id)}
        onSave={saveAdmin}
      />
    </section>
  );
}

function emptyRow(icon, text) {
  return (
    <tr>
      <td colSpan="4">
        <div className="empty-state">
          <div className="empty-icon">
            <i className={'fa-solid ' + icon} aria-hidden="true"></i>
          </div>
          <p>{text}</p>
        </div>
      </td>
    </tr>
  );
}
