import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useConfirm } from '../../context/ConfirmProvider.jsx';
import { formatNotifTime } from '../../context/NotificationsProvider.jsx';
import { getHtml2Canvas } from '../../lib/cdn.js';
import { buildCardModel, loadMergedUsage, sumLineText, ordinal, monthlyPaymentLine } from '../../lib/receiptCard.js';
import { isValidReceiptNo } from '../../lib/receipts.js';
import { buildReceiptCardsFile, triggerDownload } from '../../lib/exporters/xlsx.js';
import { onRealtime } from '../../lib/realtime.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

const ReceiptModalCtx = createContext(null);

// Shared receipt-detail modal (legacy modal-receipt-detail). Ported from
// showReceiptDetail (list of a student's receipts) + showReceiptCard (one
// receipt's usage breakdown) + loadMergedUsage + deleteReceiptGroup +
// downloadReceiptCard. Both the View and Receipts sub-tabs open it.
export function ReceiptModalProvider({ children }) {
  // desc: null | { view:'list'|'card', studentId, studentName, receiptNo }
  const [desc, setDesc] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const subscribersRef = useRef(new Set());

  const openList = useCallback((studentId, studentName) => {
    setDesc({ view: 'list', studentId, studentName, receiptNo: '' });
  }, []);
  const openCard = useCallback((receiptNo, studentId, studentName, opts = {}) => {
    // viewOnly: opened from the bulk Download modal — render on top, hide the
    // download buttons, and make Back close the card (revealing that modal).
    setDesc({ view: 'card', studentId, studentName, receiptNo: (receiptNo || '').trim(), viewOnly: !!opts.viewOnly });
  }, []);
  const close = useCallback(() => setDesc(null), []);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Live: if a receipt/transaction changes elsewhere while a card/list is open,
  // re-pull it so the open modal stays current.
  useEffect(() => {
    if (!desc) return undefined;
    return onRealtime('sync', (msg) => {
      if (msg && msg.resource === 'transactions') setRefreshKey((k) => k + 1);
    });
  }, [desc]);

  // Let the View tab refetch its balances after a delete inside the modal.
  const onChanged = useCallback((cb) => {
    subscribersRef.current.add(cb);
    return () => subscribersRef.current.delete(cb);
  }, []);
  const notifyChanged = useCallback(() => {
    subscribersRef.current.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        /* ignore */
      }
    });
  }, []);

  const value = { openList, openCard, close, refresh, onChanged, notifyChanged };

  return (
    <ReceiptModalCtx.Provider value={value}>
      {children}
      {desc && (
        <ReceiptModal
          desc={desc}
          refreshKey={refreshKey}
          setDesc={setDesc}
          onClose={close}
          refresh={refresh}
          notifyChanged={notifyChanged}
        />
      )}
    </ReceiptModalCtx.Provider>
  );
}

export function useReceiptModal() {
  const ctx = useContext(ReceiptModalCtx);
  if (!ctx) throw new Error('useReceiptModal must be used within ReceiptModalProvider');
  return ctx;
}

