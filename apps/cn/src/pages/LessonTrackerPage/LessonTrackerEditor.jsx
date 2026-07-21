import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { apiFetch } from '../../lib/apiClient.js';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { parseTrackerStatus } from '../../lib/lessonTracker.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Stored/parsed values stay English (parseTrackerStatus expects them); the
// <option> labels are translated via the paired keys below.
const STATUS_OPTIONS = [
  { value: 'Present', key: 'cal.present' },
  { value: 'Absent: Late Notice', key: 'reportM.absentLate' },
  { value: 'Absent: No Notice', key: 'reportM.absentNoNotice' },
  { value: 'Absent: Other', key: 'report.absentOther' },
];

// Translated editor headers (mirrors LESSON_TRACKER_HEADERS, which stays
// English for the XLSX export).
const EDITOR_HEADER_KEYS = [
  'tracker.timestamp',
  'tracker.studentName',
  'report.material',
  'report.pages',
  'tracker.date',
  'tracker.time',
  'report.duration',
  'report.studentIs',
  'report.remarks',
];

function initialStatus(report) {
  return report.absent ? `Absent: ${report.absent_reason || 'Other'}` : 'Present';
}

// Admin lesson-tracker editor (legacy modal-lesson-tracker-editor + saveLessonTrackerEditor).
// Editable fields per report: book, pages, class_duration, status, absent_other, remarks.
export default function LessonTrackerEditor({ open, onClose, rows, teachers }) {
  const data = useData();
  const toast = useToast();
  const t = useT();
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const map = {};
    rows.forEach((row) => {
      map[row.reportId] = {
        book: row.report.book || '',
        pages: row.report.pages || '',
        class_duration: row.report.class_duration || '',
        status: initialStatus(row.report),
        absent_other: row.report.absent_reason === 'Other' ? row.report.absent_other || '' : '',
        tracker_remarks: row.report.tracker_remarks || '',
      };
    });
    setEdits(map);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (id, field, value) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const teacherName = (row) => {
    const tc = teachers.find((x) => x.id == row.sched?.teacher_id);
    return tc ? tc.fullname : '';
  };

  const save = async () => {
    setBusy(true);
    let failed = 0;
    for (const row of rows) {
      const e = edits[row.reportId];
      if (!e) continue;
      const parsed = parseTrackerStatus(e.status);
      const payload = {
        book: e.book.trim(),
        pages: e.pages.trim(),
        class_duration: e.class_duration.trim(),
        ...parsed,
        absent_other: parsed.absent_reason === 'Other' ? (e.absent_other || '').trim() : '',
        tracker_remarks: e.tracker_remarks.trim(),
      };
      try {
        await apiFetch(`/lesson-tracker/${row.reportId}`, 'PUT', payload);
        data.upsertReport({ ...row.report, ...payload });
      } catch (err) {
        failed++;
      }
    }
    setBusy(false);
    if (failed) {
      toast(t('tracker.saveFailed', { n: failed }));
    } else {
      toast(t('tracker.saved'));
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('tracker.editTitle')} maxWidth="900px" closeOnOverlay={false}>
      <div className="modal-body">
        <div className="lesson-tracker-table-wrap">
          <table className="lesson-editor-table">
            <thead>
              <tr>
                <th>{t('report.teacher')}</th>
                {EDITOR_HEADER_KEYS.map((k) => (
                  <th key={k}>{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const e = edits[row.reportId] || {};
                return (
                  <tr key={row.reportId}>
                    <td className="readonly-cell">{teacherName(row)}</td>
                    <td className="readonly-cell">{row.timestamp}</td>
                    <td className="readonly-cell">{row.student}</td>
                    <td>
                      <input value={e.book || ''} onChange={(ev) => set(row.reportId, 'book', ev.target.value)} />
                    </td>
                    <td>
                      <input value={e.pages || ''} onChange={(ev) => set(row.reportId, 'pages', ev.target.value)} />
                    </td>
                    <td className="readonly-cell">{row.dateLabel}</td>
                    <td className="readonly-cell">{row.time}</td>
                    <td>
                      <input
                        value={e.class_duration || ''}
                        onChange={(ev) => set(row.reportId, 'class_duration', ev.target.value)}
                      />
                    </td>
                    <td>
                      <select value={e.status || 'Present'} onChange={(ev) => set(row.reportId, 'status', ev.target.value)}>
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {t(o.key)}
                          </option>
                        ))}
                      </select>
                      {e.status === 'Absent: Other' && (
                        <input
                          className="lesson-editor-other"
                          placeholder={t('tracker.otherReasonPh')}
                          value={e.absent_other || ''}
                          onChange={(ev) => set(row.reportId, 'absent_other', ev.target.value)}
                          style={{ marginTop: 4 }}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        value={e.tracker_remarks || ''}
                        onChange={(ev) => set(row.reportId, 'tracker_remarks', ev.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </Modal>
  );
}
