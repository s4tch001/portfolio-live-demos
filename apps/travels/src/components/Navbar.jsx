import { useState } from 'react';
import logo from '../images/logo.svg';
import { pageLinks, navIcons } from '../data';

const Navbar = () => {
  const [showLinks, setShowLinks] = useState(false);

  return (
    <>
      <nav className='navbar'>
        <div className='nav-center'>
          <div className='nav-header'>
            <a href='#home' aria-label='P Travels home'>
              <img src={logo} className='nav-logo' alt='P' />
            </a>
            <button
              type='button'
              className='nav-toggle'
              aria-label='Toggle navigation menu'
              aria-expanded={showLinks}
              onClick={() => setShowLinks(!showLinks)}
            >
              <span aria-hidden='true'>{showLinks ? '×' : '☰'}</span>
            </button>
          </div>

          {/* Desktop only: links at icons side by side */}
          <ul className='nav-links nav-links-desktop'>
            {pageLinks.map(({ id, href, text }) => (
              <li key={id}>
                <a href={href} className='nav-link'>
                  {text}
                </a>
              </li>
            ))}
          </ul>

          <ul className='nav-icons'>
            {navIcons.map(({ id, href, icon }) => (
              <li key={id}>
                <a
                  href={href}
                  target='_blank'
                  rel='noreferrer'
                  className='nav-icon'
                  aria-label={`Open ${icon.replace('fab fa-', '')}`}
                >
                  <i className={icon}></i>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile dropdown: nasa labas ng navbar para mapush ang content */}
      <div className={`nav-dropdown ${showLinks ? 'show-dropdown' : ''}`}>
        <ul className='nav-links-mobile'>
          {pageLinks.map(({ id, href, text }) => (
            <li key={id}>
              <a
                href={href}
                className='nav-link'
                onClick={() => setShowLinks(false)}
              >
                {text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
};

export default Navbar;
