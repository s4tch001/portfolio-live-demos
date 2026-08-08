import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import StudentField from '../../components/ui/StudentField.jsx';
import Lightbox from '../../components/ui/Lightbox.jsx';
import ClassReportContent from '../ReportsPage/ClassReportContent.jsx';
import { findStudentForSchedule } from '../../lib/studentLookup.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { SCHEDULE_TIMESLOTS } from '../../lib/scheduleHelpers.js';
import { parseDate, uiLocale, dateToStr, manilaToday } from '../../lib/format.js';

// Add / Edit / View schedule modal (legacy modal-schedule + saveSchedule).
// `locked` = the schedule already has a report → view-only (no save, delete only).
export default function ScheduleModal({
  open,
  onClose,
  editing, // schedule object when editing, null when adding
  locked,
  teacherOptions, // [{id, fullname}]
  students, // student objects for the suggestions + picker
  defaults, // { teacherId, date, timeslot } for prefilled add
  onSave, // async ({teacher_id,date,timeslot,student,note,trial}, editId) => void
  onDelete, // (id) => void
  onCancelClass, // (id) => void — call off the class (no report, balance refunded)
  report, // the schedule's report (when locked) for the View Class Report modal
  teachers, // teacher list to resolve the report's teacher name
}) {
  const toast = useToast();
  const t = useT();
  const [reportOpen, setReportOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [teacherId, setTeacherId] = useState('');
  const [date, setDate] = useState('');
  const [timeslot, setTimeslot] = useState(SCHEDULE_TIMESLOTS[0]);
  const [customTime, setCustomTime] = useState('');
  const [student, setStudent] = useState('');
  // The exact student row id behind the name (0 = unknown/trial). Set by the
  // picker/suggestions; hand-typed names resolve by exact match on save.
  const [studentId, setStudentId] = useState(0);
  const [note, setNote] = useState('');
  const [trial, setTrial] = useState(false);
  const [invalid, setInvalid] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInvalid({});
    setBusy(false);
    setReportOpen(false);
    setLightbox(null);
    if (editing) {
      setTeacherId(String(editing.teacher_id));
      setDate(editing.date || '');
      if (SCHEDULE_TIMESLOTS.includes(editing.timeslot)) {
        setTimeslot(editing.timeslot);
        setCustomTime('');
      } else {
        setTimeslot('custom');
        setCustomTime(editing.timeslot || '');
      }
      setStudent(editing.student || '');
      setStudentId(Number(editing.student_id) || 0);
      setNote(editing.note || '');
      setTrial(!!editing.trial);
    } else {
      setTeacherId(defaults?.teacherId ? String(defaults.teacherId) : teacherOptions[0] ? String(teacherOptions[0].id) : '');
      // Default the date to today (local) for convenience when adding fresh.
      setDate(defaults?.date || dateToStr(manilaToday()));
      const ts = defaults?.timeslot;
      if (ts && SCHEDULE_TIMESLOTS.includes(ts)) {
        setTimeslot(ts);
        setCustomTime('');
      } else if (ts) {
        setTimeslot('custom');
        setCustomTime(ts);
      } else {
        setTimeslot(SCHEDULE_TIMESLOTS[0]);
        setCustomTime('');
      }
      setStudent('');
      setStudentId(0);
      setNote('');
      setTrial(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const cls = (k) => 'form-control' + (invalid[k] ? ' required-error' : '');
  const clearMark = (k) => setInvalid((p) => ({ ...p, [k]: false }));

  const save = async () => {
    const effTimeslot = timeslot === 'custom' ? customTime.trim() : timeslot;
    const inv = {};
    if (!teacherId) inv.teacher = true;
    if (!date) inv.date = true;
    if (timeslot === 'custom' && !customTime.trim()) inv.customTime = true;
    if (!student.trim()) inv.student = true;
    setInvalid(inv);
    if (Object.keys(inv).length) {
      toast(t('toast.completeRequired'));
      return;
    }
    setBusy(true);
    try {
      // Trial classes are prospects — NEVER linked to a real student account
      // (a trial that shares a name with an enrolled student must stay separate,
      // so it never shows in that student's own schedule). Otherwise resolve the
      // id for hand-typed names: exactly one match → that student.
      let sid = trial ? 0 : Number(studentId) || 0;
      const typedName = student.trim().toLowerCase();
      if (!trial && !sid && typedName) {
        const matches = (students || []).filter(
          (s) => String(s.name || '').trim().toLowerCase() === typedName,
        );
        if (matches.length === 1) sid = Number(matches[0].id) || 0;
      }
      await onSave(
        {
          teacher_id: parseInt(teacherId, 10),
          date,
          timeslot: effTimeslot,
          student: student.trim(),
          student_id: sid,
          note: note.trim(),
          trial,
        },
        editing ? editing.id : '',
      );
    } catch (e) {
      // Parent (handleSave) already surfaced the message via toast; keep the
      // modal open so the user can correct and retry.
    } finally {
      setBusy(false);
    }
  };

  // Student record behind the schedule → Username/Info shown on the view-only
  // (locked) modal and the report viewer. ID-first (duplicate-name-safe), name
  // fallback for unlinked rows. Admin-only in practice: this modal is only ever
  // opened from the admin schedule view.
  const lockedStudentMeta = editing ? findStudentForSchedule(students, editing) : null;

  const isCancelled = !!(editing && editing.cancelled);
  const title = isCancelled
    ? t('sched.legendCancelled')
    : locked
    ? t('schedM.viewTitle')
    : editing
    ? t('schedM.editTitle')
    : t('sched.addSchedule');

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="modal-body">
        {isCancelled && (
          <div className="cancelled-class-banner">
            <div className="cancelled-class-banner-title">
              <i className="fa-solid fa-ban" aria-hidden="true"></i> This class was cancelled
            </div>
            <div className="cancelled-class-banner-reason">
              <span className="cancelled-class-banner-label">{t('cal.reason')}:</span>{' '}
              {editing.cancel_reason ? editing.cancel_reason : t('cal.noReason')}
            </div>
          </div>
        )}
        <div className="form-group">
          <label>{t('sched.teacher')}</label>
          <select
            className={cls('teacher')}
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              clearMark('teacher');
            }}
            disabled={locked}
          >
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullname}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('sched.date')}</label>
            <input
              type="date"
              className={cls('date')}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clearMark('date');
              }}
              disabled={locked}
            />
          </div>
          <div className="form-group">
            <label>{t('schedM.timeSlot')}</label>
            <select
              className="form-control"
              value={timeslot}
              onChange={(e) => setTimeslot(e.target.value)}
              disabled={locked}
            >
              {SCHEDULE_TIMESLOTS.map((ts) => (
                <option key={ts} value={ts}>
                  {ts}
                </option>
              ))}
              <option value="custom">{t('schedM.custom')}</option>
            </select>
          </div>
        </div>
        {timeslot === 'custom' && (
          <div className="form-group">
            <label>{t('schedM.customTime')}</label>
            <input
              type="text"
              className={cls('customTime')}
              placeholder={t('schedM.customTimePh')}
              value={customTime}
              onChange={(e) => {
                setCustomTime(e.target.value);
                clearMark('customTime');
              }}
              disabled={locked}
            />
          </div>
        )}
        <div className="form-group">
          <label>{t('sched.student')}</label>
          <StudentField
            value={student}
            onChange={(name, sObj) => {
              setStudent(name);
              // Picker/suggestion click carries the exact row (id survives duplicate
              // names); free typing invalidates any previously-picked id.
              setStudentId(sObj ? Number(sObj.id) || 0 : 0);
              clearMark('student');
            }}
            students={students}
            disabled={locked}
            schedMode
            invalid={!!invalid.student}
            placeholder={t('schedM.typeOrPick')}
          />
          {locked && lockedStudentMeta && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>
              <i className="fa-regular fa-user" aria-hidden="true"></i>{' '}
              {lockedStudentMeta.username || '—'}
              <span style={{ margin: '0 6px' }}>·</span>
              <i className="fa-regular fa-note-sticky" aria-hidden="true"></i>{' '}
              {lockedStudentMeta.notes || '—'}
            </div>
          )}
        </div>
        <div className="form-group">
          <label
            className="trial-check-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={trial}
              onChange={(e) => setTrial(e.target.checked)}
              disabled={locked}
              style={{ width: 18, height: 18 }}
            />
            <span>
              {t('schedM.markTrial')}{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>
                {t('schedM.trialHint')}
              </span>
            </span>
          </label>
        </div>
        <div className="form-group">
          <label>{t('schedM.noteOptional')}</label>
          <textarea
            className="form-control"
            placeholder={t('schedM.notePh')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={locked}
          />
        </div>
      </div>
      <div className="modal-footer">
        {locked && report && (
          <button className="btn btn-secondary" onClick={() => setReportOpen(true)}>
            <i className="fa-solid fa-file-lines" aria-hidden="true"></i> {t('schedM.viewReport')}
          </button>
        )}
        {editing && (
          <button
            className="btn btn-danger-confirm"
            onClick={() => onDelete(editing.id)}
            style={locked ? undefined : { marginRight: 'auto' }}
          >
            {t('common.delete')}
          </button>
        )}
        {editing && !locked && onCancelClass && (
          <button
            className="btn btn-warning"
            onClick={() => onCancelClass(editing.id)}
          >
            <i className="fa-solid fa-ban" aria-hidden="true"></i> {t('schedM.cancelClass')}
          </button>
        )}
        {!locked && (
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
        )}
        {!locked && (
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? t('common.saving') : t('schedM.saveSchedule')}
          </button>
        )}
      </div>

      {/* Class Report viewer — opens on top of the still-open schedule modal. */}
      {reportOpen && report && editing && (
        <Modal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          title={`${editing.student || 'Student'} — Class Report`}
          maxWidth="720px"
        >
          <div className="modal-body">
            <ClassReportContent
              schedule={editing}
              report={report}
              teacherName={
                (teachers || []).find((t) => t.id == editing.teacher_id)?.fullname || 'Unknown'
              }
              dateLabel={
                editing.date
                  ? parseDate(editing.date).toLocaleDateString(uiLocale(), {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : ''
              }
              onImageClick={setLightbox}
              studentMeta={lockedStudentMeta}
            />
          </div>
        </Modal>
      )}
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </Modal>
  );
}
