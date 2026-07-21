import { useT } from '../../i18n/LanguageProvider.jsx';

// Four stat tiles — the page's headline numbers. A stat tile IS a legitimate
// "not a chart": four scalars read faster as big numbers than as any plot.
export default function SecurityKpis({ data }) {
  const t = useT();
  const to = data?.totals || {};
  const s = data?.sessions || {};
  const tiles = [
    {
      key: 'req',
      icon: 'fa-arrow-right-arrow-left',
      tone: 'accent',
      label: t('sec.kpiRequests'),
      value: (to.hits || 0).toLocaleString(),
    },
    {
      key: 'rate',
      icon: 'fa-triangle-exclamation',
      // Only colour it once there's enough traffic for a rate to mean anything —
      // 1 error out of 2 requests is 50% and says nothing.
      tone: to.hits >= 50 && to.err_rate >= 25 ? 'red' : 'muted',
      label: t('sec.kpiErrRate'),
      value: (to.err_rate || 0) + '%',
      foot: t('sec.kpiErrors') + ': ' + (to.errors || 0).toLocaleString(),
    },
    {
      key: 'ms',
      icon: 'fa-gauge-high',
      tone: 'green',
      label: t('sec.kpiAvgMs'),
      value: (to.ms_avg || 0) + ' ms',
    },
    {
      key: 'sess',
      icon: 'fa-users-rectangle',
      tone: 'purple',
      label: t('sec.sessionsTitle'),
      value: (s.active || 0).toLocaleString(),
    },
  ];
  // Fragment (not a wrapper) so each tile is a direct board grid item and lines
  // up on the same columns as the cards below.
  return (
    <>
      {tiles.map((k) => (
        <div key={k.key} className={'card sec-kpi b-kpi tone-' + k.tone}>
          <span className="sec-chip" aria-hidden="true">
            <i className={'fa-solid ' + k.icon}></i>
          </span>
          <div className="sec-kpi-body">
            <div className="sec-kpi-label">{k.label}</div>
            <div className="sec-kpi-value">{k.value}</div>
            {k.foot && <div className="sec-kpi-foot">{k.foot}</div>}
          </div>
        </div>
      ))}
    </>
  );
}
