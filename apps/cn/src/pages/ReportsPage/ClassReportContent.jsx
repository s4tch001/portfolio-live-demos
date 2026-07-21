import { sanitizeReportHtml } from '../../lib/format.js';
import { getReportAbsentLabelT, getTrackerRemarks, formatSubmittedAt } from '../../lib/reportHelpers.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text2)',
  marginBottom: 3,
};
const valueStyle = { fontWeight: 600, fontSize: 14 };

function Field({ label, children }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{children}</div>
    </div>
  );
}

// Shared report-detail view (legacy classReportContentHtml). Used by the Reports
// drill-down and (later) the schedule-tab report viewer.
// `studentMeta` (optional, admin-only callers): { username, notes } — renders a
// Username + Info pair after the Student field. The student POV never passes it.
export default function ClassReportContent({ schedule: s, report: r, teacherName, dateLabel, onImageClick, studentMeta = null }) {
  const t = useT();
  return (
    <>
      <div
        style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px 16px',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={t('report.teacher')}>{teacherName}</Field>
          <Field label={t('report.timeOfClass')}>{s.timeslot}</Field>
          <Field label={t('report.dateOfClass')}>{dateLabel}</Field>
          <Field label={t('report.student')}>
            {s.student}
            {s.trial ? (
              <span className="badge" style={{ background: '#2563eb', color: '#fff', marginLeft: 6 }}>
                {t('report.trialClass')}
              </span>
            ) : null}
          </Field>
          {studentMeta && (
            <>
              <Field label={t('common.username')}>{studentMeta.username || '—'}</Field>
              <Field label={t('report.info')}>{studentMeta.notes || '—'}</Field>
            </>
          )}
          <Field label={t('report.material')}>{r.book || '-'}</Field>
          <Field label={t('report.pages')}>{r.pages || '-'}</Field>
          <Field label={t('report.duration')}>{r.class_duration || '-'}</Field>
          <div>
            <div style={labelStyle}>{t('report.studentIs')}</div>
            <span className={'badge ' + (r.absent ? 'badge-red' : 'badge-green')}>
              {getReportAbsentLabelT(r, t)}
            </span>
          </div>
          <Field label={t('report.remarks')}>{getTrackerRemarks(r) || '-'}</Field>
          <Field label={t('report.submittedAt')}>
            {r.submitted_at ? formatSubmittedAt(r.submitted_at) : '—'}
          </Field>
        </div>
        {r.link && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={labelStyle}>{t('report.link')}</div>
            <a
              href={r.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 14, wordBreak: 'break-all' }}
            >
              {r.link}
            </a>
          </div>
        )}
      </div>
      {s.note && (
        <div
          style={{
            background: 'var(--yellow-light)',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 14,
            fontSize: 14,
          }}
        >
          <strong>{t('report.scheduleNote')}:</strong> {s.note}
        </div>
      )}
      <div
        style={{
          marginBottom: 8,
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text2)',
        }}
      >
        {t('report.memo')}
      </div>
      {r.content ? (
        <div
          style={{ fontSize: 15, lineHeight: 1.75 }}
          dangerouslySetInnerHTML={{ __html: sanitizeReportHtml(r.content) }}
        />
      ) : (
        <div style={{ fontSize: 15, lineHeight: 1.75 }}>
          <span style={{ color: 'var(--text3)' }}>{t('report.noText')}</span>
        </div>
      )}
      {r.images && r.images.length > 0 && (
        <div className="upload-preview" style={{ marginTop: 16 }}>
          {r.images.map((img, i) => (
            <img
              key={i}
              className="upload-thumb"
              src={img}
              style={{ width: 100, height: 100, cursor: 'pointer' }}
              onClick={() => onImageClick(img)}
              alt=""
            />
          ))}
        </div>
      )}
    </>
  );
}
