import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { formatNotifTime } from '../../lib/format.js';
import SegmentBar from '../../components/charts/SegmentBar.jsx';
import BarList from '../../components/charts/BarList.jsx';
import { STATUS_META, ROLE_LABEL_KEYS, ROLE_ICON } from './securityConstants.js';

// One card, four subsections: response status, busiest endpoints, busiest
// addresses, active sessions. They read as a single "what's happening right now"
// module rather than four disconnected tiles. Internal 2×2 grid on desktop,
// stacked on mobile, hairline dividers between cells.
export default function SecurityActivity({ data, range }) {
  const t = useT();

  // ── Response status ──
  const st = data?.statuses || {};
  const statusItems = STATUS_META.filter((m) => st[m.key]).map((m) => ({
    key: m.key,
    label: m.key,
    value: st[m.key],
    color: m.color,
  }));

  // ── Busiest endpoints (top 7 keeps the cell compact) ──
  const routeItems = (data?.routes || []).slice(0, 7).map((r) => ({
    key: r.route,
    label: r.route === 'other' ? t('sec.routeOther') : r.route,
    value: r.hits,
    color: r.route === 'other' ? 'var(--text3)' : 'var(--accent)',
  }));

  // ── Active sessions ──
  const s = data?.sessions || { active: 0, by_role: {} };
  const roles = Object.entries(s.by_role || {}).filter(([, n]) => n > 0);

  // ── Busiest addresses (own fetch — personal data, shorter retention) ──
  const toast = useToast();
  const [ips, setIps] = useState(null);
  const [ipErr, setIpErr] = useState(null);
  const [shown, setShown] = useState({});
  const [revealing, setRevealing] = useState('');
  const requestRef = useRef(0);

  const loadIps = useCallback(async () => {
    const request = ++requestRef.current;
    setIps(null);
    setIpErr(null);
    setShown({});
    try {
      const res = await apiFetch('/dev/security/ips?range=' + range);
      if (request === requestRef.current) setIps(res.ips || []);
    } catch (e) {
      if (request === requestRef.current) setIpErr(e);
    }
  }, [range]);

  useEffect(() => {
    loadIps();
    return () => {
      requestRef.current += 1;
    };
  }, [loadIps]);

  const reveal = async (row) => {
    setRevealing(row.id);
    try {
      const res = await apiFetch('/dev/security/reveal-ip', 'POST', { id: row.id });
      setShown((m) => ({ ...m, [row.id]: res.ip }));
    } catch (e) {
      toast(t('sec.revealErr', { msg: e.message || String(e) }));
    } finally {
      setRevealing('');
    }
  };

  return (
    <div className="card sec-activity b-full">
      <div className="sec-activity-grid">
        {/* Response status */}
        <section className="sec-sub">
          <SubHead icon="fa-gauge-high" tone="green" title={t('sec.statusTitle')} />
          <SegmentBar
            items={statusItems}
            emptyLabel={t('sec.empty')}
            formatValue={(v) => v.toLocaleString()}
          />
          <div className="sec-sub-note">{t('sec.statusSub')}</div>
        </section>

        {/* Active sessions */}
        <section className="sec-sub">
          <SubHead icon="fa-users-rectangle" tone="purple" title={t('sec.sessionsTitle')} />
          <div className="sec-sess">
            <span className="sec-sess-num">{s.active}</span>
            {roles.length ? (
              <div className="sec-sess-roles">
                {roles.map(([role, n]) => (
                  <span key={role} className="sec-sess-chip">
                    <i
                      className={'fa-solid ' + (ROLE_ICON[role] || 'fa-user')}
                      aria-hidden="true"
                    ></i>
                    {ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : role}
                    <b>{n}</b>
                  </span>
                ))}
              </div>
            ) : (
              <span className="sec-sub-muted">{t('sec.empty')}</span>
            )}
          </div>
          <div className="sec-sub-note">{t('sec.sessionsSub')}</div>
        </section>

        {/* Busiest endpoints */}
        <section className="sec-sub">
          <SubHead icon="fa-diagram-project" tone="accent" title={t('sec.routesTitle')} />
          <BarList
            items={routeItems}
            emptyLabel={t('sec.empty')}
            formatValue={(v) => v.toLocaleString()}
          />
        </section>

        {/* Busiest addresses */}
        <section className="sec-sub">
          <SubHead icon="fa-network-wired" tone="orange" title={t('sec.ipsTitle')} />
          {ipErr ? (
            <div className="sec-sub-muted">
              {t('sec.loadErr', { msg: ipErr.message || String(ipErr) })}
            </div>
          ) : !ips ? (
            <div className="sec-sub-muted">…</div>
          ) : !ips.length ? (
            <div className="sec-sub-muted">{t('sec.empty')}</div>
          ) : (
            <div className="table-wrap">
              <table className="sec-table">
                <thead>
                  <tr>
                    <th>{t('sec.thAddress')}</th>
                    <th className="sec-num">{t('sec.thRequests')}</th>
                    <th className="sec-num">{t('sec.thFailedLogins')}</th>
                    <th>{t('sec.thLastSeen')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ips.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <code className="sec-ip">{shown[r.id] || r.ip_masked}</code>
                        {!shown[r.id] && (
                          <button
                            type="button"
                            className="sec-reveal"
                            onClick={() => reveal(r)}
                            disabled={revealing === r.id}
                            aria-label={t('sec.reveal') + ' ' + r.ip_masked}
                          >
                            <i className="fa-solid fa-eye" aria-hidden="true"></i>{' '}
                            {revealing === r.id ? '...' : t('sec.reveal')}
                          </button>
                        )}
                      </td>
                      <td className="sec-num">{r.hits.toLocaleString()}</td>
                      <td className="sec-num">
                        {r.fails ? (
                          <span className="badge badge-red">{r.fails}</span>
                        ) : (
                          <span className="sec-zero">0</span>
                        )}
                      </td>
                      <td className="sec-lastseen">{formatLastSeen(r.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="sec-sub-note">{t('sec.ipsSub')}</div>
        </section>
      </div>
    </div>
  );
}

function formatLastSeen(value) {
  if (!value) return '--';
  const text = String(value).trim();
  // Traffic data is stored as an hourly UTC bucket (e.g. "2026-07-20T07"),
  // which is not a complete ISO timestamp. Complete it before formatting so it
  // renders in the viewer's local timezone instead of showing the raw bucket.
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(text) ? `${text}:00:00Z` : text;
  return formatNotifTime(timestamp) || text;
}

function SubHead({ icon, tone, title }) {
  return (
    <div className={'sec-sub-head tone-' + tone}>
      <span className="sec-sub-chip" aria-hidden="true">
        <i className={'fa-solid ' + icon}></i>
      </span>
      <span className="sec-sub-title">{title}</span>
    </div>
  );
}
