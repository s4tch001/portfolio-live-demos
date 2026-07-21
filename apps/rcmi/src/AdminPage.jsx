import { useState, useEffect, useCallback, useRef } from 'react';
import { api, setAdminToken, clearAdminToken, hasAdminToken } from './lib/api.js';
import { roleLabel } from './lib/date.js';
import MemberDirectory from './components/MemberDirectory.jsx';
import { DISTRICT_LEADERS } from './lib/constants.js';

const LOCKOUT_KEY = 'admin-lockout-until';
const ATTEMPTS_KEY = 'admin-failed-attempts';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;
// How many record rows to fetch per page. The next page is loaded from the
// server as the table is scrolled, so the whole table is never fetched at once.
const PAGE_SIZE = 50;

function formatDateDisplay(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toApiDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${month}-${day}-${year}`;
}

function toInputDate(dateStr) {
  if (!dateStr) return '';
  const [month, day, year] = dateStr.split('-');
  return `${year}-${month}-${day}`;
}

// Change-password + rename District Leaders. Lives inside the Admin Panel tab.
function AdminSettings({ districtLeaders, onDistrictLeadersChanged, onSessionExpired }) {
  const [names, setNames] = useState(() =>
    Object.fromEntries(districtLeaders.map((leader) => [leader.id, leader.name])),
  );
  const [savingNames, setSavingNames] = useState(false);
  const [namesMessage, setNamesMessage] = useState('');
  const [namesError, setNamesError] = useState('');

  // Keep the inputs in sync if the names refresh from the server.
  useEffect(() => {
    setNames(Object.fromEntries(districtLeaders.map((leader) => [leader.id, leader.name])));
  }, [districtLeaders]);

  function handleAuthError(err, fallback) {
    if (err.status === 401) {
      onSessionExpired();
      return;
    }
    fallback(err.message);
  }

  async function saveNames(e) {
    e.preventDefault();
    setNamesMessage('');
    setNamesError('');
    const updates = districtLeaders.map((leader) => ({
      id: leader.id,
      name: (names[leader.id] || '').trim(),
    }));
    if (updates.some((update) => !update.name)) {
      setNamesError('District leader name cannot be empty.');
      return;
    }
    setSavingNames(true);
    try {
      await api('administrator-settings', {
        method: 'PATCH',
        body: JSON.stringify({ districtLeaders: updates }),
        auth: true,
      });
      setNamesMessage('District leader names updated.');
      await onDistrictLeadersChanged();
    } catch (err) {
      handleAuthError(err, setNamesError);
    } finally {
      setSavingNames(false);
    }
  }

  return (
    <div className="adminSettings">
      <section className="panel">
        <p className="eyebrow">Settings</p>
        <h2>District Leader Names</h2>
        <p className="fieldHint">
          Renaming a district leader updates their name everywhere on the site.
        </p>
        <form className="memberForm" onSubmit={saveNames}>
          {districtLeaders.map((leader) => (
            <div key={leader.id}>
              <label className="fieldLabel" htmlFor={`dl-${leader.id}`}>{leader.name}</label>
              <input
                id={`dl-${leader.id}`}
                className="input"
                value={names[leader.id] ?? ''}
                onChange={(e) => setNames((prev) => ({ ...prev, [leader.id]: e.target.value }))}
                placeholder="Name"
              />
            </div>
          ))}
          {namesError && <div className="passwordError">{namesError}</div>}
          {namesMessage && <div className="alert success">{namesMessage}</div>}
          <button className="primaryButton" disabled={savingNames}>
            {savingNames ? 'Saving...' : 'Save Names'}
          </button>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow">Settings</p>
        <h2>Preview Password</h2>
        <div className="alert success" role="note">
          Administrator password: <strong>password</strong>
        </div>
        <p className="fieldHint">
          This default portfolio-preview password is protected and cannot be changed.
        </p>
      </section>
    </div>
  );
}

export default function AdminPage({
  members = [],
  districtLeaders = DISTRICT_LEADERS,
  onMembersChanged,
  onDistrictLeadersChanged,
  onError,
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('panel');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // The date range of the currently-loaded list, so scrolling for more pages
  // keeps using the same filter the user applied (not whatever is typed in the
  // inputs right now).
  const appliedFilter = useRef({ from: '', to: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lockoutUntil, setLockoutUntil] = useState(() => {
    const stored = localStorage.getItem(LOCKOUT_KEY);
    return stored ? new Date(stored) : null;
  });
  const [failedAttempts, setFailedAttempts] = useState(() => {
    return Number(localStorage.getItem(ATTEMPTS_KEY)) || 0;
  });

  useEffect(() => {
    // A valid session token (sessionStorage) means the user is still logged in.
    if (hasAdminToken()) {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (lockoutUntil && new Date() >= lockoutUntil) {
      setLockoutUntil(null);
      setFailedAttempts(0);
      localStorage.removeItem(LOCKOUT_KEY);
      localStorage.removeItem(ATTEMPTS_KEY);
    }
  }, [lockoutUntil]);

  const handleLogout = useCallback(() => {
    clearAdminToken();
    setAuthenticated(false);
    setPassword('');
    setRecords([]);
    setSelected(new Set());
  }, []);

  // Handle an expired/invalid token by forcing re-login.
  const handleFetchError = useCallback((err) => {
    if (err.status === 401) {
      handleLogout();
      setError('Session expired. Please log in again.');
    } else {
      setError(err.message);
    }
  }, [handleLogout]);

  // Fetch one page (newest-first) for the given filter + offset.
  const loadPage = useCallback(async (from, to, offset) => {
    const params = new URLSearchParams();
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    return api(`administrator-attendance?${params.toString()}`, { auth: true });
  }, []);

  // (Re)load the first page for a filter. Called on open, on filter, and after
  // a delete. Resets the accumulated list and the total count.
  const fetchRecords = useCallback(async (from, to) => {
    setLoading(true);
    setError('');
    appliedFilter.current = { from, to };
    try {
      const data = await loadPage(from, to, 0);
      setRecords(data.records || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.records || []).length);
      setSelected(new Set());
    } catch (err) {
      handleFetchError(err);
    } finally {
      setLoading(false);
    }
  }, [loadPage, handleFetchError]);

  // Append the next page (uses the loaded count as the offset).
  const loadMore = useCallback(async () => {
    if (loading || loadingMore) return;
    if (records.length >= total) return;
    setLoadingMore(true);
    try {
      const { from, to } = appliedFilter.current;
      const data = await loadPage(from, to, records.length);
      setRecords((prev) => [...prev, ...(data.records || [])]);
      if (typeof data.total === 'number') setTotal(data.total);
    } catch (err) {
      handleFetchError(err);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, records.length, total, loadPage, handleFetchError]);

  // Restore the records when returning with a still-valid token.
  useEffect(() => {
    if (authenticated) fetchRecords('', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  // Load the next page when the table is scrolled near the bottom.
  function handleTableScroll(event) {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      loadMore();
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (lockoutUntil) {
      const remaining = Math.ceil((lockoutUntil - new Date()) / 60000);
      setPasswordError(`Too many failed attempts. Try again in ${remaining} minute(s).`);
      return;
    }

    setAuthLoading(true);
    setPasswordError('');

    try {
      const data = await api('administrator-auth', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      setAdminToken(data.token);
      localStorage.removeItem(LOCKOUT_KEY);
      localStorage.removeItem(ATTEMPTS_KEY);
      setFailedAttempts(0);
      setLockoutUntil(null);
      setPassword('');
      setAuthenticated(true);
    } catch (err) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      localStorage.setItem(ATTEMPTS_KEY, String(newAttempts));

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        setLockoutUntil(until);
        localStorage.setItem(LOCKOUT_KEY, until.toISOString());
        setPasswordError(`Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
      } else {
        setPasswordError(`Incorrect password. ${MAX_ATTEMPTS - newAttempts} attempt(s) remaining.`);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((r) => `${r.attendance_date}|${r.member_id}`)));
    }
  }

  async function handleDelete() {
    setDeleteLoading(true);
    setError('');
    setConfirmDelete(false);
    try {
      const ids = [];
      for (const key of selected) {
        const sep = key.indexOf('|');
        const attendance_date = key.slice(0, sep);
        const member_id = key.slice(sep + 1);
        ids.push({ attendance_date, member_id });
      }
      await api('administrator-attendance', {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
        auth: true,
      });
      setMessage(`Deleted ${ids.length} record(s).`);
      // Reload from the top using the same filter the list is currently showing.
      const { from, to } = appliedFilter.current;
      fetchRecords(from, to);
    } catch (err) {
      handleFetchError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  function handleFilter(e) {
    e.preventDefault();
    const from = dateFrom ? toApiDate(dateFrom) : '';
    const to = dateTo ? toApiDate(dateTo) : '';
    fetchRecords(from, to);
  }

  function handleClearFilter() {
    setDateFrom('');
    setDateTo('');
    fetchRecords('', '');
  }

  // Password screen
  if (!authenticated) {
    const isLocked = lockoutUntil && new Date() < lockoutUntil;
    const remaining = isLocked ? Math.ceil((lockoutUntil - new Date()) / 60000) : 0;

    return (
      <main className="adminMain">
        <div className="adminLoginPanel">
          <h2>Administrator Access</h2>
          <p>Enter password to access the administrator panel.</p>
          <div className="alert success" role="note">
            Portfolio preview password: <strong>password</strong>. It is restored after reset and cannot be changed.
          </div>

          {isLocked && (
            <div className="alert error">
              Account locked. Try again in {remaining} minute(s).
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="passwordInputWrapper">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={authLoading || isLocked}
                autoFocus
              />
            </div>

            {passwordError && !isLocked && (
              <div className="passwordError">{passwordError}</div>
            )}

            <div className="passwordActions">
              <button
                type="submit"
                disabled={authLoading || isLocked}
                className={authLoading ? 'button loading' : 'button'}
              >
                {authLoading ? 'Verifying...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  // Admin panel
  return (
    <main className="adminMain">
      <div className="adminHeader">
        <h2>Administrator</h2>
        <button className="dangerButton" onClick={handleLogout}>Logout</button>
      </div>

      <nav className="tabs adminSubTabs" aria-label="Administrator sections">
        <button
          className={activeTab === 'panel' ? 'active' : ''}
          onClick={() => setActiveTab('panel')}
        >
          Admin Panel
        </button>
        <button
          className={activeTab === 'directory' ? 'active' : ''}
          onClick={() => setActiveTab('directory')}
        >
          Member Directory
        </button>
      </nav>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      {activeTab === 'directory' ? (
        <MemberDirectory
          members={members}
          districtLeaders={districtLeaders}
          onChanged={onMembersChanged}
          onError={onError}
        />
      ) : (
      <>
      <div className="adminFilters">
        <form onSubmit={handleFilter} className="adminFilterForm">
          <div className="adminFilterGroup">
            <label>Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
            />
          </div>
          <div className="adminFilterGroup">
            <label>Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
            />
          </div>
          <button type="submit" className="primaryButton" disabled={loading}>
            Filter
          </button>
          <button type="button" className="button secondary" onClick={handleClearFilter}>
            Clear
          </button>
        </form>
      </div>

      <div className="adminToolbar">
        <span className="counter">{total} record(s)</span>
        {selected.size > 0 && (
          <button
            className="dangerButton"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Deleting...' : `Delete ${selected.size} selected`}
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="overlay">
          <div className="passwordModal">
            <h3>Confirm Deletion</h3>
            <p>Are you sure you want to delete {selected.size} attendance record(s)? This action cannot be undone.</p>
            <div className="passwordActions">
              <button className="dangerButton" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button className="button secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="adminTableWrap" onScroll={handleTableScroll}>
        {loading ? (
          <p className="loadingText">Loading records...</p>
        ) : records.length === 0 ? (
          <p className="loadingText">No attendance records found.</p>
        ) : (
          <table className="adminTable">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={records.length > 0 && selected.size === records.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Date</th>
                <th>Name</th>
                <th>Role</th>
                <th>Recorded At</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const key = `${record.attendance_date}|${record.member_id}`;
                return (
                  <tr key={key} className={selected.has(key) ? 'selectedRow' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleSelect(key)}
                      />
                    </td>
                    <td>{formatDateDisplay(record.attendance_date)}</td>
                    <td>{record.name}</td>
                    <td><span className={`roleTag ${record.role}`}>{roleLabel(record.role)}</span></td>
                    <td>{formatDateTime(record.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && records.length > 0 && (
          <p className="tableMoreHint">
            {loadingMore
              ? 'Loading more...'
              : records.length < total
                ? `Showing ${records.length} of ${total} — scroll for more...`
                : `All ${total} record(s) loaded.`}
          </p>
        )}
      </div>

      <AdminSettings
        districtLeaders={districtLeaders}
        onDistrictLeadersChanged={onDistrictLeadersChanged}
        onSessionExpired={() => {
          handleLogout();
          setError('Session expired. Please log in again.');
        }}
      />
      </>
      )}
    </main>
  );
}
