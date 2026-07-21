// A single horizontal bar split into proportional segments — the compact way to
// show "what share of responses were 2xx vs each error class". One row, one
// scale. A 2px surface gap separates segments so adjacent colours never touch,
// and each segment carries a labelled legend row below (identity is never
// colour-alone).
export default function SegmentBar({ items, total, emptyLabel, formatValue }) {
  const sum = items.reduce((n, it) => n + it.value, 0);
  if (!sum) return <div className="notif-empty">{emptyLabel}</div>;
  return (
    <div className="segbar-wrap">
      <div className="segbar" role="img" aria-label="proportion">
        {items.map((it) => (
          <div
            key={it.key}
            className="segbar-seg"
            style={{
              flexGrow: it.value,
              background: it.color,
            }}
            title={it.label + ': ' + it.value}
          />
        ))}
      </div>
      <div className="segbar-legend">
        {items.map((it) => (
          <div key={it.key} className="segbar-legrow">
            <span className="sec-dot" style={{ background: it.color }} />
            <span className="segbar-leglabel">{it.label}</span>
            <span className="segbar-legval">
              {formatValue ? formatValue(it.value) : it.value}
              <span className="segbar-legpct">
                {Math.round((it.value / sum) * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
