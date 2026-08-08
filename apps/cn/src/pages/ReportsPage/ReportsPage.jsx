import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { parseDate, dateToStr, formatDateNice, manilaToday, uiLocale } from '../../lib/format.js';
import { buildTeacherScheduleReportsFile, getDateRange, filenameDate } from '../../lib/exporters/xlsx.js';
import { runExportZip, ensureRangeLoaded } from '../../lib/exporters/run.js';
import ExportModal from '../../components/ui/ExportModal.jsx';
import { compareScheduleTimeslots } from '../../lib/scheduleHelpers.js';
import { getReadableTextColor } from '../../lib/accountStatus.js';
import { getReportAbsentLabelT, formatSubmittedAt } from '../../lib/reportHelpers.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import Lightbox from '../../components/ui/Lightbox.jsx';
import { SkeletonCalendar } from '../../components/ui/Skeleton.jsx';
import ClassReportContent from './ClassReportContent.jsx';
import ReportFilingModal from './ReportFilingModal.jsx';
import { findStudentForSchedule } from '../../lib/studentLookup.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Admin Class Reports browser: calendar → day sessions → class report.
// (Report filing/editing is the shared modal built in the next increment.)
export default function ReportsPage() {
  const data = useData();
  const toast = useToast();
  const tr = useT();
  const [view, setView] = useState('cal'); // cal | day | class
  const [exportModal, setExportModal] = useState({ open: false, mode: 'download' });
  const [filterTeacher, setFilterTeacher] = useState('');
  const now = manilaToday();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewSchedId, setViewSchedId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [editSession, setEditSession] = useState(null);

  const [firstLoad, setFirstLoad] = useState(true);
  useEffect(() => {
    data.ensureTeachers();
    // Students feed the Username/Info shown on the report view + the download.
    data.ensureStudents();
  }, [data]);
  useEffect(() => {
    let alive = true;
    data.ensureMonth(calYear, calMonth).finally(() => {
      if (alive) setFirstLoad(false);
    });
    return () => {
      alive = false;
    };
  }, [data, calYear, calMonth]);

  // Reports scroll UX: opening a report jumps the view to the top; returning to the day
  // list restores the exact scroll position you were at — so long lists of reports are easy
  // to review without scrolling down again each time.
  const savedDayScrollRef = useRef(0);
  const prevViewRef = useRef(view);
  useLayoutEffect(() => {
    const main = document.querySelector('.main');
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (!main) return;
    if (view === 'class') main.scrollTop = 0;
    else if (view === 'day') main.scrollTop = prev === 'class' ? savedDayScrollRef.current || 0 : 0;
  }, [view]);

  const reportFor = (schedId) => data.reports.find((r) => r.schedule_id == schedId);
  const teacherById = (id) => data.teachers.find((t) => t.id == id);

  const monthLabel = new Date(calYear, calMonth).toLocaleDateString(uiLocale(), {
    month: 'long',
    year: 'numeric',
  });

  const dayMap = useMemo(() => {
    const map = {};
    data.schedules.forEach((s) => {
      if (filterTeacher && s.teacher_id != filterTeacher) return;
      const sd = parseDate(s.date);
      if (sd.getMonth() !== calMonth || sd.getFullYear() !== calYear) return;
      (map[sd.getDate()] = map[sd.getDate()] || []).push(s);
    });
    return map;
  }, [data.schedules, filterTeacher, calYear, calMonth]);

  const prevMonth = () => {
    const d = new Date(calYear, calMonth - 1, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  };
  const nextMonth = () => {
    const d = new Date(calYear, calMonth + 1, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  };

  // ----- Calendar view -----
  const renderCalendar = () => {
    const startDow = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = manilaToday();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(<div className="cal-day empty" key={'e' + i} />);
    for (let day = 1; day <= daysInMonth; day++) {
      const sessions = dayMap[day] || [];
      const isToday =
        today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear;
      cells.push(
        <div
          className={'cal-day' + (isToday ? ' today' : '')}
          key={day}
          style={{ opacity: sessions.length ? 1 : 0.4, cursor: sessions.length ? 'pointer' : 'default' }}
          onClick={() => {
            if (!sessions.length) return;
            setSelectedDate(new Date(calYear, calMonth, day));
            setView('day');
          }}
        >
          <div className="cal-day-num">{day}</div>
          <div className="cal-day-dots">
            {sessions.slice(0, 4).map((s) => {
              const r = reportFor(s.id);
              return (
                <div
                  key={s.id}
                  className={
                    'cal-dot' + (s.cancelled ? ' purple' : r && r.absent ? ' red' : r ? ' green' : '')
                  }
                ></div>
              );
            })}
            {sessions.length > 4 && (
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{sessions.length - 4}</div>
            )}
          </div>
        </div>,
      );
    }
    return (
      <div className="card report-cal-view" style={{ marginBottom: 20 }}>
        <div className="calendar-nav">
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}>
            <i className="fa-solid fa-chevron-left" aria-hidden="true"></i> {tr('reports.prev')}
          </button>
          <div className="cal-title">{monthLabel}</div>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}>
            {tr('reports.next')} <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
        <div className="cal-grid">
          {DOW.map((d, i) => (
            <div className="cal-dow" key={d}>
              {tr('sched.day' + i)}
            </div>
          ))}
        </div>
        <div className="cal-grid" style={{ marginTop: 6 }}>
          {cells}
        </div>
        <div className="cal-legend">
          <span className="cal-legend-item">
            <span className="cal-dot green"></span>{tr('cal.present')}
          </span>
          <span className="cal-legend-item">
            <span className="cal-dot red"></span>{tr('cal.absent')}
          </span>
          <span className="cal-legend-item">
            <span className="cal-dot"></span>{tr('cal.noReport')}
          </span>
          <span className="cal-legend-item">
            <span className="cal-dot purple"></span>{tr('cal.cancelled')}
          </span>
        </div>
      </div>
    );
  };

  // ----- Day sessions view -----
  const renderDay = () => {
    const day = selectedDate.getDate();
    const sessions = (dayMap[day] || []).slice();
    const dayLabel = selectedDate.toLocaleDateString(uiLocale(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const teacherMap = {};
    sessions.forEach((s) => (teacherMap[s.teacher_id] = teacherMap[s.teacher_id] || []).push(s));
    const teacherIds = Object.keys(teacherMap);
    const gridClass =
      teacherIds.length === 1
        ? 'report-teacher-day-grid single-teacher'
        : teacherIds.length === 2
        ? 'report-teacher-day-grid two-teachers'
        : 'report-teacher-day-grid';
    return (
      <>
        <div className="report-month-header">
          <button className="back-btn" onClick={() => setView('cal')} aria-label={tr('reports.backToCal')}>
            <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <div>
            <div className="page-title">{tr('reports.title')}</div>
            <div className="page-sub">{dayLabel}</div>
          </div>
        </div>
        {!sessions.length ? (
          <div className="empty-state">
            <p>{tr('reports.noSessions')}</p>
          </div>
        ) : (
          <div className={gridClass}>
            {teacherIds.map((tid) => {
              const teacher = teacherById(tid);
              const color = teacher?.color || '#2563eb';
              const headerText = getReadableTextColor(color);
              const tSessions = teacherMap[tid].slice().sort(compareScheduleTimeslots);
              return (
                <div className="report-day-card" key={tid}>
                  <div className="report-day-header" style={{ background: color, color: headerText }}>
                    <span>{teacher ? teacher.fullname : tr('reports.unknown')}</span>
                    <span>
                      {tSessions.length === 1
                        ? tr('reports.classOne', { n: tSessions.length })
                        : tr('reports.classMany', { n: tSessions.length })}
                    </span>
                  </div>
                  {tSessions.map((s) => {
                    const r = reportFor(s.id);
                    const cancelled = !!s.cancelled;
                    const absent = !cancelled && r && r.absent;
                    const present = !cancelled && r && !r.absent;
                    return (
                      <div className="report-session" key={s.id}>
                        <div className="session-time">{s.timeslot}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="session-student">
                            {s.student}
                            {s.trial ? (
                              <span className="badge" style={{ background: '#2563eb', color: '#fff', marginLeft: 6 }}>
                                {tr('report.trialClass')}
                              </span>
                            ) : null}
                            {cancelled ? (
                              <span className="badge badge-purple" style={{ marginLeft: 6 }}>
                                {tr('reports.cancelledClass')}
                              </span>
                            ) : absent ? (
                              <span className="badge badge-red" style={{ marginLeft: 6 }}>
                                {tr('cal.absent')}
                              </span>
                            ) : present ? (
                              <span className="badge badge-green" style={{ marginLeft: 6 }}>
                                {tr('cal.present')}
                              </span>
                            ) : (
                              <span className="badge badge-yellow" style={{ marginLeft: 6 }}>
                                {tr('reports.noReportBadge')}
                              </span>
                            )}
                          </div>
                          {s.note && (
                            <div className="session-note">
                              <span className="icon-inline">
                                <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                              </span>
                              {s.note}
                            </div>
                          )}
                          {r && (
                            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                              <span className="icon-inline">
                                <i className="fa-solid fa-clipboard-check" aria-hidden="true"></i>
                              </span>
                              {r.submitted_at ? tr('reports.submittedPrefix', { date: formatSubmittedAt(r.submitted_at) }) : tr('reports.noSubmitDate')}
                            </div>
                          )}
                          {r && (
                            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                              {(r.book || '-') + ' · ' + (r.pages || '-') + ' · ' + (r.class_duration || '-')}
                            </div>
                          )}
                          {r && r.absent && (
                            <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 3 }}>
                              {getReportAbsentLabelT(r, tr)}
                            </div>
                          )}
                          {cancelled && (
                            <div style={{ fontSize: 12, color: 'var(--purple)', marginTop: 3 }}>
                              <span className="icon-inline">
                                <i className="fa-solid fa-ban" aria-hidden="true"></i>
                              </span>
                              {s.cancel_reason ? s.cancel_reason : tr('reports.cancelledNoReason')}
                            </div>
                          )}
                        </div>
                        <div className="session-badge">
                          {!cancelled && r && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                const main = document.querySelector('.main');
                                savedDayScrollRef.current = main ? main.scrollTop : 0;
                                setViewSchedId(s.id);
                                setView('class');
                              }}
                            >
                              {tr('reports.viewReport')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  // ----- Class report view -----
  const renderClass = () => {
    const s = data.schedules.find((x) => x.id == viewSchedId);
    const r = reportFor(viewSchedId);
    if (!s || !r) {
      return (
        <div className="empty-state">
          <p>{tr('reports.noReportFound')}</p>
        </div>
      );
    }
    const teacher = teacherById(s.teacher_id);
    const teacherName = teacher ? teacher.fullname : tr('reports.unknown');
    const dateLabel = parseDate(s.date).toLocaleDateString(uiLocale(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    return (
      <>
        <div className="report-month-header">
          <button className="back-btn" onClick={() => setView('day')} aria-label={tr('reports.backToSchedule')}>
            <i className="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <div>
            <div className="page-title">{tr('reports.classReportTitle', { student: s.student })}</div>
            <div className="page-sub">
              {teacherName} · {s.timeslot} · {dateLabel}
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => setEditSession(s)}
          >
            <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i> {tr('reports.editReport')}
          </button>
        </div>
        <div className="card">
          <ClassReportContent
            schedule={s}
            report={r}
            teacherName={teacherName}
            dateLabel={dateLabel}
            onImageClick={setLightbox}
            studentMeta={findStudentForSchedule(data.students, s)}
          />
        </div>
      </>
    );
  };

  const handleExport = async (s, e, selectedIds) => {
    const mode = exportModal.mode;
    if (!selectedIds || !selectedIds.length) return toast(tr('reports.selectTeacher'));
    if (!getDateRange(s, e).length) return toast(tr('reports.validRange'));
    await ensureRangeLoaded(data, s, e);
    const exportTeachers = data.teachers.filter((t) => selectedIds.includes(String(t.id)));
    const files = [];
    for (const t of exportTeachers) {
      // Passing students adds the Username/Info columns to the reports sheet.
      files.push(await buildTeacherScheduleReportsFile(t, data.schedules, data.reports, s, e, data.students));
    }
    await runExportZip(files, `${filenameDate(s, e)}-reports`, mode, toast);
    setExportModal({ open: false, mode });
  };

  // Legacy report-download-summary text.
  const reportSummary = (s, e, ids) => {
    const dates = s && e ? getDateRange(s, e) : [];
    const teacherLabel =
      ids.length === data.teachers.length
        ? tr('reports.allTeachers')
        : ids.length === 1
        ? tr('reports.nTeachersOne', { n: ids.length })
        : tr('reports.nTeachersMany', { n: ids.length });
    const dateLabel = dates.length
      ? (dates.length === 1
          ? tr('reports.nDaysOne', { n: dates.length, from: formatDateNice(s), to: formatDateNice(e) })
          : tr('reports.nDaysMany', { n: dates.length, from: formatDateNice(s), to: formatDateNice(e) }))
      : tr('reports.selectValidDates');
    const exportLabel = tr('reports.oneXlsxPerTeacher');
    return tr('reports.exportSummary', { teachers: teacherLabel, dates: dateLabel, export: exportLabel });
  };

  const exportDefaultStart = dateToStr(new Date(calYear, calMonth, 1));
  const exportDefaultEnd = dateToStr(new Date(calYear, calMonth + 1, 0));

  return (
    <section className="page active" id="page-reports">
      {view === 'cal' && (
        <>
          <div className="page-header">
            <div>
              <div className="page-title">{tr('reports.title')}</div>
              <div className="page-sub">{tr('reports.subtitle')}</div>
            </div>
            <div className="report-header-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setExportModal({ open: true, mode: 'download' })}>
                <i className="fa-solid fa-download" aria-hidden="true"></i> {tr('reports.downloadBtn')}
              </button>
            </div>
          </div>
          <div className="filter-bar">
            <span className="filter-label">{tr('reports.filterByTeacher')}</span>
            <select
              className="filter-select"
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
            >
              <option value="">{tr('reports.allTeachers')}</option>
              {data.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullname}
                </option>
              ))}
            </select>
            {filterTeacher && (
              <button className="btn btn-secondary btn-sm" onClick={() => setFilterTeacher('')}>
                <i className="fa-solid fa-xmark" aria-hidden="true"></i> {tr('reports.clearFilter')}
              </button>
            )}
          </div>
          {firstLoad ? <SkeletonCalendar /> : renderCalendar()}
        </>
      )}
      {view === 'day' && selectedDate && renderDay()}
      {view === 'class' && renderClass()}

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      <ReportFilingModal
        open={!!editSession}
        onClose={() => setEditSession(null)}
        session={editSession}
      />

      <ExportModal
        open={exportModal.open}
        onClose={() => setExportModal((m) => ({ ...m, open: false }))}
        title={tr('reports.downloadReports')}
        confirmLabel={<><i className="fa-solid fa-download"></i> {tr('common.download')}</>}
        defaultStart={exportDefaultStart}
        defaultEnd={exportDefaultEnd}
        teachers={data.teachers}
        showQuickFilter
        clearLabel={tr('reports.clearFilter')}
        initialSelectedIds={filterTeacher ? [filterTeacher] : null}
        buildSummary={reportSummary}
        onConfirm={handleExport}
      />
    </section>
  );
}
