import { Link } from 'react-router';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Site footer shown on every main (mobile-nav) page. Theme-aware via CSS vars.
// Brand name + support email stay verbatim; the rest follows the UI language.
export default function Footer() {
  const t = useT();
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <img
            className="site-footer-logo"
            src="/assets/img/logo/android-chrome-512x512.png"
            alt="Sunset-Speaks logo"
          />
          <div>
            <div className="site-footer-name">Sunset-Speaks</div>
            <div className="site-footer-tag">{t('footer.tag')}</div>
          </div>
        </div>

        <nav className="site-footer-links" aria-label="Legal">
          <Link to="/privacy">{t('landing.privacy')}</Link>
          <span className="site-footer-dot" aria-hidden="true">·</span>
          <Link to="/terms">{t('landing.terms')}</Link>
        </nav>

        <div className="site-footer-contact">
          <a href="mailto:sample@example.com">
            <i className="fa-solid fa-envelope" aria-hidden="true"></i> sample@example.com
          </a>
        </div>

        <div className="site-footer-copy">© {year} Sunset-Speaks. {t('footer.rights')}</div>
      </div>
    </footer>
  );
}
