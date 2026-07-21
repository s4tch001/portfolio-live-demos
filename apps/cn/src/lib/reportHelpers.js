// Report display helpers — ported from legacy app.js.
import { uiLocale } from './format.js';

export function getTrackerRemarks(report) {
  return String(report?.tracker_remarks || '').trim();
}

export function getReportAbsentLabel(report) {
  if (!report?.absent) return 'Present';
  const reason = report.absent_reason || '';
  if (reason === 'Other') {
    const other = report.absent_other || '';
    return other ? `Absent: Other - ${other}` : 'Absent: Other';
  }
  return reason ? `Absent: ${reason}` : 'Absent';
}

// Translated variant for UI (the plain getReportAbsentLabel stays English for
// file exports — receipts, lesson tracker, xlsx). `t` is the useT() translator.
export function getReportAbsentLabelT(report, t) {
  if (!report?.absent) return t('cal.present');
  const reason = report.absent_reason || '';
  if (reason === 'Other') {
    const other = report.absent_other || '';
    return other ? t('report.absentOtherText', { other }) : t('report.absentOther');
  }
  if (reason === 'Late Notice') return t('reportM.absentLate');
  if (reason === 'No Notice') return t('reportM.absentNoNotice');
  return reason ? t('reportM.absentPrefix', { reason }) : t('cal.absent');
}

// Strip HTML → plain text (to test if the editor has real content). Legacy stripReportHtml.
export function stripReportHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || div.innerText || '').trim();
}

// Allow only http(s) links; bare domains get https://. Blocks javascript:/data: etc.
// Returns a safe href or null. Legacy normalizeSafeUrl.
export function normalizeSafeUrl(url) {
  let s = String(url || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch (e) {
    return null;
  }
}

export function formatSubmittedAt(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const loc = uiLocale();
    return (
      d.toLocaleDateString(loc, { month: 'long', day: 'numeric', year: 'numeric' }) +
      ' · ' +
      d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
    );
  } catch (e) {
    return iso;
  }
}
