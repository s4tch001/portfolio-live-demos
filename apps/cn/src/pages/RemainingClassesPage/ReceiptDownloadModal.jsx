import { useState, useMemo, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { apiFetch, queryPath } from '../../lib/apiClient.js';
import { fetchReceiptCard } from '../../lib/receiptCard.js';
import { buildReceiptCardsFile, triggerDownload } from '../../lib/exporters/xlsx.js';
import { useReceiptModal } from './ReceiptModalContext.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Bulk receipt downloader. Lists the year's receipts with checkboxes, a per-row
// "View Receipt" button (opens the shared receipt card on top), and downloads
// the chosen receipts as a single .xlsx — one sheet per receipt.
//
// The main list uses infinite scroll (one page at a time), but bulk download needs
// EVERY receipt for the year, so this modal fetches the full set itself (no `limit`,
// which returns the legacy full array) only when it is actually opened.
export default function ReceiptDownloadModal({ open, onClose, year, search }) {
  const { teachers } = useData();
  const toast = useToast();
  const t = useT();
  const { openCard } = useReceiptModal();
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!open || !year) return undefined;
    let alive = true;
    setLoading(true);
    setLoadErr('');
    setSelected(new Set());
    apiFetch(queryPath('/receipts', { year, search: (search || '').trim() }))
      .then((d) => {
        if (alive) setList(Array.isArray(d) ? d : []);
      })
      .catch((e) => {
        if (alive) {
          setList([]);
          setLoadErr(e.message || 'Failed to load');
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, year, search]);

  const keyOf = (r) => r.receipt_no + '|' + (r.student_id || 0);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.receipt_no || '').toLowerCase().includes(q) ||
        (r.student_name || '').toLowerCase().includes(q),
    );
  }, [list, filter]);

  const toggle = (r) => {
    const k = keyOf(r);
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };
  const selectAll = () => setSelected(new Set(shown.map(keyOf)));
  const clearAll = () => setSelected(new Set());

  const download = async () => {
    const picks = list.filter((r) => selected.has(keyOf(r)));
    if (!picks.length) return toast(t('rrec.selectAtLeast'));
    setBusy(true);
    try {
      const cards = [];
      for (const r of picks) {
        // fetchReceiptCard(studentId, receiptNo, studentName, teachers)
        const card = await fetchReceiptCard(r.student_id || 0, r.receipt_no, r.student_name || '', teachers);
        if (card && card.model && !card.model.notFound) cards.push(card);
      }
      if (!cards.length) {
        toast(t('rrec.couldNotBuild'));
        return;
      }
      const file = await buildReceiptCardsFile(cards);
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
    <Modal open={open} onClose={onClose} title={t('rrec.downloadReceipts')} maxWidth="640px">
      <div className="modal-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            className="form-control"
            placeholder={t('rrec.filterPh')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <button className="btn btn-sm btn-secondary" type="button" onClick={selectAll}>
            {t('rrec.selectAll')}
          </button>
          <button className="btn btn-sm btn-secondary" type="button" onClick={clearAll}>
            {t('sched.clear')}
          </button>
        </div>

        <div className="receipt-download-list">
          {loading ? (
            <div className="notif-empty"><span className="spinner"></span> {t('common.loading')}</div>
          ) : loadErr ? (
            <div className="notif-empty">{t('rem.failedToLoad', { msg: loadErr })}</div>
          ) : !shown.length ? (
            <div className="notif-empty">{t('rrec.noReceiptsToChoose')}</div>
          ) : (
            shown.map((r) => {
              const k = keyOf(r);
              const monthly = !!r.has_monthly;
              const rem = monthly ? '∞' : r.remaining || 0;
              return (
                <label key={k} className={'receipt-download-item' + (selected.has(k) ? ' selected' : '')}>
                  <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(r)} />
                  <span className="receipt-download-main">
                    <span className="receipt-download-no">
                      <i className="fa-solid fa-receipt"></i> {r.receipt_no}
                    </span>
                    <span className="receipt-download-student">{r.student_name || ''}</span>
                  </span>
                  <span className="receipt-download-rem">
                    {String(rem)} {monthly ? t('rrec.unlimitedSmall') : t('rrec.left')}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    title={t('rrec.viewReceipt')}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openCard(r.receipt_no, r.student_id || 0, r.student_name || '', { viewOnly: true });
                    }}
                  >
                    <i className="fa-solid fa-eye"></i> {t('rrec.view')}
                  </button>
                </label>
              );
            })
          )}
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
