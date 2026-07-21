import { useState } from 'react';

// Stacked area chart for a count-over-time series. Areas (not bars) because the
// job here is a trend — the eye should follow a volume envelope, not read
// discrete columns. Hand-rolled SVG: the project ships three npm deps on purpose
// (no CDN reaches China), so a charting library isn't an option.
//
// One axis only. Series are stacked bottom→top, so 4xx/5xx sit ON TOP of the
// served-request band and share the same count scale — never a second y-axis.
//
// Responsive + theme-aware for free: fixed viewBox + width:100% scales with no
// JS measuring; every colour is a CSS var, so light/dark resolves at paint.

const W = 600;
const H = 150;

export default function MiniAreaChart({
  series,
  labels,
  ariaLabel,
  emptyLabel,
  gradientId,
}) {
  const [hover, setHover] = useState(null); // { i, x }
  const n = labels.length;
  const totals = labels.map((_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] || 0), 0),
  );
  const max = Math.max(1, ...totals);

  if (!n || totals.every((v) => v === 0)) {
    return <div className="notif-empty">{emptyLabel}</div>;
  }

  // x for a bucket centre; a single bucket sits in the middle.
  const xAt = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const yAt = (v) => H - (v / max) * (H - 6);

  // Build each band's polygon: its own top line, then back along the running
  // baseline underneath it.
  const bands = [];
  const baseline = new Array(n).fill(0);
  for (const s of series) {
    const top = labels.map((_, i) => baseline[i] + (s.values[i] || 0));
    const topPts = top.map((v, i) => `${xAt(i)},${yAt(v)}`);
    const basePts = baseline
      .map((v, i) => `${xAt(i)},${yAt(v)}`)
      .reverse();
    bands.push({
      key: s.key,
      color: s.color,
      // The bottom band gets the gradient; upper bands are flat so the
      // composition stays legible instead of turning into muddy overlaps.
      fill: s.gradient ? `url(#${gradientId})` : s.color,
      opacity: s.gradient ? 1 : 0.9,
      line: topPts.join(' '),
      poly: [...topPts, ...basePts].join(' '),
    });
    for (let i = 0; i < n; i++) baseline[i] = top[i];
  }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    setHover({ i, x: (xAt(i) / W) * 100 });
  };

  return (
    <div className="chart-wrap">
      <div
        className="chart-plot"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="chart-svg chart-svg-area"
          role="img"
          aria-label={ariaLabel}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0"
              x2={W}
              y1={H - g * (H - 6)}
              y2={H - g * (H - 6)}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {bands.map((b) => (
            <g key={b.key}>
              <polygon points={b.poly} fill={b.fill} fillOpacity={b.opacity} />
              <polyline
                points={b.line}
                fill="none"
                stroke={b.color}
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
        {hover && (
          <span
            className="chart-crosshair"
            style={{ left: hover.x + '%' }}
            aria-hidden="true"
          />
        )}
        {hover && (
          <div
            className="chart-tip"
            style={{
              left: hover.x + '%',
              transform:
                hover.x > 70
                  ? 'translateX(calc(-100% - 10px))'
                  : 'translateX(10px)',
            }}
          >
            <div className="chart-tip-title">{labels[hover.i]}</div>
            {[...series].reverse().map((s) => (
              <div key={s.key} className="chart-tip-row">
                <span className="sec-dot" style={{ background: s.color }} />
                <span className="chart-tip-label">{s.label}</span>
                <span className="chart-tip-val">{s.values[hover.i] || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="chart-axis">
        {labels.map((l, i) => (
          <span key={i} className="chart-axis-tick">
            {i % Math.ceil(n / 8) === 0 ? l : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
