import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { dateToStr, parseDate, formatDateNice, manilaToday } from '../../lib/format.js';
import { getReadableTextColor, isActiveAccount } from '../../lib/accountStatus.js';
import {
  buildLessonTrackerRows,
  dateRangeArray,
} from '../../lib/lessonTracker.js';
import { getReportAbsentLabelT } from '../../lib/reportHelpers.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { buildLessonTrackerFile, getDateRange, filenameDate } from '../../lib/exporters/xlsx.js';
import { runExportZip, ensureRangeLoaded } from '../../lib/exporters/run.js';
import { useToast } from '../../context/ToastProvider.jsx';
import ExportModal from '../../components/ui/ExportModal.jsx';
import LessonTrackerEditor from './LessonTrackerEditor.jsx';
import StickyToolbar from '../../components/Layout/StickyToolbar.jsx';
import { SkeletonCards } from '../../components/ui/Skeleton.jsx';

// Translated UI table headers. The English lessonTrackerHeaders() in
// lib/lessonTracker.js stays untouched — the XLSX export uses that one.
const TRACKER_HEADER_KEYS = (showInfo) => [
  'tracker.timestamp',
  'tracker.studentName',
  'common.username',
  ...(showInfo ? ['report.info'] : []),
  'report.material',
  'report.pages',
  'tracker.date',
  'tracker.time',
  'report.duration',
  'report.studentIs',
  'report.remarks',
];

