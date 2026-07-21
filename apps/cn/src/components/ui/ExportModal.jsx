import { useState, useEffect, useMemo } from 'react';
import Modal from './Modal.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Export modal matching the v15 SPA's three distinct export dialogs:
//  - teacher Schedule (modal-teacher-schedule-export): date range only.
//  - admin Reports (modal-download-reports): quick-filter <select> + All/Clear
//    + teacher checklist + date range.
//  - Lesson Tracker (modal-lesson-tracker-download): All/Clear + checklist + dates.
// All share the date row + report-download-summary + Cancel/confirm footer.
export default function ExportModal({
  open,
  onClose,
  title,
  confirmLabel,
  defaultStart,
  defaultEnd,
  teachers = null, // array → show checklist; null → date-only
  showQuickFilter = false, // Reports only
  clearLabel = null, // defaults to the translated "Clear"
  initialSelectedIds = null, // pre-checked ids; null → all
  buildSummary, // (start, end, selectedIds) => string
  onConfirm, // (start, end, selectedIds) => Promise
}) {
  const tr = useT();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [quick, setQuick] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStart(defaultStart || '');
    setEnd(defaultEnd || '');
    setBusy(false);
    if (teachers) {
      const init =
        initialSelectedIds != null
          ? new Set(initialSelectedIds.map(String))
          : new Set(teachers.map((t) => String(t.id)));
      setSelected(init);
      setQuick(initialSelectedIds && initialSelectedIds.length === 1 ? String(initialSelectedIds[0]) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const summary = buildSummary ? buildSummary(start, end, selectedIds) : '';

  // Quick-filter <select>: '' = all teachers, else exactly that one
  // (legacy reportDownloadApplyQuickFilter).
  const onQuick = (val) => {
    setQuick(val);
    if (!teachers) return;
    setSelected(val ? new Set([String(val)]) : new Set(teachers.map((t) => String(t.id))));
  };

  // Toggling a checkbox desyncs the quick filter unless exactly one stays checked
  // and it matches (legacy reportDownloadTeacherChanged).
  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      const k = String(id);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      if (showQuickFilter) {
        const arr = [...n];
        setQuick(arr.length === 1 && arr[0] === quick ? quick : '');
      }
      return n;
    });
  };

  const selectAll = () => {
    setQuick('');
    setSelected(new Set(teachers.map((t) => String(t.id))));
  };
  const clearAll = () => {
    setQuick('');
    setSelected(new Set());
  };

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm(start, end, [...selected]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={teachers ? '720px' : '520px'}>
      <div className="modal-body">
        {teachers && (
          <div className="form-group">
            <label>{showQuickFilter ? tr('exp.filterByTeacher') : tr('exp.teachers')}</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {showQuickFilter && (
                <select className="filter-select" value={quick} onChange={(e) => onQuick(e.target.value)}>
                  <option value="">{tr('sched.allTeachers')}</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullname}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn btn-secondary btn-sm" onClick={selectAll}>
                {tr('sched.allTeachers')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={clearAll}>
                {clearLabel || tr('sched.clear')}
              </button>
            </div>
            <div className="teacher-check-list">
              {teachers.map((t) => (
                <label className="teacher-check-item" key={t.id}>
                  <input
                    type="checkbox"
                    value={t.id}
                    checked={selected.has(String(t.id))}
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
                    {(t.fullname || '?').charAt(0)}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{t.fullname}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>{tr('common.startDate')}</label>
            <input type="date" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{tr('common.endDate')}</label>
            <input type="date" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="report-download-summary">{summary}</div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          {tr('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? <><span className="spinner"></span> {tr('rc.preparing')}</> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
