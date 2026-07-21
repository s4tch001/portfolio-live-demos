import { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useConfirm } from '../../context/ConfirmProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { apiFetch } from '../../lib/apiClient.js';
import DataBackupModal from './DataBackupModal.jsx';
import LogsModal from './LogsModal.jsx';
import LanguageSwitcher from '../ui/LanguageSwitcher.jsx';
import { isNotifSoundEnabled, setNotifSoundEnabled, playNotifSound } from '../../lib/notifSound.js';

// Slide-in account drawer (all roles). Header (avatar + role) · Preferences
// (language / theme / sound) · role tools (student: My Classes; master/admin:
// backup/download/restore/logs) · Sign Out. Theme-aware + responsive.
export default function HamburgerMenu({ open, onClose }) {
  const { user, logout, canBackupDatabase, canManageDatabase, myPerm } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const confirm = useConfirm();
  const t = useT();
  const fileRef = useRef(null);
  const [backup, setBackup] = useState(null); // null | 'cloud' | 'download'
  const [restoring, setRestoring] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isNotifSoundEnabled());

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotifSoundEnabled(next);
    if (next) playNotifSound(); // little preview chime when turning it on
    toast(next ? 'Notification sound on' : 'Notification sound off');
  };

  if (!user) return null;
  const initial = (user.fullname || '').charAt(0).toUpperCase();
  const avatarBg = `linear-gradient(135deg,${user.color || '#2563eb'},#0ea5e9)`;
  const isDark = theme === 'dark';
  const showBackup = canBackupDatabase();
  const showManage = canManageDatabase();
  const showLogs = user.role === 'admin' && myPerm('view_logs');
  const roleLabel =
    user.role === 'admin' ? t('role.admin') : user.role === 'student' ? t('role.student') : t('role.teacher');
  const hasTools = showBackup || showManage || showLogs;

  const handleRestoreFile = async (input) => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    const ok = await confirm({
      title: 'Restore data?',
      message: `Restore ${files.length} SQL file${files.length === 1 ? '' : 's'}? This will merge imported data into the current database.`,
      lines: [
        { label: 'Files Selected', value: String(files.length) },
        { label: 'Restore Mode', value: 'Merge imported data into current database' },
      ],
      okText: 'Restore',
      danger: true,
    });
    if (!ok) return;
    setRestoring(true);
    try {
      const sqlFiles = await Promise.all(files.map((file) => file.text()));
      await apiFetch('/backup/restore', 'POST', { files: sqlFiles });
      onClose();
      toast('Database restored. The app will reload in 7 seconds.');
      setTimeout(() => window.location.reload(), 7000);
    } catch (e) {
      toast('Restore failed: ' + (e.message || String(e)));
    } finally {
      setRestoring(false);
    }
  };

  const chevron = <i className="fa-solid fa-chevron-right ham-row-chevron" aria-hidden="true"></i>;

  return (
    <div
      className={'hamburger-menu' + (open ? ' open' : '')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ham-panel" role="dialog" aria-modal="true">
        <div className="ham-header">
          <div className="ham-avatar" style={{ background: avatarBg }}>
            {initial}
          </div>
          <div className="ham-id">
            <div className="ham-name">{user.fullname}</div>
            {user.username && <div className="ham-username">{user.username}</div>}
            <span className="ham-role">{roleLabel}</span>
          </div>
          <button className="ham-close" onClick={onClose} aria-label={t('common.close')}>
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className="ham-scroll">
          {/* Preferences */}
          <div className="ham-section">
            <div className="ham-section-label">{t('menu.preferences')}</div>
            {/* Language selector — available to every role (admin / teacher /
                student). The choice is stored in localStorage and shared with
                the landing + login pages, so the whole UI stays in one language. */}
            <div className="ham-row ham-row-static">
              <span className="ham-row-icon">
                <i className="fa-solid fa-globe" aria-hidden="true"></i>
              </span>
              <span className="ham-row-label">{t('menu.language')}</span>
              <LanguageSwitcher className="ham-lang-select" />
            </div>
            <button className="ham-row" onClick={toggleTheme}>
              <span className="ham-row-icon">
                <i className={'fa-solid ' + (isDark ? 'fa-sun' : 'fa-moon')} aria-hidden="true"></i>
              </span>
              <span className="ham-row-label">{t('menu.theme')}</span>
              <span className="ham-row-state">{isDark ? t('menu.dark') : t('menu.light')}</span>
            </button>
            <button className="ham-row" onClick={toggleSound} aria-pressed={soundOn}>
              <span className="ham-row-icon">
                <i className={'fa-solid ' + (soundOn ? 'fa-volume-high' : 'fa-volume-xmark')} aria-hidden="true"></i>
              </span>
              <span className="ham-row-label">{t('menu.sound')}</span>
              <span className="ham-row-state">{soundOn ? t('common.on') : t('common.off')}</span>
            </button>
          </div>

          {/* Master / admin tools */}
          {hasTools && (
            <div className="ham-section">
              <div className="ham-section-label">{t('menu.tools')}</div>
              {showBackup && (
                <button className="ham-row" onClick={() => setBackup('cloud')}>
                  <span className="ham-row-icon">
                    <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
                  </span>
                  <span className="ham-row-label">{t('menu.backupCloud')}</span>
                  {chevron}
                </button>
              )}
              {showManage && (
                <button className="ham-row" onClick={() => setBackup('download')}>
                  <span className="ham-row-icon">
                    <i className="fa-solid fa-download" aria-hidden="true"></i>
                  </span>
                  <span className="ham-row-label">{t('menu.downloadData')}</span>
                  {chevron}
                </button>
              )}
              {showManage && (
                <button className="ham-row" onClick={() => fileRef.current?.click()} disabled={restoring}>
                  <span className="ham-row-icon">
                    <i className="fa-solid fa-rotate-left" aria-hidden="true"></i>
                  </span>
                  <span className="ham-row-label">{restoring ? t('common.loading') : t('menu.restoreData')}</span>
                  {restoring ? <span className="spinner"></span> : chevron}
                </button>
              )}
              {showLogs && (
                <button className="ham-row" onClick={() => setLogsOpen(true)}>
                  <span className="ham-row-icon">
                    <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                  </span>
                  <span className="ham-row-label">{t('menu.viewLogs')}</span>
                  {chevron}
                </button>
              )}
            </div>
          )}
        </div>

        {showManage && (
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".sql,application/sql,text/plain"
            onChange={(e) => handleRestoreFile(e.target)}
            style={{ display: 'none' }}
          />
        )}

        <div className="ham-footer">
          <button
            className="ham-signout"
            onClick={() => {
              onClose();
              logout();
            }}
          >
            <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
            {t('common.signOut')}
          </button>
        </div>
      </div>

      <DataBackupModal open={!!backup} mode={backup || 'download'} onClose={() => setBackup(null)} />
      {showLogs && <LogsModal open={logsOpen} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
