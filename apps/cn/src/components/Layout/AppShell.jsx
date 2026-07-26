import { useState } from 'react';
import { Outlet } from 'react-router';
import MobileNav from './MobileNav.jsx';
import HamburgerMenu from './HamburgerMenu.jsx';

// Authenticated app frame: mobile-nav (top bar with tabs + notifications) +
// hamburger menu, and the routed page renders into .main via <Outlet/>.
// The legacy desktop topbar + sidebar were dropped — they were hidden at every
// width (CSS display:none) and fully superseded by mobile-nav + hamburger.
export default function AppShell() {
  const [hamOpen, setHamOpen] = useState(false);
  return (
    <div
      id="app"
      className="app"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <MobileNav onHamburger={() => setHamOpen((o) => !o)} />
      <HamburgerMenu open={hamOpen} onClose={() => setHamOpen(false)} />
      <div className="body-wrap">
        <div className="main">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
