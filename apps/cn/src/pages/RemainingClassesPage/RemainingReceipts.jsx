import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, queryPath } from '../../lib/apiClient.js';
import { onRealtime } from '../../lib/realtime.js';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useConfirm } from '../../context/ConfirmProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { useReceiptModal } from './ReceiptModalContext.jsx';
import ReceiptDownloadModal from './ReceiptDownloadModal.jsx';

const YEARS = [];
for (let y = 2026; y <= 2099; y++) YEARS.push(y);

const PAGE_SIZE = 30;

// View Receipts: the chosen year's receipts, searchable, loaded a page at a time
// (infinite scroll) so a busy year never pulls every receipt at once — easier on
// D1 rows read. Click opens the receipt card. Faithful port of renderReceiptsTab.
export default function RemainingReceipts() {
  const tr = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [err, setErr] = useState('');
  const [dlOpen, setDlOpen] = useState(false);
  const { openCard } = useReceiptModal();
  // Student lookup (by id) → username + admin note shown beside the student name.
  const { students, ensureStudents } = useData();
  useEffect(() => {
    ensureStudents();
  }, [ensureStudents]);

  const beforeRef = useRef(null); // cursor: receipt_no to fetch before
  const yearRef = useRef(year);
  const searchRef = useRef('');
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);
  const didMountRef = useRef(false);

  const fetchPage = useCallback(async (reset) => {
    if (loadingRef.current) return;
    if (!yearRef.current) {
      setList([]);
      setHasMore(false);
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setErr('');
    try {
      const data = await apiFetch(
        queryPath('/receipts', {
          year: yearRef.current,
          search: searchRef.current,
          before: reset ? '' : beforeRef.current || '',
          limit: PAGE_SIZE,
        }),
      );
      const page = (data && data.receipts) || [];
      beforeRef.current = data ? data.nextBefore : null;
      setHasMore(!!(data && data.hasMore));
      setList((prev) => (reset ? page : [...prev, ...page]));
    } catch (e) {
      setErr(e.message || '');
      setHasMore(false);
      if (reset) setList([]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // (Re)load when the year changes.
  useEffect(() => {
    yearRef.current = year;
    beforeRef.current = null;
    fetchPage(true);
  }, [year, fetchPage]);

  // Debounced search. Skipped on first mount — the year effect already did the
  // initial load, so we avoid a duplicate fetch.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return undefined;
    }
    const t = setTimeout(() => {
      searchRef.current = search.trim();
      beforeRef.current = null;
      fetchPage(true);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Live: a receipt/transaction changed elsewhere → reload from the first page.
  useEffect(
    () =>
      onRealtime('sync', (msg) => {
        if (msg && msg.resource === 'transactions') {
          beforeRef.current = null;
          fetchPage(true);
        }
      }),
    [fetchPage],
  );

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          fetchPage(false);
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, fetchPage]);

  // Delete a whole receipt group (all transactions + usage under that receipt_no
  // for the student). Same logic as the receipt-list modal's delete, with a
  // confirmation dialog. Reloads the list from the first page on success.
  const deleteReceipt = async (r) => {
    const sid = r.student_id || 0;
    const ok = await confirm({
      title: tr('rc.deleteReceiptTitle'),
      lines: [{ label: tr('rmod.receiptNo'), value: r.receipt_no || tr('rc.noReceipt') }],
      message: tr('rc.deleteReceiptMsg'),
      okText: tr('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      const all = await apiFetch('/class-transactions?student_id=' + sid);
      const key = (r.receipt_no || '').trim();
      const targets = Array.isArray(all) ? all.filter((t) => (t.receipt_no || '').trim() === key) : [];
      for (const t of targets) {
        await apiFetch('/class-transactions/' + t.id, 'DELETE');
      }
      toast(tr('rc.receiptDeleted'));
      beforeRef.current = null;
      fetchPage(true);
    } catch (e) {
      toast(tr('rmod.error', { msg: e.message || String(e) }));
    }
  };

  return (
    <div className="tab-pane active" id="tab-remaining-receipts">
      <div className="filter-bar">
        <label style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)', marginRight: 8 }}>
          {tr('rem.selectYear')}
        </label>
        <select
          className="form-control"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ maxWidth: 160 }}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <input
          type="search"
          className="form-control"
          placeholder={tr('rrec.searchPh')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginLeft: 'auto' }}
          onClick={() => setDlOpen(true)}
          disabled={!year}
        >
          <i className="fa-solid fa-file-excel"></i> {tr('rrec.downloadReceipts')}
        </button>
      </div>
      <ReceiptDownloadModal
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        year={year}
        search={search}
      />
      <div className="remaining-view-grid" id="receipts-body">
        {!year ? (
          <div className="notif-empty">{tr('rrec.selectYearPrompt')}</div>
        ) : err ? (
          <div className="notif-empty">{tr('rem.failedToLoad', { msg: err })}</div>
        ) : loading && !list.length ? (
          <div className="notif-empty">{tr('common.loading')}</div>
        ) : !list.length ? (
          <div className="notif-empty">{tr('rrec.noReceipts')}</div>
        ) : (
          list.map((r) => {
            const monthly = !!r.has_monthly;
            const rem = monthly ? '∞' : r.remaining || 0;
            const cls = monthly ? 'bal-monthly' : r.remaining > 0 ? 'bal-ok' : 'bal-empty';
            const sMeta = r.student_id ? students.find((x) => x.id == r.student_id) : null;
            return (
              <div
                role="button"
                tabIndex={0}
                key={r.receipt_no + '|' + (r.student_id || 0)}
                className={'remaining-balance-card ' + cls}
                onClick={() => openCard(r.receipt_no, r.student_id || 0, r.student_name || '')}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    openCard(r.receipt_no, r.student_id || 0, r.student_name || '');
                  }
                }}
              >
                <span className="rbc-avatar"><i className="fa-solid fa-receipt"></i></span>
                {/* Stacked: receipt no, student name, username, info, then badge. */}
                <span className="rbc-main">
                  <span className="rbc-name">{r.receipt_no}</span>
                  {r.student_name ? <span className="rbc-sub">{r.student_name}</span> : null}
                  {sMeta ? <span className="rbc-sub">{sMeta.username || '—'}</span> : null}
                  {sMeta && sMeta.notes ? <span className="rbc-sub rbc-info">{sMeta.notes}</span> : null}
                  <span className="rbc-badges">
                    {monthly ? (
                      <span className="bal-badge badge-monthly">{tr('rview.monthlyFee')}</span>
                    ) : r.remaining > 0 ? (
                      <span className="bal-badge badge-ok">{tr('rview.active')}</span>
                    ) : (
                      <span className="bal-badge badge-empty">{tr('rrec.usedUp')}</span>
                    )}
                  </span>
                </span>
                <span className="rbc-count">
                  {String(rem)}
                  <small>{monthly ? tr('rrec.unlimitedSmall') : tr('rrec.left')}</small>
                </span>
                <button
                  type="button"
                  className="rbc-delete-btn"
                  title={tr('rc.deleteReceipt')}
                  aria-label={tr('rc.deleteReceipt')}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    deleteReceipt(r);
                  }}
                >
                  <i className="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
              </div>
            );
          })
        )}
        {loading && list.length > 0 && (
          <div className="notif-empty" style={{ gridColumn: '1 / -1' }}>
            <span className="spinner"></span> {tr('common.loading')}
          </div>
        )}
        <div ref={sentinelRef} aria-hidden="true" style={{ gridColumn: '1 / -1', height: 1 }}></div>
      </div>
    </div>
  );
}
