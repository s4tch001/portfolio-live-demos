import { useEffect } from 'react';
import { Link } from 'react-router';
import { useAuth, defaultRouteFor } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import LanguageSwitcher from '../../components/ui/LanguageSwitcher.jsx';
import Footer from '../../components/Layout/Footer.jsx';

const AUDIENCE = [
  { icon: 'fa-user-shield', key: 'landing.audience.admins' },
  { icon: 'fa-chalkboard-user', key: 'landing.audience.teachers' },
  { icon: 'fa-user-graduate', key: 'landing.audience.students' },
];

const FEATURES = [
  { icon: 'fa-calendar-days', key: 'landing.feature.scheduling' },
  { icon: 'fa-file-lines', key: 'landing.feature.reports' },
  { icon: 'fa-table-list', key: 'landing.feature.tracker' },
  { icon: 'fa-receipt', key: 'landing.feature.remaining' },
];

export default function LandingPage() {
  const { user } = useAuth();
  const t = useT();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className='public-page landing'>
      <header className='public-header landing-header'>
        <div className='public-header-brand'>
          <img
            src='/assets/img/logo/android-chrome-512x512.png'
            alt='Sunset-Speaks logo'
          />
          <span>Sunset-Speaks</span>
        </div>
        <div className='public-header-actions' style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LanguageSwitcher
            className='form-control'
            style={{ width: 'auto', height: 36, padding: '0 30px 0 12px', fontSize: 14 }}
          />
          <Link
            className='btn btn-primary'
            to={user ? defaultRouteFor(user) : '/login'}
            style={{ height: 36, display: 'inline-flex', alignItems: 'center', padding: '0 16px' }}
          >
            {user ? t('landing.openApp') : t('landing.login')}
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className='landing-hero'>
          <div className='landing-hero-bg' aria-hidden='true'>
            <video
              autoPlay
              muted
              loop
              playsInline
              preload='auto'
              fetchPriority='high'
              poster='/assets/video/login-background-poster.webp'
              src='/assets/video/login-background.webm'
            ></video>
          </div>
          <div className='landing-hero-inner'>
            <img
              className='landing-hero-logo'
              src='/assets/img/logo/android-chrome-192x192.png'
              alt=''
            />
            <h1>{t('landing.heroTitle')}</h1>
            <p className='landing-lead'>{t('landing.heroLead')}</p>
            <div className='landing-cta'>
              <Link
                className='btn btn-primary'
                to={user ? defaultRouteFor(user) : '/login'}
              >
                {user ? t('landing.openApp') : t('landing.login')}{' '}
                <i className='fa-solid fa-arrow-right' aria-hidden='true'></i>
              </Link>
              <Link className='btn btn-secondary' to='/privacy'>
                {t('landing.privacy')}
              </Link>
              <Link className='btn btn-secondary' to='/terms'>
                {t('landing.terms')}
              </Link>
            </div>
          </div>
        </section>

        {/* What the app does */}
        <section className='landing-section'>
          <h2>{t('landing.whatTitle')}</h2>
          <div className='landing-grid'>
            {FEATURES.map((f) => (
              <div className='landing-card' key={f.key}>
                <span className='landing-card-icon'>
                  <i className={'fa-solid ' + f.icon} aria-hidden='true'></i>
                </span>
                <h3>{t(f.key + '.title')}</h3>
                <p>{t(f.key + '.body')}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for */}
        <section className='landing-section landing-section-alt'>
          <h2>{t('landing.whoTitle')}</h2>
          <div className='landing-grid landing-grid-3'>
            {AUDIENCE.map((a) => (
              <div className='landing-card' key={a.key}>
                <span className='landing-card-icon'>
                  <i className={'fa-solid ' + a.icon} aria-hidden='true'></i>
                </span>
                <h3>{t(a.key + '.title')}</h3>
                <p>{t(a.key + '.body')}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Data usage */}
        <section className='landing-section'>
          <h2>{t('landing.dataTitle')}</h2>
          <div className='landing-data card'>
            <p>{t('landing.data1')}</p>
            <p>{t('landing.data2')}</p>
            <p>
              {t('landing.data3.pre')}
              <Link to='/privacy'>{t('landing.privacy')}</Link>
              {t('landing.data3.mid')}
              <Link to='/terms'>{t('landing.terms')}</Link>
              {t('landing.data3.post')}
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
