import { useState } from 'react';

export default function PasswordModal({ isOpen, password, onPasswordChange, onSubmit, onCancel, error, loading, status }) {
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(password);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="overlay">
      <div className="passwordModal">
        <h2>Download Attendance</h2>
        <p>Enter password to download attendance file:</p>

        <form onSubmit={handleSubmit}>
          <div className="passwordInputWrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Password"
              disabled={loading}
              autoFocus
            />
            <button
              type="button"
              className="togglePasswordButton"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              {showPassword ? '👁️ Hide' : '👁️ Show'}
            </button>
          </div>

          {error && <div className="passwordError">{error}</div>}

          <div className="passwordActions">
            <button
              type="submit"
              disabled={loading}
              className={loading ? 'button loading' : 'button'}
            >
              {loading ? (status || 'Downloading...') : 'Download'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="button secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
