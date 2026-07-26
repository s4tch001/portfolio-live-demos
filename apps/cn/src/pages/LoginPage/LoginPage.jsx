import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import LanguageSwitcher from '../../components/ui/LanguageSwitcher.jsx';

// Build the error message from the server's failure payload (legacy
// showLoginFailure, app.js:1030-1058).
function loginErrorMessage(data, t) {
  // Prefer the machine-readable flags so the message is shown in the user's
  // chosen language (the server's `error` string is an English fallback).
  if (data?.account_blocked) {
    return t('login.blocked');
  }
  if (data?.account_inactive) {
    return t('login.inactive');
  }
  // Plain wrong credentials — no attempt count shown.
  return t('login.invalid');
}

export default function LoginPage() {
  const { login } = useAuth();
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login({ username: username.trim(), password, remember });
      // success → AuthProvider sets user; the /login route redirects out.
    } catch (err) {
      setError(loginErrorMessage(err.data, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="login-page">
      <div
        style={{ position: 'absolute', top: 16, right: 16, zIndex: 5, display: 'flex', alignItems: 'center', gap: 14 }}
      >
        {/* Brand doubles as a "back to landing" link (public-header-brand, like the
            landing page). White text so it stays legible over the dark video. */}
        <Link
          to="/"
          className="public-header-brand"
          style={{ color: '#fff', fontSize: 16 }}
          aria-label={t('login.backHome')}
        >
          <img src="/assets/img/logo/android-chrome-512x512.png" alt="Sunset-Speaks logo" />
          <span>Sunset-Speaks</span>
        </Link>
        <LanguageSwitcher
          className="form-control"
          style={{ width: 'auto', height: 36, padding: '0 30px 0 12px', fontSize: 14 }}
        />
      </div>
      <div className="login-bg-layer" aria-hidden="true">
        <video
          id="login-bg-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          src="/assets/video/login-background.mp4"
        ></video>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <div className="logo-icon">
            <img src="/assets/img/logo/android-chrome-512x512.png" alt="" />
          </div>
          <h1>Sunset-Speaks</h1>
          <p>{t('landing.tagline')}</p>
        </div>
        <aside
          role="note"
          aria-label="Portfolio preview login credentials"
          style={{
            background: 'rgba(15, 23, 42, 0.82)',
            border: '1px solid rgba(255, 255, 255, 0.24)',
            borderRadius: 12,
            color: '#fff',
            fontSize: 13,
            lineHeight: 1.55,
            marginBottom: 16,
            padding: '12px 14px',
          }}
        >
          <strong>Portfolio preview accounts</strong>
          <div>Administrator: <code>admin</code> / <code>password</code></div>
          <div>Teacher: <code>testteacher</code> / <code>password</code></div>
          <div>Student: <code>teststudent</code> / <code>password</code></div>
          <small>These fixed demo credentials cannot be changed.</small>
        </aside>
        {error && (
          <div className="error-msg" style={{ display: 'block' }}>
            {error}
          </div>
        )}
        <div className="form-group">
          <label>{t('login.username')}</label>
          <input
            type="text"
            className="form-control"
            placeholder={t('login.username')}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>{t('login.password')}</label>
          <div className="password-wrap">
            <input
              type={showPwd ? 'text' : 'password'}
              className="form-control"
              placeholder={t('login.password')}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="pwd-toggle"
              onClick={() => setShowPwd((s) => !s)}
              title="Show/hide password"
            >
              <i
                className={'fa-solid ' + (showPwd ? 'fa-eye-slash' : 'fa-eye')}
                aria-hidden="true"
              ></i>
            </button>
          </div>
        </div>
        <label className="remember-me-row">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>{t('login.remember')}</span>
        </label>
        <button className="btn btn-primary" id="login-btn" type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner"></span> {t('login.signingIn')}
            </>
          ) : (
            <>
              {t('login.button')} <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
