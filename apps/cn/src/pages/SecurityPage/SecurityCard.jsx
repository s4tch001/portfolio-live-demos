// Shared shell for every security panel: an icon chip + title/subtitle header, an
// optional legend row, the body, and an optional footnote. Keeps all seven cards
// visually identical so the page reads as one system rather than seven widgets.
export default function SecurityCard({
  icon,
  tone = 'accent',
  title,
  sub,
  action,
  legend,
  note,
  className = '',
  children,
}) {
  return (
    <div className={'card sec-card' + (className ? ' ' + className : '')}>
      <div className="sec-card-head">
        <div className="sec-card-heading">
          {icon && (
            <span className={'sec-chip tone-' + tone} aria-hidden="true">
              <i className={'fa-solid ' + icon}></i>
            </span>
          )}
          <div>
            <div className="sec-card-title">{title}</div>
            {sub && <div className="sec-card-sub">{sub}</div>}
          </div>
        </div>
        {action}
      </div>
      {legend && (
        <div className="sec-legend">
          {legend.map((l) => (
            <span key={l.label} className="sec-legend-item">
              <span className="sec-dot" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      <div className="sec-card-body">{children}</div>
      {note && <div className="sec-note">{note}</div>}
    </div>
  );
}
