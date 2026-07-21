import { useState, useEffect, useMemo } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { dateToStr, parseDate, uiLocale } from '../../lib/format.js';
import { sortSchedulesByTime } from '../../lib/scheduleHelpers.js';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll.js';

// Status legend, shared so SchedulePage can render it ABOVE the month controls
// for teachers (user preference) while this view stays legend-free.
export function CalLegend() {
  const t = useT();
  return (
    <div className="cal-legend">
      <span className="cal-legend-item">
        <span className="cal-dot green"></span>{t('cal.present')}
      </span>
      <span className="cal-legend-item">
        <span className="cal-dot red"></span>{t('cal.absent')}
      </span>
      <span className="cal-legend-item">
        <span className="cal-dot"></span>{t('cal.noReport')}
      </span>
      <span className="cal-legend-item">
        <span className="cal-dot purple"></span>{t('cal.cancelled')}
      </span>
    </div>
  );
}

// Teacher calendar grid (legacy renderCalendar teacher branch). Day cells show
// event chips; clicking a day opens a read-only detail of that day's classes.
export default function TeacherCalendarView({ year, month, schedules, reports, onSessionClick }) {
  const t = useT();
  const [dayDetail, setDayDetail] = useState(null); // { label, sessions }
  const [cancelledInfo, setCancelledInfo] = useState(null); // cancelled schedule
  const [noteInfo, setNoteInfo] = useState(null); // schedule whose admin note is shown

  // Phone/tablet agenda: smooth-scroll to today's card when the tab opens on the
  // current month (no-op when the agenda is hidden on desktop or no today card).
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = document.querySelector('.tcal-agenda .tcal-card.is-today');
      if (el && el.offsetParent !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, schedules.length]);

  const statusClass = (sched) => {
    if (sched.cancelled) return 'cancelled'; // counts as reported
    const r = reports.find((x) => x.schedule_id == sched.id);
    if (r && r.absent) return 'absent';
    if (r) return 'present';
    return 'no-report';
  };

  const monthSchedules = schedules.filter((s) => {
    const sd = parseDate(s.date);
    return sd.getMonth() === month && sd.getFullYear() === year;
  });
  const dayMap = {};
  monthSchedules.forEach((s) => {
    const day = parseDate(s.date).getDate();
    (dayMap[day] = dayMap[day] || []).push(s);
  });

  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const chip = (s) => {
    const isTrial = !!s.trial;
    const isCancelled = !!s.cancelled;
    const hasNote = !!String(s.note || '').trim();
    const who = s.student || t('sched.student');
    const slot = s.timeslot || '';
    const title = isCancelled
      ? `${slot} · ${who} · ${t('cal.cancelled')}`
      : isTrial
      ? `${slot} · ${who} · ${t('sched.trialClass')}`
      : `${slot} · ${who}`;
    return (
      <div
        key={s.id}
        className={
          'cal-event ' +
          statusClass(s) +
          ' teacher-schedule-event' +
          (isTrial ? ' trial-class' : '') +
          (hasNote ? ' has-note' : '')
        }
        role="button"
        tabIndex={0}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setDayDetail(null);
          // A cancelled class counts as reported — no report to file; show its info.
          if (isCancelled) {
            setCancelledInfo(s);
            return;
          }
          if (onSessionClick) onSessionClick(s);
        }}
      >
        <span className="cal-event-time">{s.timeslot || ''}</span>
        <span
          className="cal-event-title"
          style={isTrial ? { color: '#2563eb', fontWeight: 700 } : undefined}
        >
          {who + (isCancelled ? ' · ' + t('cal.cancelled') : isTrial ? ' · ' + t('cal.trial') : '')}
        </span>
        {hasNote && (
          <button
            type="button"
            className="cal-event-note-btn"
            title={t('sched.viewNote')}
            aria-label={t('sched.viewNoteFor', { student: who })}
            onClick={(e) => {
              e.stopPropagation();
              setNoteInfo(s);
            }}
          >
            <i className="fa-solid fa-note-sticky" aria-hidden="true"></i>
          </button>
        )}
      </div>
    );
  };

  const cells = [];
  for (let i = 0; i < startDow; i++) {
    cells.push(<div className="cal-day empty" key={'e' + i} />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday =
      today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    const sessions = sortSchedulesByTime(dayMap[day] || []);
    const visible = sessions.slice(0, 3);
    const hidden = sessions.length - visible.length;
    const dayLabel = new Date(year, month, day).toLocaleDateString(uiLocale(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    cells.push(
      <div
        className={'cal-day' + (isToday ? ' today' : '')}
        key={day}
        onClick={() => setDayDetail({ label: dayLabel, sessions })}
      >
        <div className="cal-day-num">{day}</div>
        <div className="cal-events">
          {visible.map(chip)}
          {hidden > 0 && (
            <button
              type="button"
              className="cal-more-btn"
              onClick={(e) => {
                e.stopPropagation();
                setDayDetail({ label: dayLabel, sessions });
              }}
            >
              +{hidden} more
            </button>
          )}
        </div>
      </div>,
    );
  }

  // Agenda list for phones + portrait tablets (≤1024px, CSS-toggled): the grid
  // chips are unreadable at those widths, so each session becomes a full-width
  // card with the date, time, student, status, and the note icon when a note
  // exists. Desktop keeps the original grid. Teacher POV only — the admin and
  // student schedule views are separate components.
  const todayStr = dateToStr(today);

  // Flatten the month into a single list of agenda render units (a day divider
  // followed by that day's cards) so it can be revealed a page at a time on
  // scroll. Structure depends only on which classes fall in this month; the
  // per-card status/labels are applied at render time below. Only days that
  // actually have classes appear (mirrors the original agenda).
  const agendaItems = useMemo(() => {
    const map = {};
    schedules.forEach((s) => {
      const sd = parseDate(s.date);
      if (sd.getMonth() !== month || sd.getFullYear() !== year) return;
      const day = sd.getDate();
      (map[day] = map[day] || []).push(s);
    });
    const days = Object.keys(map).map(Number).sort((a, b) => a - b);
    const list = [];
    days.forEach((day, dayIdx) => {
      if (dayIdx > 0) list.push({ type: 'divider', day });
      sortSchedulesByTime(map[day] || []).forEach((s) => list.push({ type: 'card', s, day }));
    });
    return list;
  }, [schedules, year, month]);

  // Keep today's card inside the first page so the scroll-to-today above still
  // finds it on the current month.
  const TCAL_PAGE = 20;
  const todayItemIndex = agendaItems.findIndex(
    (it) => it.type === 'card' && dateToStr(new Date(year, month, it.day)) === todayStr,
  );
  const {
    visible: visibleAgenda,
    hasMore: agendaHasMore,
    sentinelRef: agendaSentinelRef,
  } = useInfiniteScroll(agendaItems, {
    pageSize: TCAL_PAGE,
    initialCount: todayItemIndex >= 0 ? Math.max(TCAL_PAGE, todayItemIndex + 1) : TCAL_PAGE,
    resetKey: `${year}-${month}`,
  });

  const renderAgendaCard = (s, day) => {
    const st = statusClass(s); // present | absent | no-report | cancelled
    const isTrial = !!s.trial;
    const hasNote = !!String(s.note || '').trim();
    const d = new Date(year, month, day);
    const isToday = dateToStr(d) === todayStr;
    const stLabel =
      st === 'present'
        ? t('cal.present')
        : st === 'absent'
          ? t('cal.absent')
          : st === 'cancelled'
            ? t('cal.cancelled')
            : t('cal.noReport');
    return (
      <div
        key={s.id}
        className={'tcal-card ' + st + (isToday ? ' is-today' : '')}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (s.cancelled) setCancelledInfo(s);
          else if (onSessionClick) onSessionClick(s);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (s.cancelled) setCancelledInfo(s);
          else if (onSessionClick) onSessionClick(s);
        }}
      >
        <div className="tcal-datecol">
          <div className="tcal-dow">{d.toLocaleDateString(uiLocale(), { weekday: 'short' })}</div>
          <div className="tcal-daynum">{day}</div>
          <div className="tcal-mon">{d.toLocaleDateString(uiLocale(), { month: 'short' })}</div>
        </div>
        <div className="tcal-main">
          <div className="tcal-time">
            <i className="fa-regular fa-clock" aria-hidden="true"></i>
            <span>{s.timeslot || '-'}</span>
            {isTrial && <span className="tcal-trial">{t('cal.trial')}</span>}
          </div>
          <div className="tcal-student">
            <i className="fa-regular fa-user" aria-hidden="true"></i>
            <span>{s.student || t('sched.student')}</span>
          </div>
        </div>
        <div className="tcal-side">
          <span className={'tcal-badge ' + st}>{stLabel}</span>
          {hasNote && (
            <button
              type="button"
              className="tcal-note-btn"
              title={t('sched.viewNote')}
              aria-label={t('sched.viewNoteFor', { student: s.student || t('sched.student') })}
              onClick={(e) => {
                e.stopPropagation();
                setNoteInfo(s);
              }}
            >
              <i className="fa-solid fa-note-sticky" aria-hidden="true"></i>
            </button>
          )}
        </div>
      </div>
    );
  };

  const agenda = (
    <div className="tcal-agenda">
      {agendaItems.length === 0 && (
        <div style={{ color: 'var(--text3)', fontSize: 13, padding: '8px 2px', textAlign: 'center' }}>
          {t('cal.noClasses')}
        </div>
      )}
      {visibleAgenda.map((it) =>
        it.type === 'divider' ? (
          <div className="tcal-divider" key={'div' + it.day} aria-hidden="true"></div>
        ) : (
          renderAgendaCard(it.s, it.day)
        ),
      )}
      {agendaHasMore && (
        <div ref={agendaSentinelRef} className="tcal-sentinel" aria-hidden="true" style={{ height: 1 }} />
      )}
    </div>
  );

  return (
    <>
      {agenda}
      <div className="cal-grid tcal-desktop">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <div className="cal-dow" key={d}>
            {t('sched.day' + d)}
          </div>
        ))}
      </div>
      <div className="cal-grid tcal-desktop" id="cal-days-grid" style={{ marginTop: 6 }}>
        {cells}
      </div>
      <Modal
        open={!!dayDetail}
        onClose={() => setDayDetail(null)}
        title={dayDetail ? `${t('cal.classesOn')} ${dayDetail.label}` : ''}
      >
        <div className="modal-body">
          {dayDetail && dayDetail.sessions.length ? (
            dayDetail.sessions.map(chip)
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: 13, padding: '8px 2px' }}>
              {t('cal.noClasses')}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!cancelledInfo}
        onClose={() => setCancelledInfo(null)}
        title={t('sched.legendCancelled')}
        className="confirm-modal"
      >
        {cancelledInfo && (
          <div className="modal-body">
            <div className="cancelled-class-banner">
              <div className="cancelled-class-banner-title">
                <i className="fa-solid fa-ban" aria-hidden="true"></i> {t('cal.classCancelled')}
              </div>
              <div className="cancelled-class-banner-reason">
                <span className="cancelled-class-banner-label">{t('cal.reason')}:</span>{' '}
                {cancelledInfo.cancel_reason ? cancelledInfo.cancel_reason : t('cal.noReason')}
              </div>
            </div>
            <div className="confirm-dialog-lines">
              <div className="confirm-dialog-line">
                <span className="confirm-dialog-label">{t('sched.student')}:</span>{' '}
                <span>{cancelledInfo.student || '-'}</span>
              </div>
              <div className="confirm-dialog-line">
                <span className="confirm-dialog-label">{t('sched.date')}:</span>{' '}
                <span>
                  {cancelledInfo.date
                    ? parseDate(cancelledInfo.date).toLocaleDateString(uiLocale(), {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-'}
                </span>
              </div>
              <div className="confirm-dialog-line">
                <span className="confirm-dialog-label">{t('sched.time')}:</span>{' '}
                <span>{cancelledInfo.timeslot || '-'}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!noteInfo}
        onClose={() => setNoteInfo(null)}
        className="schedule-note-modal"
        title={
          noteInfo && (
            <span className="schedule-note-title">
              <span className="schedule-note-title-chip schedule-note-time">
                {noteInfo.timeslot || ''}
              </span>
              <span className="schedule-note-title-chip schedule-note-student">
                {noteInfo.student || t('sched.student')}
              </span>
              <span className="schedule-note-title-chip schedule-note-date">
                {noteInfo.date
                  ? parseDate(noteInfo.date).toLocaleDateString(uiLocale(), {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : ''}
              </span>
            </span>
          )
        }
      >
        {noteInfo && (
          <div className="modal-body">
            <div className="schedule-note-label">{t('sched.note')}:</div>
            <div className="schedule-note-content">{noteInfo.note}</div>
          </div>
        )}
      </Modal>
    </>
  );
}
