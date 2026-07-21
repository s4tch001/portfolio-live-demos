import { useT } from '../../i18n/LanguageProvider.jsx';
import MiniAreaChart from '../../components/charts/MiniAreaChart.jsx';
import SecurityCard from './SecurityCard.jsx';
import { formatBucketTick } from './securityConstants.js';

export default function SecurityTraffic({ data }) {
  const t = useT();
  const buckets = data?.buckets || [];
  const labels = buckets.map((b) => formatBucketTick(b.t));
  // Stacked bottom→top: served requests, then 4xx, then 5xx — all on one count
  // scale, so a spike shows both its size and whether it was served or refused.
  const series = [
    {
      key: 'ok',
      label: t('sec.kpiRequests'),
      color: 'var(--accent)',
      gradient: true,
      values: buckets.map((b) => Math.max(0, b.hits - b.err4 - b.err5)),
    },
    { key: 'err4', label: '4xx', color: 'var(--orange)', values: buckets.map((b) => b.err4) },
    { key: 'err5', label: '5xx', color: 'var(--red)', values: buckets.map((b) => b.err5) },
  ];
  return (
    <SecurityCard
      className="b-half"
      icon="fa-chart-area"
      tone="accent"
      title={t('sec.trafficTitle')}
      sub={t('sec.trafficSub')}
      legend={[
        { color: 'var(--accent)', label: t('sec.kpiRequests') },
        { color: 'var(--orange)', label: '4xx' },
        { color: 'var(--red)', label: '5xx' },
      ]}
      note={t('sec.approxNote')}
    >
      <MiniAreaChart
        series={series}
        labels={labels}
        gradientId="sec-traffic-grad"
        ariaLabel={t('sec.trafficTitle')}
        emptyLabel={t('sec.empty')}
      />
    </SecurityCard>
  );
}
