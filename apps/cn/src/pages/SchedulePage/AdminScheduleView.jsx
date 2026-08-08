import { memo, useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react';
import { dateToStr, manilaToday, parseDate, uiLocale } from '../../lib/format.js';
import { getReadableTextColor } from '../../lib/accountStatus.js';
import { apiFetch } from '../../lib/apiClient.js';
import { onRealtime } from '../../lib/realtime.js';
import {
  SCHEDULE_TIMESLOTS,
  getScheduleStartMinutes,
} from '../../lib/scheduleHelpers.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

const EMPTY_OBJ = {}; // stable ref so a teacher with no schedules doesn't defeat memo

// ID-first: a schedule that carries student_id resolves to that exact student
// (duplicate-name-safe); unlinked rows fall back to the exact name.
function studentMetaLines(studentMaps, sched, t) {
  const sid = Number(sched?.student_id) || 0;
  const s =
    (sid > 0 && studentMaps.byId.get(sid)) ||
    studentMaps.byName.get(String(sched?.student || '').trim().toLowerCase());
  const username = String(s?.username || '').trim() || '—';
  const note = String(s?.notes || '').trim() || '—';
  return `\n${t('common.username')}: ${username}\n${t('sched.note')}: ${note}`;
}

// One teacher's month table. Memoized so unrelated re-renders (filter changes,
// sticky toolbar) don't re-render every teacher. No windowing — both JS
// (IntersectionObserver) and CSS (content-visibility) caused a scroll-up glitch,
// so all tables render; memo + memoized reportById/days/slotCount keep it light.
const TeacherCard = memo(function TeacherCard({
  teacher, teacherData, days, year, month, isCurrentMonth, todayDate, monthLabel,
  reportById, limits, slotCount, studentMaps, onEditCell, onAddCell, scrollPosRef,
}) {
  const t = useT();
  const scrollWrapRef = useRef(null);
  const tid = String(teacher.id);
  const color = teacher.color || '#2563eb';
  const textColor = getReadableTextColor(color);

  // Restore this teacher's horizontal scroll after its table (re)mounts.
  useLayoutEffect(() => {
    const el = scrollWrapRef.current;
    if (el && scrollPosRef.current[tid]) el.scrollLeft = scrollPosRef.current[tid];
  });

  const allSlots = useMemo(() => {
    const slotSet = new Set(SCHEDULE_TIMESLOTS);
    Object.keys(teacherData).forEach((k) => slotSet.add(k.split('|')[1]));
    return [...slotSet].sort(
      (a, b) => getScheduleStartMinutes(a) - getScheduleStartMinutes(b) || String(a).localeCompare(String(b)),
    );
  }, [teacherData]);

  return (
    <div className="card lesson-tracker-teacher-card">
      <div className="lesson-tracker-teacher-card-header" style={{ background: color, color: textColor }}>
        {teacher.fullname}
      </div>
      <div className="lesson-tracker-teacher-card-body">
        <div className="admin-schedule-month-label" style={{ marginBottom: 10 }}>
          {monthLabel}
        </div>
        <div
          className="admin-schedule-table-wrap"
          data-teacher-id={tid}
          ref={scrollWrapRef}
          onScroll={(e) => {
            scrollPosRef.current[tid] = e.currentTarget.scrollLeft;
          }}
        >
          <table className="admin-schedule-table">
              <thead>
                <tr>
                  <th className="time-col-header">{t('sched.time')}</th>
                  {days.map((day) => {
                    const dn = t('sched.day' + new Date(year, month, day).getDay());
                    const isToday = isCurrentMonth && day === todayDate;
                    return (
                      <th className={'day-header' + (isToday ? ' today-col' : '')} key={day}>
                        {dn}
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  <th className="time-col-header"></th>
                  {days.map((day) => {
                    const isToday = isCurrentMonth && day === todayDate;
                    return (
                      <th className={'date-header' + (isToday ? ' today-col' : '')} key={day}>
                        {day}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {allSlots.map((slot) => (
                  <tr key={slot}>
                    <td className="time-col">{slot}</td>
                    {days.map((day) => {
                      const sched = teacherData[day + '|' + slot] || null;
                      const dateStr = dateToStr(new Date(year, month, day));
                      const isToday = isCurrentMonth && day === todayDate;
                      const todayClass = isToday ? ' today-col' : '';
                      if (sched) {
                        const r = reportById.get(String(sched.id));
                        let statusCls = sched.cancelled
                          ? ' sched-bg-cancelled'
                          : r && r.absent
                          ? ' sched-bg-absent'
                          : r
                          ? ' sched-bg-present'
                          : ' sched-bg-pending';
                        if (sched.trial) statusCls += ' sched-text-red';
                        const isOver = limits.over.has(sched.id);
                        const isLastAvail = !isOver && limits.lastavail.has(sched.id);
                        if (isOver) statusCls += ' sched-text-over';
                        else if (isLastAvail) statusCls += ' sched-text-lastavail';
                        const overlap = slotCount[teacher.id + '|' + day + '|' + slot] || 0;
                        const isConflict = overlap > 1;
                        if (isConflict) statusCls += ' sched-bg-conflict';
                        const name = sched.student || '';
                        const display = name.length > 9 ? name.slice(0, 9) + '...' : name;
                        const meta = studentMetaLines(studentMaps, sched, t);
                        const cellTitle = isConflict
                          ? t('sched.titleConflict', { n: overlap, name }) + meta
                          : sched.cancelled
                          ? t('sched.titleCancelled', { name }) + meta
                          : sched.trial
                          ? t('sched.titleTrial', { name })
                          : isOver
                          ? t('sched.titleOver', { name }) + meta
                          : isLastAvail
                          ? t('sched.titleLastAvail', { name }) + meta
                          : `${name}${meta}`;
                        return (
                          <td
                            key={day}
                            className={'sched-cell has-student' + todayClass + statusCls}
                            title={cellTitle}
                            onClick={() => onEditCell(sched)}
                          >
                            {display}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={day}
                          className={'sched-cell empty-cell' + todayClass}
                          title={`${dateStr} ${slot}`}
                          onClick={() => onAddCell(tid, dateStr, slot)}
                        >
                          +
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
});

// Admin spreadsheet view (legacy renderAdminScheduleTeacherCards): one table per
// teacher — rows = timeslots, columns = days of the month, cells = student name.
export default function AdminScheduleView({
  year,
  month,
  teachers,
  schedules,
  reports,
  students,
  onAddCell,
  onEditCell,
  selectedIds, // null = all (lifted to SchedulePage so the sticky toolbar shares it)
  setSelectedIds,
}) {
  const t = useT();
  const gridRef = useRef(null);
  // id -> student (primary) + name (lower) -> student (fallback for unlinked
  // rows), so the hover title can show the student's login username + the
  // admin's profile note (Students tab → Notes).
  const studentMaps = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    for (const s of students || []) {
      byId.set(Number(s.id), s);
      const key = String(s.name || '').trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, s);
    }
    return { byId, byName };
  }, [students]);
  const scrollPosRef = useRef({}); // teacherId -> horizontal scrollLeft

  // Capacity markers keyed by schedule id: `lastavail` = a student's boundary "last
  // available" class (blue), `over` = booked beyond their remaining classes (red). From
  // /schedule-limits; refreshed when balances / schedules / reports change elsewhere.
  const [limits, setLimits] = useState({ lastavail: new Set(), over: new Set() });
  useEffect(() => {
    let alive = true;
    const load = () => {
      apiFetch('/schedule-limits')
        .then((d) => {
          if (!alive) return;
          setLimits({
            lastavail: new Set(Array.isArray(d && d.lastavail) ? d.lastavail : []),
            over: new Set(Array.isArray(d && d.over) ? d.over : []),
          });
        })
        .catch(() => {});
    };
    load();
    const off = onRealtime('sync', (msg) => {
      if (msg && (msg.resource === 'transactions' || msg.resource === 'schedules' || msg.resource === 'reports')) load();
    });
    return () => {
      alive = false;
      if (off) off();
    };
  }, []);

  // Remember each teacher table's horizontal scroll so creating/deleting a
  // schedule doesn't snap the view back to day 1 (legacy renderAdminSchedule).
  // useLayoutEffect restores before paint, so there's no visible jump.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.querySelectorAll('.admin-schedule-table-wrap[data-teacher-id]').forEach((wrap) => {
      const left = scrollPosRef.current[wrap.dataset.teacherId];
      if (left) wrap.scrollLeft = left;
    });
  });

  // Row + column hover highlight (legacy setupAdminScheduleHover): hovering a
  // cell lights up its whole column — including the day name + date headers at
  // the top — and the time label on its row. Delegated on the grid (one set of
  // listeners) so it works for the windowed tables that mount/unmount on scroll.
  // Coalesces DOM writes into a rAF and suppresses the mouseover storm while
  // scrolling. Empty deps: gridRef is stable and delegation covers new tables.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    let scrolling = false;
    let scrollTimer = null;
    const onScroll = () => {
      scrolling = true;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrolling = false;
      }, 120);
    };
    const scrollEl = grid.closest('.main');
    if (scrollEl) scrollEl.addEventListener('scroll', onScroll, { passive: true, capture: true });

    let hl = [];
    let lastTable = null;
    let lastIdx = -1;
    let raf = 0;
    const clear = () => {
      hl.forEach((c) => c.classList.remove('hl-time', 'hl-col'));
      hl = [];
      lastTable = null;
      lastIdx = -1;
    };
    const apply = (cell) => {
      const table = cell.closest('table.admin-schedule-table');
      if (!table) return;
      const idx = cell.cellIndex;
      clear();
      const timeCell = cell.parentElement.children[0];
      if (timeCell) {
        timeCell.classList.add('hl-time');
        hl.push(timeCell);
      }
      const rows = table.rows;
      for (let r = 0; r < rows.length; r++) {
        const c = rows[r].children[idx];
        if (c) {
          c.classList.add('hl-col');
          hl.push(c);
        }
      }
      lastTable = table;
      lastIdx = idx;
    };
    const onOver = (e) => {
      if (scrolling) return;
      const cell = e.target.closest('td.sched-cell');
      if (!cell) return;
      const table = cell.closest('table.admin-schedule-table');
      if (table === lastTable && cell.cellIndex === lastIdx) return; // same column
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => apply(cell));
    };
    grid.addEventListener('mouseover', onOver);
    grid.addEventListener('mouseleave', clear);
    return () => {
      clearTimeout(scrollTimer);
      if (raf) cancelAnimationFrame(raf);
      clear();
      if (scrollEl) scrollEl.removeEventListener('scroll', onScroll, { capture: true });
      grid.removeEventListener('mouseover', onOver);
      grid.removeEventListener('mouseleave', clear);
    };
  }, []);

  const isSelected = (id) => selectedIds === null || selectedIds.has(String(id));
  const selectedTeachers = teachers.filter((t) => isSelected(t.id));

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(
        prev === null ? teachers.map((t) => String(t.id)) : prev,
      );
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(null);
  const clearAll = () => setSelectedIds(new Set());

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  // teacherId -> { "day|timeslot": schedule }
  const teacherScheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach((s) => {
      const sd = parseDate(s.date);
      if (sd.getMonth() !== month || sd.getFullYear() !== year) return;
      const tid = String(s.teacher_id);
      if (!map[tid]) map[tid] = {};
      map[tid][sd.getDate() + '|' + s.timeslot] = s;
    });
    return map;
  }, [schedules, year, month]);

  // How many schedules share each teacher/day/timeslot cell — >1 means overlapping
  // schedules stacked in one slot (the grid can only render one, so we flag the clash).
  const slotCount = useMemo(() => {
    const count = {};
    schedules.forEach((s) => {
      const sd = parseDate(s.date);
      if (sd.getMonth() !== month || sd.getFullYear() !== year) return;
      const key = s.teacher_id + '|' + sd.getDate() + '|' + s.timeslot;
      count[key] = (count[key] || 0) + 1;
    });
    return count;
  }, [schedules, year, month]);

  // schedule_id -> report (built once; O(1) lookup per cell instead of a scan).
  // String keys mirror the old loose `==` match (id may be number or string).
  const reportById = useMemo(() => {
    const m = new Map();
    for (const r of reports) m.set(String(r.schedule_id), r);
    return m;
  }, [reports]);

  const sortedTeachers = selectedTeachers.slice().sort((a, b) => {
    const aHas = teacherScheduleMap[String(a.id)] && Object.keys(teacherScheduleMap[String(a.id)]).length > 0;
    const bHas = teacherScheduleMap[String(b.id)] && Object.keys(teacherScheduleMap[String(b.id)]).length > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return String(a.fullname || '').localeCompare(String(b.fullname || ''));
  });

  const monthLabel = new Date(year, month).toLocaleDateString(uiLocale(), {
    month: 'long',
    year: 'numeric',
  });
  const today = manilaToday();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
  const todayDate = today.getDate();

  return (
    <div id="admin-schedule-spreadsheet-view" style={{ display: 'block' }}>
      <div className="card admin-schedule-filter-card" style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label>{t('sched.teachersToDisplay')}</label>
          <div className="admin-schedule-filter-actions">
            <button className="btn btn-secondary btn-sm" onClick={selectAll}>
              {t('sched.allTeachers')}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={clearAll}>
              {t('sched.clear')}
            </button>
          </div>
          <div className="teacher-check-list six-columns">
            {teachers.map((t) => (
              <label className="teacher-check-item" key={t.id}>
                <input
                  type="checkbox"
                  checked={isSelected(t.id)}
                  onChange={() => toggle(t.id)}
                />
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
      </div>

      <div className="admin-schedule-legend" aria-label={t('sched.colourGuide')}>
        <span className="asl-item">
          <span className="asl-swatch asl-pending"></span>{t('sched.legendNoReport')}
        </span>
        <span className="asl-item">
          <span className="asl-swatch asl-absent"></span>{t('sched.legendAbsent')}
        </span>
        <span className="asl-item">
          <span className="asl-swatch asl-present"></span>{t('sched.legendPresent')}
        </span>
        <span className="asl-item">
          <span className="asl-swatch asl-cancelled"></span>{t('sched.legendCancelled')}
        </span>
        <span className="asl-item">
          <span className="asl-swatch asl-conflict"></span>{t('sched.legendOverlap')}
        </span>
        <span className="asl-item">
          <span className="asl-trial-text">Aa</span>{t('sched.legendTrial')}
        </span>
        <span className="asl-item">
          <span className="asl-lastavail">Aa</span>{t('sched.legendLastAvail')}
        </span>
        <span className="asl-item">
          <span className="asl-over">Aa</span>{t('sched.legendOverLimit')}
        </span>
      </div>

      {!sortedTeachers.length ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fa-solid fa-chalkboard-user" aria-hidden="true"></i>
            </div>
            <p>{t('sched.selectTeacher')}</p>
          </div>
        </div>
      ) : (
        <div className="lesson-tracker-teacher-grid" ref={gridRef}>
          {sortedTeachers.map((teacher) => (
            <TeacherCard
              key={teacher.id}
              teacher={teacher}
              teacherData={teacherScheduleMap[String(teacher.id)] || EMPTY_OBJ}
              days={days}
              year={year}
              month={month}
              isCurrentMonth={isCurrentMonth}
              todayDate={todayDate}
              monthLabel={monthLabel}
              reportById={reportById}
              limits={limits}
              slotCount={slotCount}
              studentMaps={studentMaps}
              onEditCell={onEditCell}
              onAddCell={onAddCell}
              scrollPosRef={scrollPosRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}
