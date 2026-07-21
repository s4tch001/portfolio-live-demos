// Horizontal bar list — for ranked categories (endpoints, status codes) where a
// label has to stay readable. Plain divs rather than SVG: the bar is just a
// width, and HTML text wraps and scales properly on a phone.
export default function BarList({ items, emptyLabel, formatValue }) {
  if (!items.length) return <div className="notif-empty">{emptyLabel}</div>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="barlist">
      {items.map((it) => (
        <div key={it.key} className="barlist-row">
          <div className="barlist-head">
            <span className="barlist-label" title={it.label}>
              {it.label}
            </span>
            <span className="barlist-value">
              {formatValue ? formatValue(it.value) : it.value}
            </span>
          </div>
          <div className="barlist-track">
            <div
              className="barlist-fill"
              style={{
                width: Math.max(2, (it.value / max) * 100) + '%',
                background: it.color || 'var(--accent)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
