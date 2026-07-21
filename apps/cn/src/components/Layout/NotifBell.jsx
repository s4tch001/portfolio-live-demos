import { useState, useRef, useEffect } from 'react';
import {
  useNotifications,
  formatNotifTime,
} from '../../context/NotificationsProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Notification bell + dropdown (used in topbar and mobile nav). Mirrors the
// legacy .notif-bell-wrap markup and behavior (toggle dropdown, unread badge/
// dot, per-item read/delete, mark-all/clear-all).
export default function NotifBell() {
  const {
    notifs,
    unreadCount,
    bellVisible,
    markRead,
    markAllRead,
    deleteNotif,
    clearAll,
  } = useNotifications();
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  if (!bellVisible) return null;

  const badge = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div className="notif-bell-wrap" ref={wrapRef} style={{ display: 'flex' }}>
      <button
        className="notif-bell-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <i className="fa-solid fa-bell" aria-hidden="true"></i>
        {unreadCount > 0 && <span className="bell-dot" style={{ display: 'block' }}></span>}
        {unreadCount > 0 && (
          <span className="notif-badge" style={{ display: 'flex' }}>
            {badge}
          </span>
        )}
      </button>
      <div className={'notif-dropdown' + (open ? ' open' : '')}>
        <div className="notif-dropdown-header">
          <span>{t('notif.title')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                markAllRead();
                setOpen(false);
              }}
            >
              {t('notif.markAllRead')}
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => clearAll()}>
              {t('notif.clearAll')}
            </button>
          </div>
        </div>
        <div className="notif-dropdown-list">
          {notifs.length === 0 ? (
            <div className="notif-empty">{t('notif.empty')}</div>
          ) : (
            notifs.map((n) => (
              <div
                key={n.id}
                className={'notif-item' + (n.read ? '' : ' unread')}
                onClick={() => markRead(n.id)}
              >
                <button
                  type="button"
                  className="notif-del-btn"
                  title={t('common.delete')}
                  aria-label={t('notif.delete')}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotif(n.id);
                  }}
                  style={{
                    float: 'right',
                    marginLeft: 8,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text3)',
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  &times;
                </button>
                <span className="notif-msg">{n.message}</span>
                <div className="notif-time">{formatNotifTime(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
