import { navIcons } from '../data';
const Footer = () => {
  return (
    <footer className='section footer'>
      {/* <ul className='footer-links'>
        {pageLinks.map(({ id, href, text }) => (
          <li key={id}>
            <a href={href} className='footer-link'>
              {text}
            </a>
          </li>
        ))}
      </ul> */}
      <ul className='footer-icons'>
        {navIcons.map(({ id, href, icon }) => (
          <li key={id}>
            <a
              href={href}
              target='_blank'
              rel='noreferrer'
              className='footer-icon'
              aria-label={`Open ${icon.replace('fab fa-', '')}`}
            >
              <i className={icon}></i>
            </a>
          </li>
        ))}
      </ul>
      <p className='copyright'>
        copyright &copy; P travel tours company
        <span id='date'>{new Date().getFullYear()}</span> all rights reserved
      </p>
    </footer>
  );
};
export default Footer;
