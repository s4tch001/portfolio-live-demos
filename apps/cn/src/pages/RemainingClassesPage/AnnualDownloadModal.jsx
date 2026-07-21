import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { apiFetch, queryPath } from '../../lib/apiClient.js';
import { buildAnnualReportFile, triggerDownload } from '../../lib/exporters/xlsx.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Year picker for the Annual Report download. Pick one or more years → fetches
// each year's /annual-summary and builds a single .xlsx with one sheet per year
// (sheet name = the year). Filename: annual-report-<years>.xlsx.
export default function AnnualDownloadModal({ open, onClose, currentYear }) {
  const toast = useToast();
  const t = useT();
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // Offer 2025 → current year (only those can hold data). Preselect the year
  // currently on screen for convenience.
  const nowYear = new Date().getFullYear();
  const maxYear = Math.max(nowYear, Number(currentYear) || nowYear);
  const years = [];
  for (let y = 2025; y <= maxYear; y++) years.push(y);

  useEffect(() => {
    if (open) setSelected(new Set(currentYear ? [Number(currentYear)] : []));
  }, [open, currentYear]);

  const toggle = (y) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(y)) n.delete(y);
      else n.add(y);
      return n;
    });

  const download = async () => {
    const picks = [...selected].sort((a, b) => a - b);
    if (!picks.length) return toast(t('rem.selectAtLeastYear'));
    setBusy(true);
    try {
      const selections = [];
      for (const y of picks) {
        const summary = await apiFetch(queryPath('/annual-summary', { year: String(y) }));
        if (summary && typeof summary === 'object') selections.push({ year: y, summary });
      }
      if (!selections.length) {
        toast(t('rem.couldNotBuildReport'));
        return;
      }
      const file = await buildAnnualReportFile(selections);
      triggerDownload(file.blob, file.filename);
      toast(t('rc.downloadStarted'));
      onClose();
    } catch (e) {
      toast(t('rc.downloadFailed', { msg: e.message || String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const count = selected.size;

  return (
    <Modal open={open} onClose={onClose} title={t('radl.title')} maxWidth="460px">
      <div className="modal-body">
        <p style={{ margin: '0 0 12px', color: 'var(--text2)', fontSize: 13 }}>
          {t('radl.intro')}
        </p>
        <div className="annual-dl-years">
          {years.map((y) => (
            <label key={y} className={'annual-dl-year' + (selected.has(y) ? ' selected' : '')}>
              <input type="checkbox" checked={selected.has(y)} onChange={() => toggle(y)} />
              <i className="fa-solid fa-calendar-days"></i>
              <span>{y}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" type="button" onClick={download} disabled={busy || !count}>
          {busy ? (
            <><span className="spinner"></span> {t('rc.preparing')}</>
          ) : (
            <><i className="fa-solid fa-file-excel"></i> {t('common.download')}{count ? ` (${count})` : ''}</>
          )}
        </button>
      </div>
    </Modal>
  );
}
