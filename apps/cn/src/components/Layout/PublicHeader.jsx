import { Link } from 'react-router';
import { useAuth, defaultRouteFor } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import LanguageSwitcher from '../ui/LanguageSwitcher.jsx';

// Slim top bar for the public pages (landing / privacy / terms). Theme-aware.
export default function PublicHeader() {
  const { user } = useAuth();
  const t = useT();
  return (
    <header className="public-header">
      <Link to="/" className="public-header-brand">
        <img src="/assets/img/logo/android-chrome-512x512.png" alt="Sunset-Speaks logo" />
        <span>Sunset-Speaks</span>
      </Link>
      <div className="public-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LanguageSwitcher
          className="form-control"
          style={{ width: 'auto', height: 36, padding: '0 30px 0 12px', fontSize: 14 }}
        />
        <Link
          className="btn btn-primary"
          to={user ? defaultRouteFor(user) : '/login'}
          style={{ height: 36, display: 'inline-flex', alignItems: 'center', padding: '0 16px' }}
        >
          {user ? t('landing.openApp') : t('landing.login')}
        </Link>
      </div>
    </header>
  );
}
