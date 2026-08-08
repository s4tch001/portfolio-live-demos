import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch, queryPath } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Lightbox from '../../components/ui/Lightbox.jsx';
import StickyToolbar from '../../components/Layout/StickyToolbar.jsx';
import ClassReportContent from '../ReportsPage/ClassReportContent.jsx';
import { SkeletonCards } from '../../components/ui/Skeleton.jsx';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll.js';
import { dateToStr, manilaToday, parseDate, uiLocale } from '../../lib/format.js';

// Student/parent schedule (China build). Mobile-first AGENDA LIST (not a cramped
// calendar grid): each of the student's own classes is a full-width card that
// always shows the time and teacher clearly at any width. Tapping a class with a
// present report opens a read-only Class Summary. Admin/teacher schedule tab is
// untouched (this component is only rendered for role 'student').
export default function StudentSchedulePage() {
  const { user } = useAuth();
  const t = useT();
  const now = manilaToday();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [schedules, setSchedules] = useState([]);
  const [reports, setReports] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState(null); // { schedule, report }
  const [cancelledInfo, setCancelledInfo] = useState(null); // cancelled schedule
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async (y, m) => {
    setLoaded(false);
    const start = dateToStr(new Date(y, m, 1));
    const end = dateToStr(new Date(y, m + 1, 0));
    try {
      const res = await apiFetch(queryPath('/my-classes', { start, end }));
      setSchedules(Array.isArray(res?.schedules) ? res.schedules : []);
      setReports(Array.isArray(res?.reports) ? res.reports : []);
    } catch (e) {
      setSchedules([]);
      setReports([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load(year, month);
  }, [year, month, load]);

  // Smooth-scroll to today's card once the month is loaded (current month only —
  // other months have no .is-today card, so this is a no-op there).
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      const el = document.querySelector('.stu-sched-list .stu-sched-card.is-today');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    return () => clearTimeout(timer);
  }, [loaded, year, month]);

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  };

  const monthLabel = useMemo(
    () =>
      new Date(year, month, 1).toLocaleDateString(uiLocale(), {
        month: 'long',
        year: 'numeric',
      }),
    [year, month],
  );

  const reportBySchedule = useMemo(() => {
    const map = new Map();
    for (const r of reports) map.set(String(r.schedule_id), r);
    return map;
  }, [reports]);

  // Status per class: cancelled | absent | present | none (no report yet).
  const statusOf = (s) => {
    if (s.cancelled) return 'cancelled';
    const r = reportBySchedule.get(String(s.id));
    if (r && r.absent) return 'absent';
    if (r) return 'present';
    return 'none';
  };
  const statusLabel = (st) =>
    st === 'present'
      ? t('cal.present')
      : st === 'absent'
        ? t('cal.absent')
        : st === 'cancelled'
          ? t('cal.cancelled')
          : t('cal.noReport');

  // Open the detail for a class: present/absent show the report; cancelled shows
  // the cancellation info; not-yet-reported has nothing to open.
  const openCard = (s, st) => {
    if (st === 'present' || st === 'absent') {
      const r = reportBySchedule.get(String(s.id));
      if (r) setSummary({ schedule: s, report: r });
    } else if (st === 'cancelled') {
      setCancelledInfo(s);
    }
  };

  const dateLabel = summary
    ? parseDate(summary.schedule.date).toLocaleDateString(uiLocale(), {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const today = dateToStr(manilaToday());

  // Every day of the month gets a row: the day's class(es), or a blank
  // "No class" placeholder — so the student can scan the whole month and spot
  // today's incoming schedule at a glance.
  const dayRows = useMemo(() => {
    const byDate = new Map();
    for (const s of schedules) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    }
    const rows = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = dateToStr(new Date(year, month, day));
      const list = byDate.get(dateStr);
      if (list && list.length) {
        list.forEach((s) =>
          rows.push({ key: 'c' + s.id, type: 'class', s, date: dateStr }),
        );
      } else {
        rows.push({ key: 'e' + dateStr, type: 'empty', date: dateStr });
      }
    }
    return rows;
  }, [schedules, year, month]);

  // Infinite scroll: reveal the month's rows a page at a time as the student
  // scrolls. Start with enough rows to always include today (so the
  // scroll-to-today below still finds its card on the current month).
  const STU_PAGE = 20;
  const todayRowIndex = useMemo(
    () => dayRows.findIndex((r) => r.date === today),
    [dayRows, today],
  );
  const { visible: visibleDayRows, hasMore, sentinelRef } = useInfiniteScroll(dayRows, {
    pageSize: STU_PAGE,
    initialCount: todayRowIndex >= 0 ? Math.max(STU_PAGE, todayRowIndex + 1) : STU_PAGE,
    resetKey: `${year}-${month}`,
  });

  return (
    <section className='page active' id='page-student-schedule'>
      {/* Scroll-triggered floating month bar (same behavior as the admin
          schedule sticky toolbar). */}
      <StickyToolbar triggerIcon="fa-calendar-days" triggerLabel={t('nav.schedule')}>
        {({ collapse }) => (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div className="stu-sched-monthbar" style={{ marginBottom: 0 }}>
              <button className="btn btn-secondary btn-sm" onClick={prevMonth} aria-label={t('student.prevMonth')}>
                <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
              </button>
              <div className="stu-sched-month">{monthLabel}</div>
              <button className="btn btn-secondary btn-sm" onClick={nextMonth} aria-label={t('student.nextMonth')}>
                <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={collapse} title={t('common.close')}>
              <i className="fa-solid fa-chevron-up" aria-hidden="true"></i>
            </button>
          </div>
        )}
      </StickyToolbar>
      <div className='page-header'>
        <div>
          <div className='page-title'>{t('student.mySchedule')}</div>
          <div className='page-sub'>
            {user?.fullname ? user.fullname : t('student.yourClasses')}
          </div>
        </div>
      </div>

      <div className='stu-sched-legend'>
        <span className='stu-sched-leg-item'>
          <span className='stu-sched-leg-dot present'></span>
          {t('cal.present')}
        </span>
        <span className='stu-sched-leg-item'>
          <span className='stu-sched-leg-dot absent'></span>
          {t('cal.absent')}
        </span>
        <span className='stu-sched-leg-item'>
          <span className='stu-sched-leg-dot none'></span>
          {t('cal.noReport')}
        </span>
        <span className='stu-sched-leg-item'>
          <span className='stu-sched-leg-dot cancelled'></span>
          {t('cal.cancelled')}
        </span>
      </div>

      <div className='stu-sched-monthbar'>
        <button
          className='btn btn-secondary btn-sm'
          onClick={prevMonth}
          aria-label={t('student.prevMonth')}
        >
          <i className='fa-solid fa-chevron-left' aria-hidden='true'></i>
        </button>
        <div className='stu-sched-month'>{monthLabel}</div>
        <button
          className='btn btn-secondary btn-sm'
          onClick={nextMonth}
          aria-label={t('student.nextMonth')}
        >
          <i className='fa-solid fa-chevron-right' aria-hidden='true'></i>
        </button>
      </div>

      {!loaded ? (
        <SkeletonCards count={5} />
      ) : (
        <div className='stu-sched-list'>
          {visibleDayRows.map((row) => {
            const d = parseDate(row.date);
            const isToday = row.date === today;
            const dateCol = (
              <div className='stu-sched-datecol'>
                <div className='stu-sched-dow'>
                  {d.toLocaleDateString(uiLocale(), { weekday: 'short' })}
                </div>
                <div className='stu-sched-daynum'>{d.getDate()}</div>
                <div className='stu-sched-mon'>
                  {d.toLocaleDateString(uiLocale(), { month: 'short' })}
                </div>
                {isToday && (
                  <div className='stu-sched-todaytag'>{t('common.today')}</div>
                )}
              </div>
            );

            if (row.type === 'empty') {
              return (
                <div
                  key={row.key}
                  className={
                    'stu-sched-card noclass' + (isToday ? ' is-today' : '')
                  }
                >
                  {dateCol}
                  <div className='stu-sched-main stu-sched-noclass-main'>—</div>
                  <div className='stu-sched-side'>
                    <span className='stu-sched-badge noclass'>
                      {t('cal.noClass')}
                    </span>
                  </div>
                </div>
              );
            }

            const s = row.s;
            const st = statusOf(s);
            const clickable = st !== 'none';
            const isTrial = !!s.trial;
            return (
              <div
                key={row.key}
                className={
                  'stu-sched-card ' +
                  st +
                  (clickable ? ' clickable' : '') +
                  (isToday ? ' is-today' : '')
                }
                onClick={clickable ? () => openCard(s, st) : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter') openCard(s, st);
                      }
                    : undefined
                }
              >
                {dateCol}
                <div className='stu-sched-main'>
                  <div className='stu-sched-time'>
                    <i className='fa-regular fa-clock' aria-hidden='true'></i>
                    <span>{s.timeslot || '-'}</span>
                    {isTrial && (
                      <span className='stu-sched-trial'>
                        {t('report.trialClass')}
                      </span>
                    )}
                  </div>
                  <div className='stu-sched-teacher'>
                    <i className='fa-regular fa-user' aria-hidden='true'></i>
                    <span>{s.teacher_name || '-'}</span>
                  </div>
                </div>
                <div className='stu-sched-side'>
                  <span className={'stu-sched-badge ' + st}>
                    {statusLabel(st)}
                  </span>
                  {clickable && (
                    <i
                      className='fa-solid fa-chevron-right stu-sched-go'
                      aria-hidden='true'
                    ></i>
                  )}
                </div>
              </div>
            );
          })}
          {hasMore && (
            <div ref={sentinelRef} className='stu-sched-sentinel' aria-hidden='true' style={{ height: 1 }} />
          )}
        </div>
      )}

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />

      <Modal
        open={!!summary}
        onClose={() => setSummary(null)}
        title={t('student.classSummary')}
        maxWidth='760px'
      >
        <div className='modal-body'>
          {summary && (
            <ClassReportContent
              schedule={summary.schedule}
              report={summary.report}
              teacherName={
                summary.report.teacher_name ||
                summary.schedule.teacher_name ||
                '-'
              }
              dateLabel={dateLabel}
              onImageClick={setLightbox}
            />
          )}
        </div>
      </Modal>

      <Modal
        open={!!cancelledInfo}
        onClose={() => setCancelledInfo(null)}
        title={t('student.cancelledTitle')}
        maxWidth='560px'
      >
        {cancelledInfo && (
          <div className='modal-body'>
            <div className='stu-cancel-banner'>
              <i className='fa-solid fa-ban' aria-hidden='true'></i>{' '}
              {t('student.cancelledBanner')}
            </div>
            <div className='stu-cancel-lines'>
              <div>
                <span className='stu-cancel-lbl'>{t('report.student')}:</span>{' '}
                {cancelledInfo.student || '-'}
              </div>
              <div>
                <span className='stu-cancel-lbl'>
                  {t('report.dateOfClass')}:
                </span>{' '}
                {parseDate(cancelledInfo.date).toLocaleDateString(uiLocale(), {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              <div>
                <span className='stu-cancel-lbl'>
                  {t('report.timeOfClass')}:
                </span>{' '}
                {cancelledInfo.timeslot || '-'}
              </div>
              <div>
                <span className='stu-cancel-lbl'>{t('student.reason')}:</span>{' '}
                {cancelledInfo.cancel_reason
                  ? cancelledInfo.cancel_reason
                  : t('student.noReason')}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
