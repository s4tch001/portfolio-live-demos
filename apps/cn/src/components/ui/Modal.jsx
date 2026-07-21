import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Generic modal that reuses the legacy .modal-overlay / .modal markup + classes
// so the existing stylesheet renders it identically. Portaled into #modal-root.
export default function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
  maxWidth,
  closeOnOverlay = true,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const root = document.getElementById('modal-root') || document.body;

  return createPortal(
    <div
      className="modal-overlay open"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        className={'modal ' + className}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {title != null && (
          <div className="modal-header">
            <div className="modal-title">{title}</div>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    root,
  );
}
