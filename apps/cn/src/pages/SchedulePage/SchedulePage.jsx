import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useConfirm } from '../../context/ConfirmProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import {
  isActiveAccount,
  normalizeAccountStatus,
} from '../../lib/accountStatus.js';
import AdminScheduleView from './AdminScheduleView.jsx';
import TeacherCalendarView, { CalLegend } from './TeacherCalendarView.jsx';
import ScheduleModal from './ScheduleModal.jsx';
import CancelClassModal from './CancelClassModal.jsx';
import CopyMoveModal from './CopyMoveModal.jsx';
import ReportFilingModal from '../ReportsPage/ReportFilingModal.jsx';
import ExportModal from '../../components/ui/ExportModal.jsx';
import StickyToolbar from '../../components/Layout/StickyToolbar.jsx';
import { SkeletonCalendar, SkeletonCards, SkeletonFilterCard } from '../../components/ui/Skeleton.jsx';
import { buildTeacherScheduleReportsFile, getDateRange } from '../../lib/exporters/xlsx.js';
import { runExport, ensureRangeLoaded } from '../../lib/exporters/run.js';
import { dateToStr, formatDateNice, uiLocale } from '../../lib/format.js';

export default function SchedulePage() {
  const { user, isAdmin } = useAuth();
  const data = useData();
  const toast = useToast();
  const showConfirm = useConfirm();
  const t = useT();

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [modal, setModal] = useState({
    open: false,
    editing: null,
    locked: false,
    defaults: null,
  });
  const [copyMove, setCopyMove] = useState({ open: false, isMove: false });
  const [cancelModal, setCancelModal] = useState({ open: false, schedule: null });
  const [reportModal, setReportModal] = useState({ open: false, session: null });
  const [exportModal, setExportModal] = useState({ open: false, mode: 'download' });
  // Teacher-column filter — lifted here so the sticky toolbar + the filter card
  // share one source of truth (null = all teachers shown).
  const [schedSelectedIds, setSchedSelectedIds] = useState(null);
  const [schedFilterOpen, setSchedFilterOpen] = useState(false);
  const schedIsSelected = (id) => schedSelectedIds === null || schedSelectedIds.has(String(id));
  const schedSelectedCount =
    schedSelectedIds === null
      ? data.teachers.length
      : data.teachers.filter((t) => schedSelectedIds.has(String(t.id))).length;
  const schedToggle = (id) =>
    setSchedSelectedIds((prev) => {
      const n = new Set(prev === null ? data.teachers.map((t) => String(t.id)) : prev);
      const k = String(id);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const schedSelectAll = () => setSchedSelectedIds(null);
  const schedClear = () => setSchedSelectedIds(new Set());

  useEffect(() => {
    data.ensureTeachers();
    data.ensureStudents();
  }, [data]);

  const [firstLoad, setFirstLoad] = useState(true);
  useEffect(() => {
    let alive = true;
    data.ensureMonth(calYear, calMonth).finally(() => {
      if (alive) setFirstLoad(false);
    });
    return () => {
      alive = false;
    };
  }, [data, calYear, calMonth]);

  const monthLabel = new Date(calYear, calMonth).toLocaleDateString(uiLocale(), {
    month: 'long',
    year: 'numeric',
  });

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

  // Active teachers (+ keep an inactive teacher visible if it's the one being edited).
  const activeTeachers = useMemo(
    () => data.teachers.filter(isActiveAccount),
    [data.teachers],
  );
  const teacherOptionsFor = useCallback(
    (selectedId) => {
      const opts = activeTeachers.slice();
      if (
        selectedId != null &&
        !opts.some((t) => String(t.id) === String(selectedId))
      ) {
        const sel = data.teachers.find(
          (t) => String(t.id) === String(selectedId),
        );
        if (sel) opts.push(sel);
      }
      return opts;
    },
    [activeTeachers, data.teachers],
  );

  const openAdd = useCallback(
    (teacherId, dateStr, timeslot) => {
      if (!activeTeachers.length) {
        toast('No active teachers available.');
        return;
      }
      setModal({
        open: true,
        editing: null,
        locked: false,
        defaults: { teacherId, date: dateStr, timeslot },
      });
    },
    [activeTeachers.length, toast],
  );

  const openEdit = useCallback(
    (schedule) => {
      const hasReport = !!data.reports.find(
        (r) => r.schedule_id == schedule.id,
      );
      // A cancelled class counts as reported → view-only (no edit/save).
      setModal({
        open: true,
        editing: schedule,
        locked: hasReport || !!schedule.cancelled,
        defaults: null,
      });
    },
    [data.reports],
  );

  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  const handleSave = useCallback(
    async (payload, editId) => {
      const { teacher_id, date, timeslot, student, student_id, trial } = payload;
      const sid = Number(student_id) || 0;
      // Teacher slot clash.
      if (
        data.schedules.find(
          (s) =>
            s.teacher_id === teacher_id &&
            s.date === date &&
            s.timeslot === timeslot &&
            (!editId || s.id != editId),
        )
      ) {
        toast(
          'Failed — that time slot is already taken for the selected teacher.',
        );
        throw new Error('clash');
      }
      // Same student double-booked. ID match wins (duplicate names stay distinct);
      // unlinked rows (student_id 0/absent) still clash by name.
      if (
        (sid || student) &&
        data.schedules.find(
          (s) =>
            (sid && Number(s.student_id) > 0
              ? Number(s.student_id) === sid
              : s.student === student) &&
            s.date === date &&
            s.timeslot === timeslot &&
            (!editId || s.id != editId),
        )
      ) {
        toast(t('sched.clash', { student, time: timeslot, date }));
        throw new Error('clash');
      }
      // Inactive / End-of-Contract student cannot be scheduled (new only).
      if (!editId && (sid || student)) {
        const sObj = sid
          ? data.students.find((s) => Number(s.id) === sid)
          : data.students.find((s) => s.name === student);
        const st = sObj && normalizeAccountStatus(sObj.status);
        if (st === 'Inactive' || st === 'End of Contract') {
          toast(
            t(st === 'End of Contract' ? 'sched.cannotScheduleEoc' : 'sched.cannotScheduleInactive', { student }),
          );
          throw new Error('inactive');
        }
      }
      // Non-trial class must use an existing student. A resolved id proves
      // existence; otherwise fall back to the exact-name lookup.
      if (!editId && !trial && !sid && student) {
        const exists = await data.resolveStudentId(student);
        if (!exists) {
          toast(t('sched.notOnList', { student }));
          throw new Error('not-found');
        }
      }
      try {
        if (editId) {
          await apiFetch(`/schedules/${editId}`, 'PUT', payload);
          data.upsertSchedule({ ...payload, id: editId });
        } else {
          const res = await apiFetch('/schedules', 'POST', payload);
          data.upsertSchedule({
            ...payload,
            id: res && res.id ? res.id : Date.now(),
          });
        }
      } catch (e) {
        if (e?.data?.error === 'student_no_remaining_classes') {
          toast(t('sched.noRemainingClasses', { student }));
        } else {
          toast(t('sched.saveError', { msg: e.message || '' }));
        }
        throw e;
      }
      toast(editId ? t('sched.updated') : t('sched.added'));
      // Navigate calendar to the saved date's month (legacy behavior).
      const [y, m] = date.split('-').map(Number);
      setCalYear(y);
      setCalMonth(m - 1);
      data.ensureMonth(y, m - 1, true);
      closeModal();
    },
    [data, toast, t],
  );

  const handleDelete = useCallback(
    async (id) => {
      const schedule = data.schedules.find((s) => s.id == id);
      if (!schedule) return;
      const teacher = data.teachers.find((t) => t.id == schedule.teacher_id);
      closeModal();
      const ok = await showConfirm({
        title: t('sched.deleteTitle'),
        lines: [
          { label: t('sched.teacher'), value: teacher?.fullname || t('sched.unknownTeacher') },
          { label: t('sched.student'), value: schedule.student || '-' },
          { label: t('sched.date'), value: schedule.date || '-' },
          { label: t('sched.time'), value: schedule.timeslot || '-' },
        ],
        okText: t('common.delete'),
        danger: true,
      });
      if (!ok) return;
      try {
        await apiFetch(`/schedules/${id}`, 'DELETE');
        data.removeSchedule(id);
        toast(t('sched.deleted'));
      } catch (e) {
        toast(t('sched.deleteError'));
      }
    },
    [data, showConfirm, toast, t],
  );

  // Step 1: open the cancellation modal (captures the reason).
  const handleCancelClass = useCallback(
    (id) => {
      const schedule = data.schedules.find((s) => s.id == id);
      if (!schedule) return;
      closeModal();
      setCancelModal({ open: true, schedule });
    },
    [data.schedules],
  );

  // Step 2: confirm with a reason → call the API.
  const confirmCancelClass = useCallback(
    async (reason) => {
      const schedule = cancelModal.schedule;
      if (!schedule) return;
      try {
        await apiFetch(`/schedules/${schedule.id}/cancel`, 'POST', { reason });
        data.upsertSchedule({ id: schedule.id, cancelled: 1, cancel_reason: reason });
        toast(t('sched.cancelled'));
        setCancelModal({ open: false, schedule: null });
      } catch (e) {
        toast(t('sched.cancelError'));
        throw e;
      }
    },
    [cancelModal.schedule, data, toast, t],
  );

  const handleExport = async (s, e) => {
    const mode = exportModal.mode;
    await ensureRangeLoaded(data, s, e);
    const teacherRecord =
      data.teachers.find((t) => t.id == user.id) || {
        id: user.id,
        fullname: user.fullname,
        username: user.username,
        color: user.color,
      };
    const file = await buildTeacherScheduleReportsFile(
      teacherRecord,
      data.schedules,
      data.reports,
      s,
      e,
    );
    await runExport([file], mode, toast);
    setExportModal({ open: false, mode });
  };
  // Legacy teacher-schedule-export-summary text.
  const scheduleSummary = (s, e) => {
    const dates = s && e ? getDateRange(s, e) : [];
    if (!dates.length) return t('sched.selectRange');
    return t('sched.rangeSummary', {
      start: formatDateNice(s),
      end: formatDateNice(e),
      note: t('sched.oneFile'),
    });
  };
  const exportDefaultStart = dateToStr(new Date(calYear, calMonth, 1));
  const exportDefaultEnd = dateToStr(new Date(calYear, calMonth + 1, 0));

  return (
    <section className='page active' id='page-schedule'>
      <div className='page-header'>
        <div>
          <div className='page-title'>{t('sched.title')}</div>
          <div className='page-sub'>
            {isAdmin ? t('sched.subtitleAdmin') : t('sched.subtitleTeacher')}
          </div>
        </div>
      </div>
      {/* Teacher POV: scroll-triggered floating month bar (mirrors the admin
          schedule sticky toolbar). Only shown ≤1024px (where the agenda is) —
          the wrapper div is CSS-hidden on desktop. Hide button centered below. */}
      {!isAdmin && (
        <div className="tcal-sticky-wrap">
          <StickyToolbar triggerIcon="fa-calendar-days" triggerLabel={t('sched.title')}>
            {({ collapse }) => (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div
                  className="schedule-month-controls"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
                >
                  <button className="btn btn-secondary btn-sm schedule-nav-btn" onClick={prevMonth} aria-label={t('sched.prevMonth')}>
                    <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
                  </button>
                  <div className="cal-title" style={{ minWidth: 160, textAlign: 'center' }}>{monthLabel}</div>
                  <button className="btn btn-secondary btn-sm schedule-nav-btn" onClick={nextMonth} aria-label={t('sched.nextMonth')}>
                    <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
                  </button>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={collapse} title={t('sched.hide')}>
                  <i className="fa-solid fa-chevron-up" aria-hidden="true"></i> {t('sched.hide')}
                </button>
              </div>
            )}
          </StickyToolbar>
        </div>
      )}
      <div className='card' style={{ marginBottom: 20 }}>
        {/* Teacher POV: status legend sits ABOVE the month controls. */}
        {!isAdmin && <CalLegend />}
        <div
          className='schedule-month-controls'
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <button
            className='btn btn-secondary btn-sm schedule-nav-btn'
            onClick={prevMonth}
            aria-label={t('sched.prevMonth')}
          >
            <i className='fa-solid fa-chevron-left' aria-hidden='true'></i>
          </button>
          <div
            className='cal-title'
            style={{ minWidth: 160, textAlign: 'center' }}
          >
            {monthLabel}
          </div>
          <button
            className='btn btn-secondary btn-sm schedule-nav-btn'
            onClick={nextMonth}
            aria-label={t('sched.nextMonth')}
          >
            <i className='fa-solid fa-chevron-right' aria-hidden='true'></i>
          </button>
        </div>

        <div
          className={'schedule-action-row' + (isAdmin ? '' : ' teacher-actions')}
          id='sched-action-btns'
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          {isAdmin && (
            <>
              <button
                className='btn btn-secondary btn-sm schedule-action-btn'
                onClick={() => setCopyMove({ open: true, isMove: false })}
              >
                <i
                  className='fa-solid fa-clipboard-list'
                  aria-hidden='true'
                ></i>{' '}
                {t('sched.copySchedule')}
              </button>
              <button
                className='btn btn-primary btn-sm schedule-action-btn'
                onClick={() => openAdd(null, '', '')}
              >
                + {t('sched.addSchedule')}
              </button>
              <button
                className='btn btn-secondary btn-sm schedule-action-btn'
                onClick={() => setCopyMove({ open: true, isMove: true })}
              >
                <i className='fa-solid fa-box-archive' aria-hidden='true'></i>{' '}
                {t('sched.moveSchedule')}
              </button>
            </>
          )}
          {!isAdmin && (
            <>
              <button
                className='btn btn-secondary btn-sm schedule-action-btn'
                onClick={() => setExportModal({ open: true, mode: 'download' })}
              >
                <i className='fa-solid fa-download' aria-hidden='true'></i>{' '}
                {t('sched.downloadSchedule')}
              </button>
            </>
          )}
        </div>

        {!isAdmin &&
          (firstLoad ? (
            <SkeletonCalendar />
          ) : (
            <TeacherCalendarView
              year={calYear}
              month={calMonth}
              // Server already returns only this teacher's schedules; filter again
              // client-side so teachers can never see each other's classes.
              schedules={data.schedules.filter((s) => s.teacher_id == user.id)}
              reports={data.reports}
              onSessionClick={(s) => setReportModal({ open: true, session: s })}
            />
          ))}
      </div>

      {isAdmin &&
        (firstLoad ? (
          <>
            <SkeletonFilterCard />
            <SkeletonCards count={2} />
          </>
        ) : (
          <AdminScheduleView
            year={calYear}
            month={calMonth}
            teachers={data.teachers}
            schedules={data.schedules}
            reports={data.reports}
            students={data.students}
            onAddCell={openAdd}
            onEditCell={openEdit}
            selectedIds={schedSelectedIds}
            setSelectedIds={setSchedSelectedIds}
          />
        ))}

      {isAdmin && (
        <StickyToolbar triggerIcon="fa-toolbox" triggerLabel={t('sched.tools')}>
          {({ collapse }) => (
            <>
              <div className="toolbar-flex-row">
                <button className="btn btn-secondary btn-sm" onClick={prevMonth} aria-label={t('sched.prevMonth')}>
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <span className="toolbar-month-label">{monthLabel}</span>
                <button className="btn btn-secondary btn-sm" onClick={nextMonth} aria-label={t('sched.nextMonth')}>
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
                <span className="toolbar-sep"></span>
                <button className="btn btn-primary btn-sm" onClick={() => openAdd(null, '', '')}>
                  <i className="fa-solid fa-plus"></i> {t('common.add')}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setCopyMove({ open: true, isMove: false })}>
                  <i className="fa-solid fa-clipboard-list"></i> {t('sched.copy')}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setCopyMove({ open: true, isMove: true })}>
                  <i className="fa-solid fa-box-archive"></i> {t('sched.move')}
                </button>
                <span className="toolbar-sep"></span>
                <button className="btn btn-secondary btn-sm" onClick={schedSelectAll}>
                  {t('sched.all')}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={schedClear}>
                  {t('sched.clear')}
                </button>
                <span className="toolbar-teacher-count">
                  {schedSelectedCount
                    ? t('sched.teachersSelected', { n: schedSelectedCount })
                    : t('sched.noTeacherSelected')}
                </span>
                <button
                  className="btn btn-secondary btn-sm toolbar-toggle-filter"
                  onClick={() => setSchedFilterOpen((o) => !o)}
                  title={t('sched.toggleFilter')}
                >
                  <i className="fa-solid fa-filter"></i>
                </button>
                <span className="toolbar-sep"></span>
                <button className="btn btn-secondary btn-sm" onClick={collapse} title={t('sched.hideToolbar')}>
                  <i className="fa-solid fa-chevron-up"></i> {t('sched.hide')}
                </button>
              </div>
              {schedFilterOpen && (
                <div className="toolbar-filter-collapse" style={{ display: 'block' }}>
                  <div className="teacher-check-list six-columns">
                    {data.teachers.map((t) => (
                      <label className="teacher-check-item" key={t.id}>
                        <input type="checkbox" checked={schedIsSelected(t.id)} onChange={() => schedToggle(t.id)} />
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

      <ScheduleModal
        open={modal.open}
        onClose={closeModal}
        editing={modal.editing}
        locked={modal.locked}
        teacherOptions={teacherOptionsFor(
          modal.editing ? modal.editing.teacher_id : modal.defaults?.teacherId,
        )}
        students={data.students}
        defaults={modal.defaults}
        onSave={handleSave}
        onDelete={handleDelete}
        onCancelClass={handleCancelClass}
        teachers={data.teachers}
        report={modal.editing ? data.reports.find((r) => r.schedule_id == modal.editing.id) || null : null}
      />

      <CancelClassModal
        open={cancelModal.open}
        onClose={() => setCancelModal({ open: false, schedule: null })}
        schedule={cancelModal.schedule}
        teacherName={
          cancelModal.schedule
            ? data.teachers.find((tc) => tc.id == cancelModal.schedule.teacher_id)?.fullname ||
              t('sched.unknownTeacher')
            : ''
        }
        onConfirm={confirmCancelClass}
      />

      <CopyMoveModal
        open={copyMove.open}
        isMove={copyMove.isMove}
        onClose={() => setCopyMove({ open: false, isMove: copyMove.isMove })}
        teachers={data.teachers}
        schedules={data.schedules}
      />

      <ReportFilingModal
        open={reportModal.open}
        onClose={() => setReportModal((m) => ({ ...m, open: false }))}
        session={reportModal.session}
      />

      <ExportModal
        open={exportModal.open}
        onClose={() => setExportModal((m) => ({ ...m, open: false }))}
        title={t('sched.downloadSchedule')}
        confirmLabel={<><i className="fa-solid fa-download"></i> {t('common.download')}</>}
        defaultStart={exportDefaultStart}
        defaultEnd={exportDefaultEnd}
        buildSummary={scheduleSummary}
        onConfirm={handleExport}
      />
    </section>
  );
}