// `showInfo`: admins also see the Info column (Students tab → Notes); teachers
// only get the Username column.
function TrackerTable({ rows, showInfo = false }) {
  const t = useT();
  if (!rows.length) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-icon">
            <i className="fa-solid fa-table-list" aria-hidden="true"></i>
          </div>
          <p>{t('tracker.noData')}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ maxWidth: '100%' }}>
      <div className="lesson-tracker-table-wrap">
        <table className="lesson-tracker-table">
          <colgroup>
            <col className="lesson-tracker-col-timestamp" />
            <col className="lesson-tracker-col-student" />
            <col className="lesson-tracker-col-username" />
            {showInfo && <col className="lesson-tracker-col-info" />}
            <col className="lesson-tracker-col-material" />
            <col className="lesson-tracker-col-pages" />
            <col className="lesson-tracker-col-date" />
            <col className="lesson-tracker-col-time" />
            <col className="lesson-tracker-col-duration" />
            <col className="lesson-tracker-col-status" />
            <col className="lesson-tracker-col-remarks" />
          </colgroup>
          <thead>
            <tr>
              {TRACKER_HEADER_KEYS(showInfo).map((k) => (
                <th key={k}>{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.reportId}>
                <td>{row.timestamp}</td>
                <td>{row.student}</td>
                <td>{row.username}</td>
                {showInfo && <td>{row.info}</td>}
                <td>{row.book}</td>
                <td>{row.pages}</td>
                <td>{row.dateLabel}</td>
                <td>{row.time}</td>
                <td>{row.classDuration}</td>
                <td>{getReportAbsentLabelT(row.report, t)}</td>
                <td>{row.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LessonTrackerPage() {
  const { user, isAdmin } = useAuth();
  const data = useData();
  const toast = useToast();
  // NOTE: `t` is used as the teacher arrow-param throughout this component, so
  // the translator is aliased `tr` (TrackerTable above uses plain `t`).
  const tr = useT();
  const [exportModal, setExportModal] = useState({ open: false, mode: 'download' });

  const now = manilaToday();
  const firstOfMonth = dateToStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const todayStr = dateToStr(now);
  const [start, setStart] = useState(firstOfMonth);
  const [end, setEnd] = useState(todayStr);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(null); // null = all (admin)
  const [editorOpen, setEditorOpen] = useState(false);
  const [ltFilterOpen, setLtFilterOpen] = useState(false); // sticky-toolbar teacher checklist

  useEffect(() => {
    data.ensureTeachers();
    // Students feed the Username (+ admin Info) tracker columns. For teachers the
    // server returns a limited projection (id/name/username only).
    data.ensureStudents();
  }, [data]);

  // Ensure every month spanned by [start, end] is loaded.
  const [firstLoad, setFirstLoad] = useState(true);
  useEffect(() => {
    const s = parseDate(start);
    const e = parseDate(end);
    if (isNaN(s) || isNaN(e) || s > e) return;
    const seen = new Set();
    const tasks = [];
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      const key = cur.getFullYear() + '-' + cur.getMonth();
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push(data.ensureMonth(cur.getFullYear(), cur.getMonth()));
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    let alive = true;
    Promise.all(tasks).finally(() => {
      if (alive) setFirstLoad(false);
    });
    return () => {
      alive = false;
    };
  }, [data, start, end]);

  const activeTeachers = useMemo(() => data.teachers.filter(isActiveAccount), [data.teachers]);
  const isSelected = (id) => selectedIds === null || selectedIds.has(String(id));

  const dateRange = useMemo(() => dateRangeArray(start, end), [start, end]);

  const filterBySearch = (rows) => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.student || '').toLowerCase().includes(q));
  };

  // Teacher: own rows. Admin: rows per selected teacher.
  const teacherRows = useMemo(() => {
    if (isAdmin) return [];
    return filterBySearch(
      buildLessonTrackerRows(data.reports, data.schedules, data.teachers, user.id, dateRange, data.students),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, data.reports, data.schedules, data.teachers, data.students, user.id, dateRange, studentSearch]);

  const adminTeacherCards = useMemo(() => {
    if (!isAdmin) return [];
    const selected = activeTeachers.filter((t) => isSelected(t.id));
    return selected
      .map((teacher) => ({
        teacher,
        rows: filterBySearch(
          buildLessonTrackerRows(data.reports, data.schedules, data.teachers, teacher.id, dateRange, data.students),
        ),
      }))
      .sort((a, b) => {
        if (!!a.rows.length !== !!b.rows.length) return a.rows.length ? -1 : 1;
        return String(a.teacher.fullname || '').localeCompare(String(b.teacher.fullname || ''));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeTeachers, selectedIds, data.reports, data.schedules, data.teachers, data.students, dateRange, studentSearch]);

  const allCurrentRows = useMemo(
    () => (isAdmin ? adminTeacherCards.flatMap((c) => c.rows) : teacherRows),
    [isAdmin, adminTeacherCards, teacherRows],
  );

  const toggleTeacher = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev === null ? activeTeachers.map((t) => String(t.id)) : prev);
      const k = String(id);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const nTeachersLabel = (n) =>
    n === 1 ? tr('reports.nTeachersOne', { n }) : tr('reports.nTeachersMany', { n });
  const nReportsLabel = (n) =>
    n === 1 ? tr('tracker.nReportsOne', { n }) : tr('tracker.nReportsMany', { n });
  const summary = isAdmin
    ? tr('tracker.summaryAdmin', {
        teachers: nTeachersLabel(adminTeacherCards.length),
        reports: nReportsLabel(allCurrentRows.length),
        from: formatDateNice(start),
        to: formatDateNice(end),
      })
    : tr('tracker.summaryTeacher', {
        reports: nReportsLabel(teacherRows.length),
        from: formatDateNice(start),
        to: formatDateNice(end),
      });

  // Both admin and teacher go through the same v15 lesson-tracker download modal
  // (teacher checklist — for a teacher that's just themselves). Always bundle per
  // the SPA: one XLSX per selected teacher inside a ZIP.
  const handleExport = async (s, e, pickedIds) => {
    const mode = exportModal.mode;
    if (!getDateRange(s, e).length) return toast(tr('reports.validRange'));
    if (!pickedIds || !pickedIds.length) return toast(tr('reports.selectTeacher'));
    await ensureRangeLoaded(data, s, e);
    const range = dateRangeArray(s, e);
    const exportTeachers = activeTeachers.filter((t) => pickedIds.includes(String(t.id)));
    const files = [];
    for (const t of exportTeachers) {
      const rows = buildLessonTrackerRows(data.reports, data.schedules, data.teachers, t.id, range, data.students);
      files.push(await buildLessonTrackerFile(t, rows, s, e, { includeInfo: isAdmin }));
    }
    await runExportZip(files, `${filenameDate(s, e)}-lesson_tracker`, mode, toast);
    setExportModal({ open: false, mode });
  };

  // Legacy lesson-download-summary text (same for admin + teacher).
  const lessonSummary = (s, e, ids) => {
    const dates = s && e ? getDateRange(s, e) : [];
    const dateLabel = dates.length
      ? tr('tracker.dateRange', { from: formatDateNice(s), to: formatDateNice(e) })
      : tr('reports.selectValidDates');
    return tr('tracker.exportSummary', {
      teachers: nTeachersLabel(ids.length),
      dates: dateLabel,
      export: tr('reports.oneXlsxPerTeacher'),
    });
  };

  return (
    <section className="page active" id="page-lesson-tracker">
      {isAdmin && (
        <StickyToolbar triggerIcon="fa-clipboard-list" triggerLabel={tr('tracker.tools')}>
          {({ collapse }) => (
            <>
              <div className="toolbar-flex-row">
                <div className="toolbar-date-group">
                  <input
                    type="date"
                    className="form-control"
                    style={{ width: 140, fontSize: 13 }}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                  <span style={{ color: 'var(--text3)' }}>{tr('tracker.rangeSep')}</span>
                  <input
                    type="date"
                    className="form-control"
                    style={{ width: 140, fontSize: 13 }}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                  <button className="btn btn-primary btn-sm">
                    <i className="fa-solid fa-eye"></i> {tr('tracker.view')}
                  </button>
                </div>
                <span className="toolbar-sep"></span>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(null)}>
                  {tr('sched.all')}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>
                  {tr('sched.clear')}
                </button>
                <input
                  type="search"
                  className="form-control"
                  placeholder={tr('tracker.studentNamePh')}
                  style={{ width: 140, fontSize: 13 }}
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
                <span className="toolbar-sep"></span>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditorOpen(true)}>
                  <i className="fa-solid fa-pen-to-square"></i> {tr('common.edit')}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setExportModal({ open: true, mode: 'download' })}>
                  <i className="fa-solid fa-download"></i> {tr('common.download')}
                </button>
                <button
                  className="btn btn-secondary btn-sm toolbar-toggle-filter"
                  onClick={() => setLtFilterOpen((o) => !o)}
                  title={tr('sched.toggleFilter')}
                >
                  <i className="fa-solid fa-filter"></i>
                </button>
                <span className="toolbar-sep"></span>
                <button className="btn btn-secondary btn-sm" onClick={collapse} title={tr('sched.hideToolbar')}>
                  <i className="fa-solid fa-chevron-up"></i> {tr('sched.hide')}
                </button>
              </div>
              {ltFilterOpen && (
                <div className="toolbar-filter-collapse" style={{ display: 'block' }}>
                  <div className="teacher-check-list six-columns">
                    {activeTeachers.map((t) => (
                      <label className="teacher-check-item" key={t.id}>
                        <input type="checkbox" checked={isSelected(t.id)} onChange={() => toggleTeacher(t.id)} />
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: t.color || '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {(t.fullname || '').charAt(0)}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{t.fullname}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </StickyToolbar>
      )}

      {/* Teacher POV: same scroll-triggered tools as the admin toolbar (all
          screen widths) — date range + download, with a centered Hide below. */}
      {!isAdmin && (
        <StickyToolbar triggerIcon="fa-clipboard-list" triggerLabel={tr('tracker.tools')}>
          {({ collapse }) => (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div className="toolbar-flex-row" style={{ justifyContent: 'center' }}>
                <div className="toolbar-date-group">
                  <input
                    type="date"
                    className="form-control"
                    style={{ width: 140, fontSize: 13 }}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                  <span style={{ color: 'var(--text3)' }}>{tr('tracker.rangeSep')}</span>
                  <input
                    type="date"
                    className="form-control"
                    style={{ width: 140, fontSize: 13 }}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
                <span className="toolbar-sep"></span>
                <button className="btn btn-secondary btn-sm" onClick={() => setExportModal({ open: true, mode: 'download' })}>
                  <i className="fa-solid fa-download"></i> {tr('common.download')}
                </button>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={collapse} title={tr('sched.hideToolbar')}>
                <i className="fa-solid fa-chevron-up"></i> {tr('sched.hide')}
              </button>
            </div>
          )}
        </StickyToolbar>
      )}

      <div className="report-month-header">
        <div>
          <div className="page-title">{tr('nav.lessonTracker')}</div>
          <div className="page-sub">
            {isAdmin ? tr('tracker.subAdmin') : tr('tracker.subTeacher')}
          </div>
        </div>
        <div className="lesson-tracker-header-actions" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setExportModal({ open: true, mode: 'download' })}>
            <i className="fa-solid fa-download" aria-hidden="true"></i> {tr('tracker.download')}
          </button>
        </div>
      </div>

      <div className="card lesson-tracker-filter-card" style={{ marginBottom: 16 }}>
        <div className="lesson-tracker-date-row">
          <div className="form-group">
            <label>{tr('tracker.from')}</label>
            <input type="date" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{tr('tracker.to')}</label>
            <input type="date" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        {isAdmin && (
          <div className="form-group">
            <label>{tr('tracker.teachersToDisplay')}</label>
            <div className="lesson-tracker-filter-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(null)}>
                {tr('sched.allTeachers')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>
                {tr('sched.clear')}
              </button>
            </div>
            <div className="teacher-check-list six-columns">
              {activeTeachers.map((t) => (
                <label className="teacher-check-item" key={t.id}>
                  <input type="checkbox" checked={isSelected(t.id)} onChange={() => toggleTeacher(t.id)} />
                  <div
                    style={{
                      width: 24, height: 24, borderRadius: 6, background: t.color || '#2563eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    {(t.fullname || '').charAt(0)}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{t.fullname}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="page-sub">{summary}</div>

        <div className="lesson-tracker-search-actions-row">
          <div className="form-group lesson-tracker-search-group">
            <label>{tr('tracker.searchStudent')}</label>
            <input
              type="search"
              className="form-control"
              placeholder={tr('tracker.studentNamePh')}
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
          </div>
          {isAdmin && (
            <div className="lesson-tracker-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (!allCurrentRows.length) return;
                  setEditorOpen(true);
                }}
              >
                <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i> {tr('common.edit')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        {firstLoad ? (
          <SkeletonCards count={isAdmin ? 2 : 1} />
        ) : isAdmin ? (
          adminTeacherCards.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">
                  <i className="fa-solid fa-chalkboard-user" aria-hidden="true"></i>
                </div>
                <p>{tr('tracker.selectOneTeacher')}</p>
              </div>
            </div>
          ) : (
            <div className="lesson-tracker-teacher-grid">
              {adminTeacherCards.map(({ teacher, rows }) => {
                const color = teacher.color || '#2563eb';
                return (
                  <div className="card lesson-tracker-teacher-card" key={teacher.id}>
                    <div
                      className="lesson-tracker-teacher-card-header"
                      style={{ background: color, color: getReadableTextColor(color) }}
                    >
                      {teacher.fullname}
                    </div>
                    <div className="lesson-tracker-teacher-card-body">
                      {rows.length ? (
                        <TrackerTable rows={rows} showInfo />
                      ) : (
                        <div className="empty-state" style={{ padding: '28px 16px' }}>
                          <div className="empty-icon">
                            <i className="fa-solid fa-table-list" aria-hidden="true"></i>
                          </div>
                          <p>{tr('tracker.noDataTeacher')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <TrackerTable rows={teacherRows} />
        )}
      </div>

      {isAdmin && (
        <LessonTrackerEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          rows={allCurrentRows}
          teachers={data.teachers}
        />
      )}

      <ExportModal
        open={exportModal.open}
        onClose={() => setExportModal((m) => ({ ...m, open: false }))}
        title={tr('tracker.download')}
        confirmLabel={<><i className="fa-solid fa-download"></i> {tr('common.download')}</>}
        defaultStart={start}
        defaultEnd={end}
        teachers={activeTeachers}
        initialSelectedIds={isAdmin && selectedIds !== null ? [...selectedIds] : null}
        onConfirm={handleExport}
        buildSummary={lessonSummary}
      />
    </section>
  );
}
