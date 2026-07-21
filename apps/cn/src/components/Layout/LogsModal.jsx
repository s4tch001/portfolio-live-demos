import { useState, useEffect, useRef, useCallback } from 'react';
import Modal from '../ui/Modal.jsx';
import { apiFetch, queryPath } from '../../lib/apiClient.js';
import { formatNotifTime } from '../../context/NotificationsProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';

const PAGE_SIZE = 30;

// Parse the stored details JSON ({ status, ok, body }) defensively.
function parseDetails(raw) {
  if (!raw) return { ok: true, body: null };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { ok: true, body: raw };
  }
}

function bodyEntries(body) {
  if (!body || typeof body !== 'object') return [];
  return Object.entries(body).map(([k, v]) => [
    k,
    v === null || v === undefined
      ? '—'
      : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v),
  ]);
}

// Multi-line memo/feedback: preserves the teacher's line breaks, clamped to 6
// lines with a "View more" toggle so the log stays scannable at a glance.
// SECURITY: rendered as a React text node (auto-escaped) — never innerHTML — so
// the report's rich-text content can never inject markup/scripts here.
function MemoValue({ value }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight - el.clientHeight > 2);
  }, [value]);
  return (
    <div className="log-memo">
      <div ref={ref} className={'log-memo-text' + (expanded ? ' expanded' : '')}>
        {value}
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          className="log-memo-toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? t('logs.viewLess') : t('logs.viewMore')}
        </button>
      )}
    </div>
  );
}

// Render the value side of a detail row: clickable link(s), a list of lines, or text.
function FieldValue({ field }) {
  const t = useT();
  if (field.href) {
    return (
      <a href={field.href} target="_blank" rel="noopener noreferrer" className="log-link">
        {field.value || field.href}
      </a>
    );
  }
  if (Array.isArray(field.links) && field.links.length) {
    return (
      <span className="log-link-list">
        {field.links.map((l, i) => (
          <a key={i} href={l.href} target="_blank" rel="noopener noreferrer" className="log-link">
            {l.label || t('logs.open')}
          </a>
        ))}
      </span>
    );
  }
  if (Array.isArray(field.lines) && field.lines.length) {
    return (
      <span className="log-line-list">
        {field.lines.map((line, i) => (
          <span className="log-line" key={i}>{line}</span>
        ))}
      </span>
    );
  }
  if (field.multiline) {
    return <MemoValue value={field.value} />;
  }
  return <span>{field.value}</span>;
}

function LogItem({ log }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const det = parseDetails(log.details);
  // Prefer the structured, human-readable fields; fall back to the raw body.
  const fields = Array.isArray(det.fields) ? det.fields : null;
  const entries = fields ? [] : bodyEntries(det.body);
  const failed = det.ok === false;
  const hasDetails = (fields && fields.length > 0) || entries.length > 0;
  return (
    <div className={'log-item' + (failed ? ' log-failed' : '')}>
      <div className="log-item-head">
        <span className="log-action">{log.action || `${log.method} ${log.path}`}</span>
        {failed && <span className="log-badge log-badge-fail">{t('logs.failed')}</span>}
        <span className="log-time">{formatNotifTime(log.created_at)}</span>
      </div>
      <div className="log-meta">
        <span className="log-actor">{log.actor_name || t('reports.unknown')}</span>
        <span className={'log-role log-role-' + (log.actor_role || 'guest')}>
          {['admin', 'teacher', 'student', 'guest'].includes(log.actor_role)
            ? t('role.' + log.actor_role)
            : log.actor_role || t('role.guest')}
        </span>
        <span className="log-route">
          {log.method} {log.path}
        </span>
      </div>
      {hasDetails && (
        <>
          <button
            type="button"
            className="log-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <i className={'fa-solid ' + (open ? 'fa-chevron-down' : 'fa-chevron-right')} aria-hidden="true"></i>
            {open ? t('logs.hideDetails') : t('logs.showDetails')}
          </button>
          {open && (
            <dl className="log-details">
              {fields
                ? fields.map((f, i) => (
                    <div className="log-detail-row" key={i}>
                      <dt>{f.label}</dt>
                      <dd><FieldValue field={f} /></dd>
                    </div>
                  ))
                : entries.map(([k, v]) => (
                    <div className="log-detail-row" key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

export default function LogsModal({ open, onClose }) {
  const tr = useT();
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const beforeRef = useRef(null); // cursor: id to fetch before
  const searchRef = useRef('');
  const dateRef = useRef('');
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(async (reset) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(
        queryPath('/logs', {
          search: searchRef.current,
          date: dateRef.current,
          before: reset ? '' : beforeRef.current || '',
          limit: PAGE_SIZE,
        }),
      );
      const page = (data && data.logs) || [];
      beforeRef.current = data ? data.nextBefore : null;
      setHasMore(!!(data && data.hasMore));
      setLogs((prev) => (reset ? page : [...prev, ...page]));
    } catch (e) {
      setError(
        (e.message || '').toLowerCase().includes('forbidden')
          ? tr('logs.noPermission')
          : tr('logs.failedLoad', { msg: e.message || '' }),
      );
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [tr]);

  // (Re)load when opened.
  useEffect(() => {
    if (!open) return;
    searchRef.current = '';
    dateRef.current = '';
    setSearch('');
    setDate('');
    beforeRef.current = null;
    setLogs([]);
    setHasMore(false);
    fetchPage(true);
  }, [open, fetchPage]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      searchRef.current = search.trim();
      beforeRef.current = null;
      fetchPage(true);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Date filter — refetch immediately on change.
  useEffect(() => {
    if (!open) return;
    dateRef.current = date;
    beforeRef.current = null;
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Infinite scroll: load the next page when the sentinel enters view.
  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          fetchPage(false);
        }
      },
      { root: el.closest('.logs-scroll'), rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [open, hasMore, fetchPage]);

  return (
    <Modal open={open} onClose={onClose} title={tr('rdev.tblLogs')} maxWidth="760px">
      <div className="modal-body logs-modal-body">
        <div className="logs-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input
            type="text"
            className="form-control"
            placeholder={tr('logs.searchPh')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="logs-search-clear" onClick={() => setSearch('')} aria-label={tr('logs.clearSearch')}>
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          )}
        </div>
        <div className="logs-date-filter">
          <i className="fa-solid fa-calendar-day" aria-hidden="true"></i>
          <input
            type="date"
            className="form-control"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={tr('logs.filterByDate')}
          />
          {date && (
            <button className="logs-search-clear" onClick={() => setDate('')} aria-label={tr('logs.clearDate')}>
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          )}
        </div>

        <div className="logs-scroll">
          {error && <div className="notif-empty">{error}</div>}
          {!error && logs.length === 0 && !loading && (
            <div className="notif-empty">{tr('logs.noLogs')}</div>
          )}
          {logs.map((log) => (
            <LogItem key={log.id} log={log} />
          ))}
          {loading && (
            <div className="logs-loading">
              <span className="spinner"></span> {tr('common.loading')}
            </div>
          )}
          <div ref={sentinelRef} className="logs-sentinel" aria-hidden="true"></div>
        </div>
      </div>
    </Modal>
  );
}
