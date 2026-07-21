import { useState, useEffect } from 'react';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Floating, scroll-triggered toolbar (legacy .sticky-toolbar +
// setupToolbarScrollDetection). Appears once `.main` is scrolled past 400px:
// first as a collapsed pill ("… Tools ▾"), which expands into the full control
// row. Scrolling back to the top hides it; the expanded/collapsed choice
// persists (matches the v15 update() logic). `children` is a render prop that
// receives { collapse } so the toolbar's own "Hide" button can re-collapse it.
export default function StickyToolbar({ triggerIcon, triggerLabel, children }) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const main = document.querySelector('.main');
    if (!main) return;
    const onScroll = () => setVisible(main.scrollTop > 400);
    main.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  const goToTop = () => {
    const main = document.querySelector('.main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="sticky-toolbar" style={{ display: 'block' }}>
      {!expanded ? (
        <div className="toolbar-trigger" onClick={() => setExpanded(true)}>
          <i className={'fa-solid ' + triggerIcon}></i> {triggerLabel}{' '}
          <span className="toolbar-trigger-arrow">▾</span>
        </div>
      ) : (
        <div className="toolbar-expanded" style={{ display: 'block' }}>
          {children({ collapse: () => setExpanded(false) })}
        </div>
      )}
      {/* Companion go-to-top button (visible ≤1024px only, via CSS): appears
          whenever the sticky toolbar does, for a quick jump back to the top. */}
      <button type="button" className="sticky-gototop" onClick={goToTop} aria-label={t('common.goToTop')}>
        <i className="fa-solid fa-arrow-up" aria-hidden="true"></i>
      </button>
    </div>
  );
}
