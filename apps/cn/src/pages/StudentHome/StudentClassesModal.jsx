import { useState, useEffect, useMemo } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import Lightbox from '../../components/ui/Lightbox.jsx';
import ClassReportContent from '../ReportsPage/ClassReportContent.jsx';
import { apiFetch } from '../../lib/apiClient.js';
import { parseDate, uiLocale } from '../../lib/format.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Student/parent class history (China build): every class of the student that
// has a filed report, newest first. Tap one to read the full report (teacher,
// time, material, pages, duration, memo & feedback, images) — the same detail
// the Reports tab shows admins, scoped to this student.
export default function StudentClassesModal({ open, onClose }) {
  const t = useT();
  const [rows, setRows] = useState([]); // [{ schedule, report }]
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(null); // { schedule, report }
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      return;
    }
    setLoaded(false);
    apiFetch('/my-classes')
      .then((res) => {
        const schedules = Array.isArray(res?.schedules) ? res.schedules : [];
        const reports = Array.isArray(res?.reports) ? res.reports : [];
        const byId = new Map(schedules.map((s) => [String(s.id), s]));
        const paired = reports
          .map((r) => ({ report: r, schedule: byId.get(String(r.schedule_id)) }))
          .filter((x) => x.schedule)
          .sort((a, b) => String(b.schedule.date).localeCompare(String(a.schedule.date)));
        setRows(paired);
      })
      .catch(() => setRows([]))
      .finally(() => setLoaded(true));
  }, [open]);

  const dateLabel = useMemo(
    () =>
      selected
        ? parseDate(selected.schedule.date).toLocaleDateString(uiLocale(), {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          })
        : '',
    [selected],
  );

  const title = selected ? t('student.classReport') : t('menu.myClasses');

  return (
    <>
      <Modal open={open} onClose={onClose} title={title}>
        <div className="modal-body">
          {selected ? (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelected(null)}
                style={{ marginBottom: 14 }}
              >
                <i className="fa-solid fa-chevron-left" aria-hidden="true"></i> {t('student.backToList')}
              </button>
              <ClassReportContent
                schedule={selected.schedule}
                report={selected.report}
                teacherName={selected.report.teacher_name || '-'}
                dateLabel={dateLabel}
                onImageClick={setLightbox}
              />
            </>
          ) : !loaded ? (
            <div style={{ color: 'var(--text3)', padding: '10px 2px' }}>{t('common.loading')}</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <i className="fa-solid fa-calendar-check" aria-hidden="true"></i>
              </div>
              <p>{t('student.noReports')}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(({ schedule: s, report: r }) => (
                <button
                  key={r.id}
                  className="card"
                  onClick={() => setSelected({ schedule: s, report: r })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', width: '100%',
                    color: 'var(--text)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                      {parseDate(s.date).toLocaleDateString(uiLocale(), { month: 'short', day: 'numeric', year: 'numeric' })}
                      {s.timeslot ? ' · ' + s.timeslot : ''}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      {r.teacher_name || '-'}
                    </div>
                  </div>
                  <span className={'badge ' + (r.absent ? 'badge-red' : 'badge-green')}>
                    {r.absent ? t('cal.absent') : t('cal.present')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
