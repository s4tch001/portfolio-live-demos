import { useState, useEffect } from 'react';
import Modal from '../ui/Modal.jsx';
import { apiFetch, getAuthToken } from '../../lib/apiClient.js';
import { WORKER_URL } from '../../lib/workerUrl.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { dateToStr, formatDateNice } from '../../lib/format.js';
import { getDateRange, triggerDownload } from '../../lib/exporters/xlsx.js';

// Master-only data backup modal (legacy modal-data-backup + openDataBackupModal/
// executeDataBackup/downloadDatabaseBackupForRange). mode 'cloud' saves a SQL
// backup to R2 db-backup/; mode 'download' streams a .sql to the device.
export default function DataBackupModal({ open, mode = 'download', onClose }) {
  const toast = useToast();
  const t = useT();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);

  // Default the range to first-of-month → today each time it opens.
  useEffect(() => {
    if (!open) return;
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStart(dateToStr(firstDay));
    setEnd(dateToStr(today));
  }, [open]);

  const isCloud = mode === 'cloud';
  const dates = getDateRange(start, end);
  const tail = isCloud ? t('backup.tailCloud') : t('backup.tailDownload');
  const summary = !dates.length
    ? t('backup.selectDates')
    : t(dates.length === 1 ? 'backup.daysIncludedOne' : 'backup.daysIncludedMany', {
        n: dates.length,
        from: formatDateNice(start),
        to: formatDateNice(end),
        tail,
      });

  const confirmLabel = isCloud ? (
    <><i className="fa-solid fa-cloud-arrow-up"></i> {t('backup.toCloud')}</>
  ) : (
    <><i className="fa-solid fa-download"></i> {t('backup.downloadSql')}</>
  );

  const execute = async () => {
    if (!getDateRange(start, end).length) {
      toast(t('reports.validRange'));
      return;
    }
    setBusy(true);
    try {
      if (isCloud) {
        const result = await apiFetch('/backup', 'POST', { start, end });
        onClose();
        toast(t('backup.savedToCloud', { filename: result.filename }));
      } else {
        const headers = {};
        const token = getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(
          WORKER_URL + `/backup/download?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          { headers },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error((data && data.error) || res.statusText);
        }
        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const m = disposition.match(/filename="?([^";]+)"?/i);
        const filename = (m && m[1]) || `educonnect-backup-${dateToStr(new Date())}.sql`;
        triggerDownload(blob, filename);
        onClose();
        toast(t('backup.downloadStarted'));
      }
    } catch (e) {
      toast(isCloud ? t('backup.backupFailed', { msg: e.message || String(e) }) : t('rc.downloadFailed', { msg: e.message || String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCloud ? t('backup.titleCloud') : t('backup.titleDownload')}
      maxWidth="520px"
    >
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group">
            <label>{t('common.startDate')}</label>
            <input type="date" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{t('common.endDate')}</label>
            <input type="date" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="report-download-summary">{summary}</div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={execute} disabled={busy}>
          {busy ? <><span className="spinner"></span> {isCloud ? t('backup.backingUp') : t('backup.downloading')}</> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
