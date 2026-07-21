export default function AttendanceModal({ children, onClose, mode }) {
  return (
    <div className="modalOverlay" role="presentation" onMouseDown={onClose}>
      <section
        className={`modalPanel ${mode === 'viewer' ? 'modalWide' : 'modalNarrow'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Attendance details"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modalClose" onClick={onClose} aria-label="Close attendance window">
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
        {children}
      </section>
    </div>
  );
}
