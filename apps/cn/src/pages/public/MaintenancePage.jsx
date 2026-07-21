import { useT } from '../../i18n/LanguageProvider.jsx';

// Full-screen "under maintenance" page. Shown to every non-devpau user while
// maintenance mode is on. Self-contained + responsive; branded sunset look.
export default function MaintenancePage() {
  const t = useT();
  return (
    <div className="maintenance-screen">
      <div className="maintenance-stars" aria-hidden="true"></div>
      <div className="maintenance-card" role="status" aria-live="polite">
        <div className="maintenance-badge">
          <i className="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i>
        </div>
        <h1 className="maintenance-title">{t('maint.title')}</h1>
        <p className="maintenance-text">{t('maint.text')}</p>
        <div className="maintenance-pill">
          <span className="maintenance-dot" aria-hidden="true"></span>
          {t('maint.inProgress')}
        </div>
        <div className="maintenance-foot">
          <img
            className="maintenance-foot-logo"
            src="/assets/img/logo/android-chrome-512x512.png"
            alt="Sunset-Speaks logo"
          />
          {t('maint.team')}
        </div>
      </div>
    </div>
  );
}
