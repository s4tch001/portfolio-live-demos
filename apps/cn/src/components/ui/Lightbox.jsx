import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Fullscreen image viewer (legacy openLightbox). Click backdrop, the ✕ button,
// or Esc to close; Download saves the image (same-origin /files/ URLs).
export default function Lightbox({ src, onClose }) {
  const t = useT();
  useEffect(() => {
    if (!src) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;
  const root = document.getElementById('modal-root') || document.body;
  return createPortal(
    <div
      className="lightbox open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <img className="lightbox-img" src={src} alt="" style={{ transform: 'scale(1)' }} />
      <div className="lightbox-controls">
        <a
          className="lightbox-btn lightbox-download"
          href={src}
          download={'image_' + Date.now() + '.jpg'}
          onClick={(e) => e.stopPropagation()}
        >
          <i className="fa-solid fa-download" aria-hidden="true"></i> {t('common.download')}
        </a>
      </div>
    </div>,
    root,
  );
}