function ReceiptModal({ desc, refreshKey, setDesc, onClose, refresh, notifyChanged }) {
  const { teachers } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const tr = useT();

  // Close on Escape (mirrors the legacy global handler).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = desc.view === 'card'
    ? tr('rc.receiptTitle', { no: desc.receiptNo || tr('rc.noReceipt') })
    : tr('rc.receiptsFor', { name: desc.studentName });

  return (
    <div
      className="modal-overlay open"
      style={desc.viewOnly ? { zIndex: 1100 } : undefined}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal modal-receipt" style={{ maxWidth: '1200px' }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose} aria-label={tr('common.close')}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div id="receipt-detail-body">
          {desc.view === 'list' ? (
            <ReceiptList
              desc={desc}
              refreshKey={refreshKey}
              teachers={teachers}
              toast={toast}
              confirm={confirm}
              notifyChanged={notifyChanged}
              onClose={onClose}
              onOpenCard={(receiptNo) => setDesc({ ...desc, view: 'card', receiptNo: (receiptNo || '').trim() })}
            />
          ) : (
            <ReceiptCard
              desc={desc}
              refreshKey={refreshKey}
              teachers={teachers}
              toast={toast}
              confirm={confirm}
              refresh={refresh}
              notifyChanged={notifyChanged}
              setDesc={setDesc}
              viewOnly={!!desc.viewOnly}
              onBack={() => setDesc({ ...desc, view: 'list' })}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- List view (showReceiptDetail) ----
function ReceiptList({ desc, refreshKey, teachers, toast, confirm, notifyChanged, onClose, onOpenCard }) {
  const tr = useT();
  const [txns, setTxns] = useState(null);
  const [err, setErr] = useState('');
  // Default: only receipts that still have classes left (cheap on D1 reads). The user can
  // expand to pull the full history — used-up receipts included — on demand.
  const [showUsedUp, setShowUsedUp] = useState(false);

  const load = useCallback(() => {
    setTxns(null);
    setErr('');
    // with_remaining=1: only pull receipts that still have classes left (the card view
    // and delete still fetch the full set when they need every transaction). Dropping it
    // (showUsedUp) pulls every receipt including used-up ones.
    const url =
      '/class-transactions?student_id=' + desc.studentId + (showUsedUp ? '' : '&with_remaining=1');
    apiFetch(url)
      .then((d) => setTxns(Array.isArray(d) ? d : []))
      .catch((e) => setErr(e.message || 'Error'));
  }, [desc.studentId, showUsedUp]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Toggle is shown in every state (even empty) so a student whose receipts are all used
  // up can still expand to reveal them.
  const usedUpToggle = (
    <div style={{ textAlign: 'center', marginTop: 12 }}>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowUsedUp((v) => !v)}>
        <i className={'fa-solid ' + (showUsedUp ? 'fa-eye-slash' : 'fa-clock-rotate-left')}></i>{' '}
        {showUsedUp ? tr('rc.hideUsedUp') : tr('rc.showUsedUp')}
      </button>
    </div>
  );

  if (err) return <div className="notif-empty">{tr('rmod.error', { msg: err })}</div>;
  if (txns === null) return <div className="notif-empty">{tr('common.loading')}</div>;

  const relevant = txns.filter((t) => t.type !== 'cancel-monthly-fee');
  if (!txns.length) return <><div className="notif-empty">{tr('rc.noTxns')}</div>{usedUpToggle}</>;
  if (!relevant.length) return <><div className="notif-empty">{tr('rc.noClassTxns')}</div>{usedUpToggle}</>;

  // Group strictly by receipt_no.
  const groups = [];
  for (const t of relevant) {
    const key = (t.receipt_no || '').trim() || '(no receipt)';
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, receipt_no: (t.receipt_no || '').trim(), items: [] };
      groups.push(g);
    }
    g.items.push(t);
  }
  groups.forEach((g) => {
    g.maxId = Math.max(...g.items.map((i) => i.id));
    const rem = g.items.reduce((s, it) => s + (it.type === 'monthly-fee' ? 0 : it.remaining_classes || 0), 0);
    const hasMonthly = g.items.some((it) => it.type === 'monthly-fee' && it.status === 'active');
    g.hasRemaining = hasMonthly || rem > 0;
  });
  groups.sort((a, b) => (a.hasRemaining === b.hasRemaining ? b.maxId - a.maxId : a.hasRemaining ? -1 : 1));

  const totalBalance = relevant.reduce((s, t) => s + (t.type === 'monthly-fee' ? 0 : t.remaining_classes || 0), 0);
  const anyMonthly = relevant.some((t) => t.type === 'monthly-fee' && t.status === 'active');

  const deleteGroup = async (receiptNo) => {
    const ok = await confirm({
      title: tr('rc.deleteReceiptTitle'),
      lines: [{ label: tr('rmod.receiptNo'), value: receiptNo || tr('rc.noReceipt') }],
      message: tr('rc.deleteReceiptMsg'),
      okText: tr('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      const all = await apiFetch('/class-transactions?student_id=' + desc.studentId);
      const key = (receiptNo || '').trim();
      const targets = Array.isArray(all) ? all.filter((t) => (t.receipt_no || '').trim() === key) : [];
      for (const t of targets) {
        await apiFetch('/class-transactions/' + t.id, 'DELETE');
      }
      toast(tr('rc.receiptDeleted'));
      notifyChanged();
      load();
    } catch (e) {
      toast(tr('rmod.error', { msg: e.message || String(e) }));
    }
  };

  return (
    <>
      <div className="receipt-detail-top">
        <button className="btn btn-sm btn-secondary" onClick={onClose}>
          <i className="fa-solid fa-arrow-left"></i> {tr('common.back')}
        </button>
        <span className="receipt-detail-balance">
          {anyMonthly ? (
            <span className="bal-badge badge-monthly">{tr('rc.monthlyUnlimited')}</span>
          ) : (
            <>{tr('rc.totalBalancePre')}<strong>{totalBalance}</strong>{tr('rc.classesUnit')}</>
          )}
        </span>
      </div>
      <div className="receipt-select-list">
        {groups.map((g) => {
          const remaining = g.items.reduce((s, it) => s + (it.type === 'monthly-fee' ? 0 : it.remaining_classes || 0), 0);
          const hasMonthly = g.items.some((it) => it.type === 'monthly-fee' && it.status === 'active');
          return (
            <div
              key={g.key}
              className="receipt-select-item"
              onClick={() => onOpenCard(g.receipt_no)}
            >
              <span className="receipt-select-no">
                <i className="fa-solid fa-receipt"></i> {g.receipt_no || tr('rc.noReceipt')}
              </span>
              {hasMonthly ? (
                <span className="bal-badge badge-monthly">{tr('rc.unlimited')}</span>
              ) : (
                <span className="receipt-select-rem">{tr('rc.remaining', { n: remaining })}</span>
              )}
              <button
                className="btn btn-sm btn-ghost receipt-delete-btn"
                title={tr('rc.deleteReceipt')}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteGroup(g.receipt_no);
                }}
              >
                <i className="fa-solid fa-trash-can"></i>
              </button>
            </div>
          );
        })}
      </div>
      {usedUpToggle}
    </>
  );
}

// ---- Card view (showReceiptCard + loadMergedUsage) ----
function ReceiptCard({ desc, refreshKey, teachers, toast, confirm, refresh, notifyChanged, setDesc, onBack, onClose, viewOnly = false }) {
  const tr = useT();
  // Student record (username + admin note) for the card header; also embedded
  // in the XLSX download. Snapshot (html2canvas) captures the header as-is.
  const { students, ensureStudents } = useData();
  useEffect(() => {
    ensureStudents();
  }, [ensureStudents]);
  const stMeta = students.find((x) => x.id == desc.studentId) || null;
  const [txns, setTxns] = useState(null);
  const [usageRows, setUsageRows] = useState(null); // null = loading usage
  const [err, setErr] = useState('');
  const [xlsxBusy, setXlsxBusy] = useState(false);
  // Inline edit state: the receipt no + header fields (date / transaction no / remarks).
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ receiptNo: '', date: '', txNo: '', remarks: '' });
  const cardRef = useRef(null);

  useEffect(() => {
    setTxns(null);
    setUsageRows(null);
    setErr('');
    setEditing(false); // leaving edit mode whenever the underlying receipt reloads
    apiFetch('/class-transactions?student_id=' + desc.studentId)
      .then((d) => setTxns(Array.isArray(d) ? d : []))
      .catch((e) => setErr(e.message || 'Error'));
  }, [desc.studentId, desc.receiptNo, refreshKey]);

  // Build the card model from the transactions.
  const model = txns === null ? null : buildCardModel(txns, desc.receiptNo, desc.studentName, teachers);

  // Load usage once the model is ready. Guard notFound (receipt deleted/renamed out from under
  // an open card, e.g. via live sync) — model has no tableSources then and the render bails anyway.
  useEffect(() => {
    if (!model || model.notFound || !model.tableSources.length) {
      setUsageRows([]);
      return;
    }
    let alive = true;
    loadMergedUsage(model.tableSources, model.isUnlimited ? [] : model.consumedTxns, teachers, {
      remainingCls: model.remaining,
      unlimited: model.isUnlimited,
      t: tr,
    })
      .then((rows) => {
        if (alive) setUsageRows(rows);
      })
      .catch(() => {
        if (alive) setUsageRows('error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, desc.receiptNo, refreshKey, tr]);

  const downloadCard = async () => {
    const card = cardRef.current;
    if (!card) return toast(tr('rc.openFirst'));
    const html2canvas = getHtml2Canvas();
    if (typeof html2canvas !== 'function') return toast(tr('rc.imgLibNotLoaded'));
    const actions = card.querySelector('.card-actions');
    const prevDisplay = actions ? actions.style.display : null;
    if (actions) actions.style.display = 'none';
    // Expand any horizontally-scrolling regions (the usage table) and widen the
    // card to its full content width so the snapshot captures the WHOLE receipt
    // even on narrow screens where the table would otherwise be clipped/scrolled.
    const scrollers = [...card.querySelectorAll('.receipt-table-scroll')];
    const savedScrollers = scrollers.map((el) => ({ el, css: el.getAttribute('style') || '' }));
    scrollers.forEach((el) => {
      el.style.overflow = 'visible';
      el.style.width = 'max-content';
      el.style.maxWidth = 'none';
    });
    const savedCardCss = card.getAttribute('style') || '';
    const fullWidth = Math.max(card.scrollWidth, card.offsetWidth);
    card.style.width = fullWidth + 'px';
    card.style.maxWidth = 'none';
    const cardBg = getComputedStyle(card).backgroundColor || '#ffffff';
    try {
      const canvas = await html2canvas(card, {
        scale: 2,
        backgroundColor: cardBg,
        useCORS: true,
        scrollX: 0,
        scrollY: 0,
        width: fullWidth,
        windowWidth: fullWidth,
        windowHeight: card.scrollHeight,
      });
      const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, ' ');
      const fname = `receipt-${safe(desc.receiptNo || 'receipt')}-${safe(desc.studentName || 'student')}.png`;
      await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            toast(tr('rc.couldNotGenImg'));
            return resolve();
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        }, 'image/png');
      });
    } catch (e) {
      toast(tr('rc.downloadFailed', { msg: e.message || String(e) }));
    } finally {
      savedScrollers.forEach(({ el, css }) => el.setAttribute('style', css));
      card.setAttribute('style', savedCardCss);
      if (actions) actions.style.display = prevDisplay;
    }
  };

  // Download this single receipt as a themed .xlsx (one sheet, named after the
  // receipt no.). Reuses the model + usage already loaded for the on-screen card.
  const downloadXlsx = async () => {
    if (!model || model.notFound) return toast(tr('rc.openFirst'));
    if (usageRows === null) return toast(tr('rc.stillLoadingUsage'));
    setXlsxBusy(true);
    try {
      const rows = Array.isArray(usageRows) ? usageRows : [];
      const file = await buildReceiptCardsFile([{
        // stUsername/stNotes extend the info band of the XLSX (single-card only).
        model: { ...model, stUsername: stMeta ? stMeta.username || '' : '', stNotes: stMeta ? stMeta.notes || '' : '' },
        usageRows: rows,
      }]);
      triggerDownload(file.blob, file.filename);
      toast(tr('rc.downloadStarted'));
    } catch (e) {
      toast(tr('rc.downloadFailed', { msg: e.message || String(e) }));
    } finally {
      setXlsxBusy(false);
    }
  };

  // Enter edit mode, seeding the form from the current header values so existing data
  // (even on a completed receipt) carries over — only these fields change.
  const startEdit = () => {
    if (!model || model.notFound) return;
    setForm({
      receiptNo: model.receiptNo || '',
      date: model.dateStr || '',
      txNo: model.transactionNo || '',
      remarks: model.remarks || '',
    });
    setEditing(true);
  };

  // Save receipt no + header. Receipt no updates the whole group; date/transaction no/remarks
  // update the head txn. On rename we keep the card open on the new number.
  const saveEdit = async () => {
    if (!model || model.notFound) return;
    const newNo = form.receiptNo.trim();
    if (newNo && !isValidReceiptNo(newNo)) {
      toast(tr('rc.invalidReceipt'));
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/receipts/edit', 'POST', {
        student_id: model.studentId,
        old_receipt_no: model.oldReceiptNo,
        new_receipt_no: newNo,
        head_id: model.headId,
        date: form.date.trim(),
        transaction_no: form.txNo.trim(),
        remarks: form.remarks.trim(),
      });
      toast(tr('rc.receiptUpdated'));
      setEditing(false);
      notifyChanged();
      if (newNo && newNo !== model.oldReceiptNo) {
        setDesc((d) => ({ ...d, receiptNo: newNo })); // reloads the card on the renamed receipt
      } else {
        refresh();
      }
    } catch (e) {
      toast(tr('rmod.error', { msg: e.message || String(e) }));
    } finally {
      setSaving(false);
    }
  };

  // Remove one unused (available) class from a receipt line — drops remaining by 1. The
  // server re-checks that the slot is truly unused (no schedule/report ever touched).
  const removeRow = async (srcTxnId) => {
    if (!srcTxnId) return;
    const ok = await confirm({
      title: tr('rc.removeClassTitle'),
      lines: [
        { label: tr('rmod.receiptNo'), value: (model && model.receiptNo) || tr('rc.noReceipt') },
        { label: tr('report.student'), value: (model && model.stName) || '' },
      ],
      message: tr('rc.removeClassMsg'),
      okText: tr('rc.removeClassOk'),
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch('/class-transactions/' + srcTxnId + '/remove-slot', 'POST');
      toast(tr('rc.removedClass'));
      notifyChanged();
      refresh();
    } catch (e) {
      toast(tr('rmod.error', { msg: e.message || String(e) }));
    }
  };

  if (err) return <div className="notif-empty">{tr('rmod.error', { msg: err })}</div>;
  if (txns === null) return <div className="notif-empty">{tr('common.loading')}</div>;
  if (!model) return <div className="notif-empty">{tr('rc.receiptNotFound')}</div>;
  if (model.notFound) return <div className="notif-empty">{tr('rc.receiptNotFound')}</div>;

  const { receiptNo, stName, dateStr, transactionNo, remarks, tableSources, summaryItems, monthlyItem, monthlyActive, monthlyPayments, cancelItem, remainingDisplay } = model;

  return (
    <>
      <div className="receipt-detail-top">
        <button className="btn btn-sm btn-secondary" onClick={viewOnly ? onClose : onBack}>
          <i className="fa-solid fa-arrow-left"></i> {viewOnly ? tr('common.back') : tr('rc.backToReceipts')}
        </button>
      </div>
      <div className="receipt-card" ref={cardRef}>
        <div className="receipt-card-header">
          {editing ? (
            <>
              <span>
                <strong>{tr('rc.hReceipt')}</strong>{' '}
                <input
                  type="text"
                  className="form-control receipt-edit-input"
                  style={{ width: 130 }}
                  placeholder="YYYY-###"
                  value={form.receiptNo}
                  onChange={(e) => setForm((f) => ({ ...f, receiptNo: e.target.value }))}
                />
              </span>
              <span><strong>{tr('rc.hStudent')}</strong> {stName}</span>
              {stMeta && <span><strong>{tr('rc.hUsername')}</strong> {stMeta.username || '—'}</span>}
              {stMeta && <span><strong>{tr('rc.hInfo')}</strong> {stMeta.notes || '—'}</span>}
              <span>
                <strong>{tr('rc.hTxDate')}</strong>{' '}
                <input
                  type="date"
                  className="form-control receipt-edit-input"
                  style={{ width: 160 }}
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </span>
              <span>
                <strong>{tr('rc.hTxNo')}</strong>{' '}
                <input
                  type="text"
                  className="form-control receipt-edit-input"
                  style={{ width: 160 }}
                  placeholder={tr('rc.none')}
                  value={form.txNo}
                  onChange={(e) => setForm((f) => ({ ...f, txNo: e.target.value }))}
                />
              </span>
              <span style={{ flexBasis: '100%' }}>
                <strong>{tr('rc.hRemarks')}</strong>{' '}
                <input
                  type="text"
                  className="form-control receipt-edit-input"
                  style={{ width: '70%', minWidth: 200 }}
                  placeholder={tr('rc.none')}
                  value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                />
              </span>
            </>
          ) : (
            <>
              <span><strong>{tr('rc.hReceipt')}</strong> {receiptNo || tr('rc.noReceipt')}</span>
              <span><strong>{tr('rc.hStudent')}</strong> {stName}</span>
              {stMeta && <span><strong>{tr('rc.hUsername')}</strong> {stMeta.username || '—'}</span>}
              {stMeta && <span><strong>{tr('rc.hInfo')}</strong> {stMeta.notes || '—'}</span>}
              {dateStr ? <span><strong>{tr('rc.hTxDate')}</strong> {dateStr}</span> : null}
              <span><strong>{tr('rc.hTxNo')}</strong> {transactionNo || tr('rc.noneProvided')}</span>
              <span style={{ flexBasis: '100%' }}><strong>{tr('rc.hRemarks')}</strong> {remarks || tr('rc.noneProvided')}</span>
            </>
          )}
        </div>

        {tableSources.length || summaryItems.length || monthlyItem ? (
          <>
            {tableSources.length ? (
              <div className="receipt-table-scroll" style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      {editing ? <th className="receipt-del-col" aria-label={tr('rc.removeClassOk')}></th> : null}
                      <th>{tr('rc.thNo')}</th>
                      <th>{tr('rc.thType')}</th>
                      <th style={{ minWidth: 220 }}>{tr('rc.thMaterials')}</th>
                      <th>{tr('report.pages')}</th>
                      <th>{tr('tracker.date')}</th>
                      <th>{tr('tracker.time')}</th>
                      <th>{tr('rc.thDuration')}</th>
                      <th>{tr('report.teacher')}</th>
                      <th>{tr('rmod.remarks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageRows === null ? (
                      <tr>
                        <td colSpan={editing ? 10 : 9} style={{ textAlign: 'center', color: 'var(--text3)', padding: 12 }}>
                          {tr('rc.loadingUsage')}
                        </td>
                      </tr>
                    ) : usageRows === 'error' ? (
                      <tr>
                        <td colSpan={editing ? 10 : 9} style={{ textAlign: 'center', color: 'var(--red)' }}>
                          {tr('rc.errLoadingUsage')}
                        </td>
                      </tr>
                    ) : usageRows.length === 0 ? (
                      <tr>
                        <td colSpan={editing ? 10 : 9} style={{ textAlign: 'center', color: 'var(--text3)', padding: 12 }}>
                          {tr('rc.noClasses')}
                        </td>
                      </tr>
                    ) : (
                      usageRows.map((r, i) => (
                        <tr key={i} className={r.cls || ''}>
                          {editing ? (
                            <td className="receipt-del-col">
                              {r.removable ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost receipt-row-del"
                                  title={tr('rc.removeRowTitle')}
                                  onClick={() => removeRow(r.srcTxnId)}
                                >
                                  <i className="fa-solid fa-trash-can"></i>
                                </button>
                              ) : null}
                            </td>
                          ) : null}
                          {r.cells.map((c, j) => (
                            <td key={j} style={c.style}>{c.text}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {summaryItems.length ? (
              <div className="receipt-ded-list">
                {summaryItems.map((it, i) => {
                  const n = Math.abs(it.total_classes || 0);
                  const isIn = (it.total_classes || 0) > 0;
                  return (
                    <div key={i} className={'receipt-ded-line ' + (isIn ? 'credit' : 'debit')}>
                      <span className="receipt-ded-amt">{isIn ? '+' : '-'}{n}{tr('rc.classesUnit')}</span>
                      <span>{sumLineText(it, tr)}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {monthlyItem ? (
              <div
                className="receipt-monthly-banner"
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 6,
                  background: monthlyActive ? 'rgba(5,150,105,0.1)' : 'rgba(148,163,184,0.14)',
                  color: monthlyActive ? '#059669' : 'var(--text2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>
                  <i className="fa-solid fa-infinity"></i> {tr('rc.monthlyUnlimitedFull')} {monthlyActive ? tr('rc.activeParen') : tr('rc.inactiveParen')}
                </div>
                <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3, color: 'var(--text2)' }}>
                  <div>
                    {tr('rc.enrolledLine', { date: monthlyItem.date || '—', txno: monthlyItem.transaction_no || '—', remarks: monthlyItem.notes || '—' })}
                  </div>
                  {(monthlyPayments || []).map((p, i) => (
                    <div key={p.id}>
                      {tr('rc.nthPayment', { ord: ordinal(i + 2), n: i + 2, line: monthlyPaymentLine(p, tr) })}
                    </div>
                  ))}
                  {!monthlyActive ? (
                    <div style={{ color: '#dc2626', fontWeight: 600 }}>
                      {tr('rc.mfCancelledLine', { time: cancelItem ? formatNotifTime(cancelItem.created_at || cancelItem.date).replace(' | ', ' · ') : '—', info: (cancelItem && cancelItem.notes) || '—' })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>{tr('rc.noClassesOnReceipt')}</div>
        )}

        <div className="receipt-remaining-line">
          {tr('rc.remainingClassLabel')}<strong>{monthlyActive ? tr('rc.unlimited') : remainingDisplay}</strong>
        </div>

        {!viewOnly && (
          <div className="card-actions receipt-card-actions">
            <div className="card-actions-left">
              {editing ? (
                <span className="receipt-edit-hint">
                  <i className="fa-solid fa-circle-info"></i> {tr('rc.onlyUnusedRemovable')}
                </span>
              ) : (
                <>
                  <button className="btn btn-sm btn-secondary" type="button" onClick={downloadCard}>
                    <i className="fa-solid fa-camera"></i> {tr('rc.downloadSnapshot')}
                  </button>
                  <button className="btn btn-sm btn-secondary" type="button" onClick={downloadXlsx} disabled={xlsxBusy}>
                    {xlsxBusy ? (
                      <><span className="spinner"></span> {tr('rc.preparing')}</>
                    ) : (
                      <><i className="fa-solid fa-file-excel"></i> {tr('rc.downloadXlsx')}</>
                    )}
                  </button>
                </>
              )}
            </div>
            <div className="card-actions-right">
              {editing ? (
                <>
                  <button className="btn btn-sm btn-secondary" type="button" onClick={() => setEditing(false)} disabled={saving}>
                    {tr('common.cancel')}
                  </button>
                  <button className="btn btn-sm btn-primary" type="button" onClick={saveEdit} disabled={saving}>
                    {saving ? (
                      <><span className="spinner"></span> {tr('common.saving')}</>
                    ) : (
                      <><i className="fa-solid fa-check"></i> {tr('rc.saveChanges')}</>
                    )}
                  </button>
                </>
              ) : (
                <button className="btn btn-sm btn-primary" type="button" onClick={startEdit}>
                  <i className="fa-solid fa-pen"></i> {tr('common.edit')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
