import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { visibleNavItems } from './navConfig.js';
import NotifBell from './NotifBell.jsx';

// Bottom/top mobile tab bar — each tab is its own route (NavLink), so a refresh
// stays on the current page. Matches legacy buildMobileNav classes.
export default function MobileNav({ onHamburger }) {
  const { user, isAdmin, myPerm, isMasterAdmin } = useAuth();
  const t = useT();
  const items = visibleNavItems(user, myPerm, isMasterAdmin);
  return (
    <div className="mobile-nav" id="mobile-nav">
      {/* hamburger (left) · tabs (center) · notif bell (right) */}
      <button className="mobile-hamburger-btn" onClick={onHamburger} aria-label={t('nav.menu')}>
        <i className="fa-solid fa-bars" aria-hidden="true"></i>
      </button>
      <div className={'mobile-nav-tabs' + (isAdmin ? ' is-admin' : '')}>
        {items.map((it) => (
          <NavLink
            key={it.id}
            to={it.path}
            className={({ isActive }) =>
              'mobile-nav-tab' + (isActive ? ' active' : '')
            }
          >
            <span className="nav-icon">
              <i className={'fa-solid ' + it.icon} aria-hidden="true"></i>
            </span>
            <span className="mobile-nav-label">{t(it.mobileKey)}</span>
          </NavLink>
        ))}
      </div>
      <NotifBell />
    </div>
  );
}
