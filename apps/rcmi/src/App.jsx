import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import AdminPage from './AdminPage.jsx';
import { api } from './lib/api.js';
import {
  monthNames,
  formatDate,
  formatMonth,
  todayAtStart,
  buildCalendarDays,
  roleLabel,
  sortByRoleThenName,
} from './lib/date.js';
import Calendar from './components/Calendar.jsx';
import AttendanceModal from './components/AttendanceModal.jsx';
import AttendanceViewer from './components/AttendanceViewer.jsx';
import AttendanceEditor from './components/AttendanceEditor.jsx';
import LeadershipOverview from './components/LeadershipOverview.jsx';
import PasswordModal from './components/PasswordModal.jsx';
import { SENIOR_PASTOR_NAME, DISTRICT_LEADERS } from './lib/constants.js';

// 1-indexed spreadsheet column number -> letter (1 -> A, 27 -> AA, ...), used
// to size the dynamic date-column range in the per-day export sheet.
function columnLetter(index) {
  let letter = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// Builds Excel row descriptors for a leader-grouped sheet: each leader's own
// row, then their people, then a blank spacer row before the next group. A
// group with leaderId === null (the "Unassigned" bucket) gets a plain header
// row instead of a leader row, since there's no leader to report attendance
// for. Callers only need to supply how to turn a leader/person into cell
// values; the grouping/spacing shape is shared between both export sheets.
function buildGroupedDataRows(groups, leaderRowValues, personRowValues, columnCount) {
  const rows = [];
  groups.forEach((group, index) => {
    if (group.leaderId) {
      rows.push({ kind: 'leader', values: leaderRowValues(group) });
    } else {
      rows.push({ kind: 'header', values: [group.leaderName, ...Array(columnCount - 1).fill('')] });
    }
    group.people.forEach((person) => {
      rows.push({ kind: 'person', values: personRowValues(person) });
    });
    if (index < groups.length - 1) {
      rows.push({ kind: 'blank', values: Array(columnCount).fill('') });
    }
  });
  return rows;
}

function App() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('rcmi-theme') || 'light',
  );
  const [viewerViewDate, setViewerViewDate] = useState(todayAtStart());
  const [editorViewDate, setEditorViewDate] = useState(todayAtStart());
  const [selectedDate, setSelectedDate] = useState(formatDate(todayAtStart()));
  const [openModal, setOpenModal] = useState(null);
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [hierarchicalAttendance, setHierarchicalAttendance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [viewerSearch, setViewerSearch] = useState('');
  const [editorSearch, setEditorSearch] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [monthAttendance, setMonthAttendance] = useState({});
  // Editable District Leader names (Pastor Sherwin / Ate Anj), loaded from
  // Supabase. Defaults to the built-in names until the fetch resolves so the
  // UI never flashes empty.
  const [districtLeaders, setDistrictLeaders] = useState(DISTRICT_LEADERS);

  // Session cache of present-by-day data, keyed by "MM-YYYY" -> days. Lives until
  // the page is refreshed, so revisiting a month never refetches from Supabase.
  const monthCache = useRef(new Map());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rcmi-theme', theme);
  }, [theme]);

  useEffect(() => {
    loadMembers();
    loadSettings();
  }, []);

  // The viewer month drives the present-by-day data (one request per month).
  // The editor fetches per opened day, so it needs no month preload.
  useEffect(() => {
    loadMonth(viewerViewDate);
  }, [viewerViewDate]);

  useEffect(() => {
    if (!openModal) return undefined;

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpenModal(null);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [openModal]);

  // Fetch the currently viewed month's present records in ONE range query (only
  // that month's rows — never the whole table). Cached for the whole page session
  // so flipping between months or reopening days never re-hits the database; a
  // page refresh clears the in-memory cache and pulls fresh data.
  async function fetchMonth(viewDate) {
    const monthKey = formatMonth(viewDate);
    if (monthCache.current.has(monthKey)) {
      return monthCache.current.get(monthKey);
    }
    const data = await api(`attendance?mode=month&month=${monthKey}`);
    const days = data.days || {};
    monthCache.current.set(monthKey, days);
    return days;
  }

  async function loadMonth(viewDate) {
    try {
      const days = await fetchMonth(viewDate);
      setMonthAttendance(days);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadMembers() {
    setError('');
    try {
      const data = await api('members');
      setMembers(data.members || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // Load the editable District Leader names. A failure just keeps the built-in
  // default names (already in state), so it never blocks the page.
  async function loadSettings() {
    try {
      const data = await api('settings');
      if (Array.isArray(data.districtLeaders) && data.districtLeaders.length) {
        setDistrictLeaders(data.districtLeaders);
      }
    } catch {
      // Non-fatal: keep the default names.
    }
  }

  // Fetch a single day's roster. Viewer reuses the cached month data when present.
  async function fetchDayData(date, mode) {
    if (mode === 'viewer') {
      if (monthAttendance[date]) return monthAttendance[date];
      const params = new URLSearchParams({ date, mode: 'viewer' });
      const data = await api(`attendance?${params.toString()}`);
      return data.attendance || [];
    }
    // Editor needs the full roster (present + absent) for the day.
    const params = new URLSearchParams({ date, mode: 'editor' });
    const data = await api(`attendance?${params.toString()}`);
    return data.attendance || [];
  }

  // Historically-correct role/leader grouping for a single day, used by the
  // "By Leader" toggle in the viewer/editor. Fetched independently of the
  // flat roster above so a failure here never blanks the existing flat view.
  async function fetchHierarchicalDayData(date) {
    const params = new URLSearchParams({ date, mode: 'hierarchical' });
    const data = await api(`attendance?${params.toString()}`);
    return data.attendance || [];
  }

  async function loadAttendance(date, mode) {
    setLoading(true);
    setError('');
    // Clear the previous day's data immediately so it never flashes while the
    // new day loads. The cached viewer path re-sets it synchronously below.
    setAttendance([]);
    setHierarchicalAttendance(null);

    const [flatResult, hierarchicalResult] = await Promise.allSettled([
      fetchDayData(date, mode),
      fetchHierarchicalDayData(date),
    ]);

    if (flatResult.status === 'fulfilled') {
      setAttendance(flatResult.value);
    } else {
      setError(flatResult.reason.message);
    }
    // Hierarchical grouping is a secondary view; leave it null (falls back to
    // the flat "All" view) rather than surfacing a second error banner.
    setHierarchicalAttendance(hierarchicalResult.status === 'fulfilled' ? hierarchicalResult.value : null);

    setLoading(false);
  }

  async function saveAttendance(memberId, status) {
    setSaving(true);
    setError('');
    setMessage('');

    const previous = attendance;
    const previousMonth = monthAttendance;
    const previousHierarchical = hierarchicalAttendance;
    const next = attendance.map((person) =>
      person.id === memberId ? { ...person, status } : person,
    );
    setAttendance(next);
    // Keep the "By Leader" grouped view in sync with the same edit, without
    // waiting for a refetch.
    if (hierarchicalAttendance) {
      setHierarchicalAttendance(
        hierarchicalAttendance.map((person) =>
          person.id === memberId ? { ...person, status } : person,
        ),
      );
    }

    // Compute the new present list for the edited day so we can update both the
    // on-screen state and the month cache — no refetch needed for our own edit.
    const edited = next.find((person) => person.id === memberId);
    const prevDayList = monthAttendance[selectedDate] || [];
    const updatedDayList =
      status === 'present'
        ? prevDayList.some((p) => p.id === memberId)
          ? prevDayList
          : [
              ...prevDayList,
              {
                id: edited.id,
                name: edited.name,
                role: edited.role,
                status: 'present',
              },
            ]
        : prevDayList.filter((p) => p.id !== memberId);

    // Keep the viewer's present-by-day data in sync immediately so switching
    // editor -> viewer for the same day reflects the change without waiting.
    setMonthAttendance((prev) => ({ ...prev, [selectedDate]: updatedDayList }));

    try {
      await api('attendance', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, memberId, status }),
      });
      // Patch the cached month in place (instead of deleting) so revisiting the
      // month stays a cache hit — zero extra database reads for our own edit.
      const monthKey = formatMonth(editorViewDate);
      const cached = monthCache.current.get(monthKey);
      if (cached) {
        monthCache.current.set(monthKey, {
          ...cached,
          [selectedDate]: updatedDayList,
        });
      }
      setMessage('Attendance saved.');
    } catch (err) {
      setAttendance(previous);
      setMonthAttendance(previousMonth);
      setHierarchicalAttendance(previousHierarchical);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const viewerCalendarDays = useMemo(
    () => buildCalendarDays(viewerViewDate),
    [viewerViewDate],
  );
  const editorCalendarDays = useMemo(
    () => buildCalendarDays(editorViewDate),
    [editorViewDate],
  );
  // Days in the viewer's current month that have at least one present record,
  // so the Attendance Records calendar can highlight them at a glance.
  const daysWithAttendance = useMemo(
    () => new Set(Object.keys(monthAttendance).filter((key) => monthAttendance[key].length > 0)),
    [monthAttendance],
  );
  const selectedReadable = useMemo(() => {
    const [month, day, year] = selectedDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDate]);

  const presentPeople = useMemo(
    () => attendance.filter((person) => person.status === 'present'),
    [attendance],
  );
  const filteredPresent = useMemo(() => {
    const term = viewerSearch.toLowerCase();
    return sortByRoleThenName(
      presentPeople.filter((person) =>
        person.name.toLowerCase().includes(term),
      ),
    );
  }, [presentPeople, viewerSearch]);
  const filteredAttendance = useMemo(() => {
    const term = editorSearch.toLowerCase();
    return sortByRoleThenName(
      attendance.filter((person) => person.name.toLowerCase().includes(term)),
    );
  }, [attendance, editorSearch]);

  function moveViewerMonth(step) {
    setViewerViewDate(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + step, 1),
    );
  }

  function moveEditorMonth(step) {
    setEditorViewDate(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + step, 1),
    );
  }

  function openAttendanceDay(day, mode) {
    setSelectedDate(day.key);
    setOpenModal(mode);
    if (mode === 'viewer') setViewerSearch('');
    if (mode === 'editor') setEditorSearch('');
    loadAttendance(day.key, mode);
  }

  function downloadMonthAttendance() {
    setPasswordModalOpen(true);
    setPasswordInput('');
    setPasswordError('');
  }

  async function handlePasswordSubmit(password) {
    setDownloading(true);
    setDownloadStatus('Please wait...');
    setPasswordError('');

    try {
      try {
        await api('attendance-export-verify', {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
      } catch (err) {
        setPasswordError('Incorrect password.');
        setDownloading(false);
        setDownloadStatus('');
        return;
      }

      setDownloadStatus('Fetching data...');

      const year = viewerViewDate.getFullYear();
      const month = viewerViewDate.getMonth();
      const monthName = monthNames[month];
      const monthKey = formatMonth(viewerViewDate);

      // One request for the monthly summary (unchanged), plus one for the
      // historically-correct per-day/per-leader rows (new sheet 1).
      const [days, hierRows] = await Promise.all([
        fetchMonth(viewerViewDate),
        api(`attendance?mode=month-hierarchical&month=${monthKey}`).then((data) => data.rows || []),
      ]);

      setDownloadStatus('Exporting spreadsheet...');

      // Loaded on demand so the heavy ExcelJS library stays out of the initial bundle.
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();

      // ---- Sheet 1: Per-Day View ----
      // One column per date that actually has attendance this month (days with
      // zero attendance simply never appear), grouped rows: each leader followed
      // by the members/guests assigned to them, one row per person.
      const sheet1 = workbook.addWorksheet('rcmi-attendance');

      const presenceSet = new Set(hierRows.map((row) => `${row.memberId}|${row.attendanceDate}`));

      const dateDayMap = new Map();
      hierRows.forEach((row) => {
        if (!dateDayMap.has(row.attendanceDate)) {
          dateDayMap.set(row.attendanceDate, Number(row.attendanceDate.split('-')[1]));
        }
      });
      const sortedDates = Array.from(dateDayMap.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([dateKey]) => dateKey);

      // A person can have more than one row this month if their role/leader
      // changed mid-month (see member_role_history); use their most recent
      // attendance date's role/leader so they land under a single, current
      // group in this per-day sheet.
      const byMember = new Map();
      hierRows.forEach((row) => {
        const day = Number(row.attendanceDate.split('-')[1]);
        const existing = byMember.get(row.memberId);
        if (!existing || day > existing.day) {
          byMember.set(row.memberId, {
            id: row.memberId,
            name: row.memberName,
            role: row.role,
            leaderId: row.leaderId,
            day,
          });
        }
      });
      const attendees = sortByRoleThenName(
        Array.from(byMember.values()).filter((person) => person.role !== 'leader'),
      );

      const leaderRoster = sortByRoleThenName(members.filter((member) => member.role === 'leader'));
      const leaderIds = new Set(leaderRoster.map((leader) => leader.id));

      const sheet1Groups = leaderRoster.map((leader) => ({
        leaderId: leader.id,
        leaderName: leader.name,
        people: attendees.filter((person) => person.leaderId === leader.id),
      }));
      const unassignedPeople = attendees.filter(
        (person) => !person.leaderId || !leaderIds.has(person.leaderId),
      );
      if (unassignedPeople.length > 0) {
        sheet1Groups.push({ leaderId: null, leaderName: 'Unassigned', people: unassignedPeople });
      }

      // Name + Role, then one column per date with attendance this month.
      const columnCount = 2 + sortedDates.length;
      const lastColumnLetter = columnLetter(columnCount);

      sheet1.mergeCells(`A1:${lastColumnLetter}1`);
      sheet1.getCell('A1').value = `RCMI ATTENDANCE PER DAY - ${monthName.toUpperCase()} ${year}`;
      sheet1.getCell('A1').font = { bold: true, size: 14 };
      sheet1.getCell('A1').alignment = { horizontal: 'center', vertical: 'center' };

      if (sortedDates.length === 0) {
        sheet1.getCell('A3').value = 'No attendance recorded this month.';
        sheet1.getCell('A3').font = { italic: true };
      } else {
        const dateLabels = sortedDates.map((dateKey) => `${monthName} ${dateDayMap.get(dateKey)}`);

        const sheet1Rows = buildGroupedDataRows(
          sheet1Groups,
          (group) => [
            group.leaderName,
            'Leader',
            ...sortedDates.map((dateKey) => (presenceSet.has(`${group.leaderId}|${dateKey}`) ? 1 : '')),
          ],
          (person) => [
            `  ${person.name}`,
            roleLabel(person.role),
            ...sortedDates.map((dateKey) => (presenceSet.has(`${person.id}|${dateKey}`) ? 1 : '')),
          ],
          columnCount,
        );

        sheet1.getRow(3).values = ['Name', 'Role', ...dateLabels];
        sheet1.getRow(3).font = { bold: true };
        sheet1Rows.forEach((row, index) => {
          const excelRow = sheet1.getRow(4 + index);
          excelRow.values = row.values;
          if (row.kind === 'leader' || row.kind === 'header') excelRow.font = { bold: true };
        });

        sheet1.getColumn(1).width = Math.max(
          26,
          ...attendees.map((person) => person.name.length + 4),
          ...leaderRoster.map((leader) => leader.name.length + 2),
        );
        for (let col = 2; col <= columnCount; col++) {
          sheet1.getColumn(col).width = 12;
        }
      }

      // ---- Sheet 2: Monthly Summary (rcmi-monthly-summary), same leader-grouped
      // layout as sheet 1, with an Attended day-count column instead of dates. ----
      const presentMembersMap = new Map();
      Object.values(days).forEach((people) => {
        people.forEach((person) => {
          const record = presentMembersMap.get(person.id);
          if (record) {
            record.count += 1;
          } else {
            presentMembersMap.set(person.id, { count: 1 });
          }
        });
      });

      const monthlyAttendees = attendees.map((person) => ({
        ...person,
        count: presentMembersMap.get(person.id)?.count || 0,
      }));
      const sheet2Groups = leaderRoster.map((leader) => ({
        leaderId: leader.id,
        leaderName: leader.name,
        count: presentMembersMap.get(leader.id)?.count || 0,
        people: monthlyAttendees.filter((person) => person.leaderId === leader.id),
      }));
      const monthlyUnassigned = monthlyAttendees.filter(
        (person) => !person.leaderId || !leaderIds.has(person.leaderId),
      );
      if (monthlyUnassigned.length > 0) {
        sheet2Groups.push({ leaderId: null, leaderName: 'Unassigned', count: 0, people: monthlyUnassigned });
      }

      const worksheet = workbook.addWorksheet('rcmi-monthly-summary');

      worksheet.mergeCells('A1:C1');
      worksheet.getCell('A1').value =
        `RCMI ATTENDANCE OF ${monthName.toUpperCase()} ${year}`;
      worksheet.getCell('A1').font = { bold: true, size: 14 };
      worksheet.getCell('A1').alignment = {
        horizontal: 'center',
        vertical: 'center',
      };

      if (sortedDates.length === 0) {
        worksheet.getCell('A3').value = 'No attendance recorded this month.';
        worksheet.getCell('A3').font = { italic: true };
      } else {
        const sheet2Rows = buildGroupedDataRows(
          sheet2Groups,
          (group) => [group.leaderName, 'Leader', group.count],
          (person) => [`  ${person.name}`, roleLabel(person.role), person.count],
          3,
        );

        worksheet.getRow(3).values = ['Name', 'Role', 'Attended'];
        worksheet.getRow(3).font = { bold: true };
        sheet2Rows.forEach((row, index) => {
          const excelRow = worksheet.getRow(4 + index);
          excelRow.values = row.values;
          if (row.kind === 'leader' || row.kind === 'header') excelRow.font = { bold: true };
        });

        worksheet.getColumn(1).width = Math.max(
          26,
          ...monthlyAttendees.map((person) => person.name.length + 4),
          ...leaderRoster.map((leader) => leader.name.length + 2),
        );
        worksheet.getColumn(2).width = 12;
        worksheet.getColumn(3).width = 12;
      }

      setDownloadStatus('Downloading...');
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${monthName.toLowerCase()}-${year}-rcmi-attendance.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('Monthly attendance downloaded.');
      setPasswordModalOpen(false);
    } catch (err) {
      setError(err.message);
      setPasswordModalOpen(false);
    } finally {
      setDownloading(false);
      setDownloadStatus('');
    }
  }

  return (
    <div className='appShell'>
      <header className='hero'>
        <div className='heroContent'>
          <img
            src='/logo/android-chrome-512x512.png'
            alt='RCMI Logo'
            className='heroLogo'
          />
          <div>
            <p className='eyebrow'>
              Radiance of Christ Ministries International
            </p>
            <p className='pastorLine'>
              {districtLeaders.find((leader) => leader.id === 'pastor-sherwin')?.name || SENIOR_PASTOR_NAME}
            </p>
            <h1>L-path Attendance Checker</h1>
            <p className='subtitle'>
              Gatherings and ministry events to L-path meeting.
            </p>
          </div>
        </div>
        <button
          className='themeToggle'
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          data-tooltip={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
        >
          <i
            className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}
            aria-hidden='true'
          ></i>
        </button>
      </header>

      <nav className='tabs' aria-label='Main sections'>
        <NavLink
          to='/attendance-records'
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          Attendance Records
        </NavLink>
        <NavLink
          to='/manage-attendance'
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          Manage Attendance
        </NavLink>
        <NavLink
          to='/leadership-overview'
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          Leadership Overview
        </NavLink>
      </nav>

      {error && <div className='alert error'>{error}</div>}
      {message && <div className='alert success'>{message}</div>}

      <Routes>
        <Route
          path='/'
          element={<Navigate to='/attendance-records' replace />}
        />
        <Route
          path='/attendance-records'
          element={
            <main className='calendarOnly'>
              <section className='panel calendarPanel'>
                <Calendar
                  calendarDays={viewerCalendarDays}
                  viewDate={viewerViewDate}
                  selectedDate={selectedDate}
                  onMoveMonth={moveViewerMonth}
                  onSelectDay={(day) => openAttendanceDay(day, 'viewer')}
                  attendanceDays={daysWithAttendance}
                />
              </section>
              <button
                className='primaryButton downloadButton'
                disabled={downloading}
                onClick={downloadMonthAttendance}
              >
                {downloading
                  ? downloadStatus || 'Downloading...'
                  : `Download ${monthNames[viewerViewDate.getMonth()]} ${viewerViewDate.getFullYear()}`}
              </button>
            </main>
          }
        />
        <Route
          path='/manage-attendance'
          element={
            <main className='calendarOnly'>
              <section className='panel calendarPanel'>
                <Calendar
                  calendarDays={editorCalendarDays}
                  viewDate={editorViewDate}
                  selectedDate={selectedDate}
                  onMoveMonth={moveEditorMonth}
                  onSelectDay={(day) => openAttendanceDay(day, 'editor')}
                />
              </section>
            </main>
          }
        />
        {/* Member Directory moved behind the password-protected administrator
            area. Redirect any old links there. */}
        <Route
          path='/member-directory'
          element={<Navigate to='/administrator' replace />}
        />
        <Route
          path='/leadership-overview'
          element={<LeadershipOverview members={members} districtLeaders={districtLeaders} />}
        />
        <Route
          path='/administrator'
          element={
            <AdminPage
              members={members}
              districtLeaders={districtLeaders}
              onMembersChanged={async (notice) => {
                setMessage(notice || 'Member list updated.');
                await loadMembers();
              }}
              onDistrictLeadersChanged={loadSettings}
              onError={setError}
            />
          }
        />
      </Routes>

      {openModal && (
        <AttendanceModal mode={openModal} onClose={() => setOpenModal(null)}>
          {openModal === 'viewer' ? (
            <AttendanceViewer
              selectedReadable={selectedReadable}
              loading={loading}
              presentPeople={filteredPresent}
              hierarchicalAttendance={hierarchicalAttendance}
              totalPresent={presentPeople.length}
              search={viewerSearch}
              onSearch={setViewerSearch}
            />
          ) : (
            <AttendanceEditor
              selectedReadable={selectedReadable}
              loading={loading}
              saving={saving}
              attendance={filteredAttendance}
              hierarchicalAttendance={hierarchicalAttendance}
              search={editorSearch}
              onSearch={setEditorSearch}
              onChangeStatus={saveAttendance}
            />
          )}
        </AttendanceModal>
      )}

      <PasswordModal
        isOpen={passwordModalOpen}
        password={passwordInput}
        onPasswordChange={setPasswordInput}
        onSubmit={handlePasswordSubmit}
        onCancel={() => {
          setPasswordModalOpen(false);
          setPasswordInput('');
          setPasswordError('');
          setDownloading(false);
          setDownloadStatus('');
        }}
        error={passwordError}
        loading={downloading}
        status={downloadStatus}
      />
    </div>
  );
}

export default App;
