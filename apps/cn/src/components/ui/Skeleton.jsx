// Lightweight shimmer skeletons shown while a tab's first data load is in flight.
// Theme-aware via the existing CSS vars (see .skeleton* rules in styles.css).

// Base shimmer block.
export function Skeleton({ w = '100%', h = 12, radius = 6, style, className = '' }) {
  return (
    <span
      className={'skeleton ' + className}
      style={{ display: 'block', width: w, height: h, borderRadius: radius, ...style }}
    />
  );
}

// <tr> rows for dropping into an existing <tbody> (Accounts / Students tables).
export function SkeletonTableRows({ columns = 4, rows = 6 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={r} className="skeleton-tr">
      {Array.from({ length: columns }).map((_, c) => (
        <td key={c}>
          <Skeleton h={14} w={c === 0 ? '70%' : c === columns - 1 ? 40 : '55%'} />
        </td>
      ))}
    </tr>
  ));
}

// Month calendar grid (Reports admin browse + teacher Schedule calendar).
export function SkeletonCalendar() {
  return (
    <div className="card skeleton-calendar">
      <div className="skeleton-cal-head">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} h={12} w="50%" style={{ margin: '0 auto' }} />
        ))}
      </div>
      <div className="skeleton-cal-grid">
        {Array.from({ length: 42 }).map((_, i) => (
          <Skeleton key={i} h={72} radius={8} />
        ))}
      </div>
    </div>
  );
}

// A stack of big cards (Lesson Tracker teacher cards, admin schedule tables).
export function SkeletonCards({ count = 2, height = 220 }) {
  return (
    <div className="skeleton-cards">
      {Array.from({ length: count }).map((_, i) => (
        <div className="card" key={i}>
          <Skeleton h={26} w="32%" style={{ marginBottom: 16 }} />
          <Skeleton h={height} radius={8} />
        </div>
      ))}
    </div>
  );
}

// A filter card with a couple of control lines (admin schedule / tracker filter card).
export function SkeletonFilterCard() {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <Skeleton h={16} w="22%" style={{ marginBottom: 12 }} />
      <div className="skeleton-row">
        <Skeleton h={30} w={120} radius={8} />
        <Skeleton h={30} w={90} radius={8} />
        <Skeleton h={30} w={160} radius={8} />
      </div>
    </div>
  );
}

// Generic list of cards/rows (Remaining Classes views).
export function SkeletonList({ count = 6, height = 64 }) {
  return (
    <div className="skeleton-cards">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} h={height} radius={10} />
      ))}
    </div>
  );
}
