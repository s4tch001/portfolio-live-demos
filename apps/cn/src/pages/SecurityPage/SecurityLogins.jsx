import { useT } from '../../i18n/LanguageProvider.jsx';
import MiniBarChart from '../../components/charts/MiniBarChart.jsx';
import SecurityCard from './SecurityCard.jsx';
import { formatBucketTick } from './securityConstants.js';

// The brute-force panel. Backed by real per-attempt counters — the rate-limit
// table can't tell this story, because its counter stops at the block threshold
// and is wiped on the next successful login.
export default function SecurityLogins({ data }) {
  const t = useT();
  const buckets = data?.buckets || [];
  const lo = data?.logins || { ok: 0, fail: 0, blocked: 0 };
  const labels = buckets.map((b) => formatBucketTick(b.t));
  const series = [
    { key: 'ok', label: t('sec.loginOk'), color: 'var(--green)', values: buckets.map((b) => b.ok) },
    { key: 'fail', label: t('sec.loginFail'), color: 'var(--red)', values: buckets.map((b) => b.fail) },
    { key: 'blocked', label: t('sec.loginBlocked'), color: 'var(--yellow)', values: buckets.map((b) => b.blocked) },
  ];
  const empty = !lo.ok && !lo.fail && !lo.blocked;
  return (
    <SecurityCard
      className="b-half"
      icon="fa-user-lock"
      tone="red"
      title={t('sec.loginsTitle')}
      sub={t('sec.loginsSub')}
    >
      {empty ? (
        <div className="notif-empty">
          {t('sec.empty')}
          <div className="sec-note">{t('sec.emptyHint')}</div>
        </div>
      ) : (
        <>
          <div className="sec-chips">
            <Chip label={t('sec.loginOk')} value={lo.ok} tone="green" />
            <Chip label={t('sec.loginFail')} value={lo.fail} tone="red" />
            <Chip label={t('sec.loginBlocked')} value={lo.blocked} tone="yellow" />
          </div>
          <MiniBarChart
            series={series}
            labels={labels}
            ariaLabel={t('sec.loginsTitle')}
            emptyLabel={t('sec.empty')}
          />
        </>
      )}
    </SecurityCard>
  );
}

function Chip({ label, value, tone }) {
  return (
    <div className={'sec-stat-chip tone-' + tone}>
      <span className="sec-stat-chip-value">{value}</span>
      <span className="sec-stat-chip-label">{label}</span>
    </div>
  );
}
