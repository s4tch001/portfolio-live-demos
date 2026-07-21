import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { SECURITY_RANGES } from './securityConstants.js';
import SecurityKpis from './SecurityKpis.jsx';
import SecurityTraffic from './SecurityTraffic.jsx';
import SecurityLogins from './SecurityLogins.jsx';
import SecurityActivity from './SecurityActivity.jsx';
import SecurityBlocked from './SecurityBlocked.jsx';

const POLL_MS = 60000;

// Security dashboard (master admin only). One fetch drives every panel — the box
// is a single vCPU, so this is one indexed range scan per refresh rather than a
// query per card. The route guard is UX; /dev/security/* does the real gating.
export default function SecurityPage() {
  const t = useT();
  const [range, setRange] = useState('24h');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const load = useCallback(async (r, quiet) => {
    setRefreshing(true);
    if (!quiet) setLoading(true);
    try {
      const res = await apiFetch('/dev/security/overview?range=' + r);
      // A slow response for an abandoned range must not overwrite the new one.
      if (rangeRef.current === r) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (rangeRef.current === r) setError(e);
    } finally {
      if (rangeRef.current === r) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  // Poll so blocks and attempts surface without a manual refresh. Paused when the
  // tab is hidden — a background tab polling all night is pure waste, and the
  // server counts every request it serves.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(rangeRef.current, true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <section className="page active" id="page-security">
        <Header
          t={t}
          range={range}
          setRange={setRange}
          onRefresh={() => load(range)}
          refreshing={refreshing}
        />
        <SecuritySkeleton />
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="page active" id="page-security">
        <Header t={t} range={range} setRange={setRange} onRefresh={() => load(range)} />
        <div className="card">
          <div className="notif-empty">
            {error.status === 403
              ? t('sec.forbidden')
              : t('sec.loadErr', { msg: error.message || String(error) })}
          </div>
          {error.status !== 403 && (
            <div style={{ textAlign: 'center' }}>
              <button className="btn btn-primary" onClick={() => load(range)}>
                {t('sec.retry')}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="page active" id="page-security">
      <Header
        t={t}
        range={range}
        setRange={setRange}
        onRefresh={() => load(range)}
        generatedAt={data?.generated_at}
        refreshing={refreshing}
      />
      {error && (
        <div className="sec-stale-notice" role="status">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
          {t('sec.loadErr', { msg: error.message || String(error) })}
        </div>
      )}
      {/* One 12-column board so KPIs, the two half-width charts, and the full-
          width panels all align to the same column edges and gutters. */}
      <div className="sec-board">
        <SecurityKpis data={data} />
        <SecurityTraffic data={data} />
        <SecurityLogins data={data} />
        <SecurityActivity data={data} range={data?.range || range} />
        <SecurityBlocked />
      </div>
    </section>
  );
}

function Header({ t, range, setRange, onRefresh, generatedAt, refreshing }) {
  return (
    <div className="sec-header">
      <div className="sec-header-title">
        <span className="sec-header-icon" aria-hidden="true">
          <i className="fa-solid fa-shield-halved"></i>
        </span>
        <div>
          <div className="page-title">{t('sec.title')}</div>
          <div className="page-sub">{t('sec.subtitle')}</div>
        </div>
      </div>
      <div className="sec-toolbar">
        <div className="sec-range" role="tablist">
          {SECURITY_RANGES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={range === r.id}
              className={'sec-range-btn' + (range === r.id ? ' active' : '')}
              onClick={() => setRange(r.id)}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>
        {generatedAt && (
          <span className="sec-updated" aria-live="polite">
            <span className="sec-live-dot" aria-hidden="true" />
            {t('sec.updated', {
              time: new Date(generatedAt).toLocaleTimeString(),
            })}
          </span>
        )}
        <button
          className="btn btn-secondary btn-sm sec-refresh"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <i className={'fa-solid fa-rotate' + (refreshing ? ' fa-spin' : '')} aria-hidden="true"></i>{' '}
          {t('sec.refresh')}
        </button>
      </div>
    </div>
  );
}

function SecuritySkeleton() {
  return (
    <div className="sec-board sec-skeleton" aria-label="Loading security dashboard">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="card b-kpi sec-skeleton-kpi">
          <Skeleton h={38} w={38} radius={8} />
          <div>
            <Skeleton h={11} w={92} />
            <Skeleton h={26} w={76} style={{ marginTop: 8 }} />
          </div>
        </div>
      ))}
      <div className="card b-half sec-skeleton-chart"><Skeleton h={198} /></div>
      <div className="card b-half sec-skeleton-chart"><Skeleton h={198} /></div>
      <div className="card b-full sec-skeleton-activity"><Skeleton h={250} /></div>
      <div className="card b-full sec-skeleton-activity"><Skeleton h={160} /></div>
    </div>
  );
}
