import { useState } from 'react';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Password input with a show/hide eye toggle (legacy .password-wrap + togglePwd).
export default function PasswordField({
  value,
  onChange,
  placeholder,
  className = 'form-control',
  autoComplete,
}) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div className="password-wrap">
      <input
        type={show ? 'text' : 'password'}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="pwd-toggle"
        onClick={() => setShow((s) => !s)}
        title={t('common.showHidePassword')}
      >
        <i className={'fa-solid ' + (show ? 'fa-eye-slash' : 'fa-eye')} aria-hidden="true"></i>
      </button>
    </div>
  );
}
