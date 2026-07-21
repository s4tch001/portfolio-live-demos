import { useState } from 'react';

// Stacked bar chart for counts of discrete events (login outcomes per bucket).
// Bars, not an area, because each bucket is a countable tally, not a continuous
// flow. Hand-rolled SVG (no chart lib — no CDN reaches China).
//
// One axis: segments stack on a shared count scale. Rounded top on the topmost
// segment, a 2px surface gap between stacked segments so the composition reads
// even where two colours are close in value.

const W = 600;
const H = 150;
const GAP = 2; // surface gap between stacked segments (viewBox units)
const RADIUS = 3;

export default function MiniBarChart({ series, labels, ariaLabel, emptyLabel }) {
  const [hover, setHover] = useState(null);
  const n = labels.length;
  const totals = labels.map((_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] || 0), 0),
  );
  const max = Math.max(1, ...totals);

  if (!n || totals.every((v) => v === 0)) {
    return <div className="notif-empty">{emptyLabel}</div>;
  }

  const slot = W / n;
  const barW = Math.max(2, Math.min(slot * 0.62, 26));
  const scale = (v) => (v / max) * (H - 4);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(n - 1, Math.floor(rel * n)));
    setHover({ i, x: ((i + 0.5) / n) * 100 });
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
          className="chart-svg"
          role="img"
          aria-label={ariaLabel}
        >
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0"
              x2={W}
              y1={H - g * (H - 4)}
              y2={H - g * (H - 4)}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {labels.map((_, i) => {
            let y = H;
            const nonZero = series.filter((s) => (s.values[i] || 0) > 0);
            const topMost = nonZero[nonZero.length - 1];
            return (
              <g key={i}>
                {series.map((s) => {
                  const v = s.values[i] || 0;
                  if (!v) return null;
                  const h = scale(v);
                  y -= h;
                  return (
                    <rect
                      key={s.key}
                      x={i * slot + (slot - barW) / 2}
                      y={y}
                      width={barW}
                      height={Math.max(0.5, h - GAP)}
                      rx={s === topMost ? RADIUS : 0}
                      fill={s.color}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
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
