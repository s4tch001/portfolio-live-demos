import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { apiFetch } from '../lib/apiClient.js';
import { uiLocale } from '../lib/format.js';
import { WS_BASE } from '../lib/workerUrl.js';
import { emitRealtime } from '../lib/realtime.js';
import { playNotifSound } from '../lib/notifSound.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastProvider.jsx';
import { useConfirm } from './ConfirmProvider.jsx';

const NotifCtx = createContext(null);

// Real-time notifications: load once on app open, then receive pushes over a
// WebSocket (no polling — keeps D1 reads near zero). Faithful port of
// app.js:2787-2991: 2s→60s reconnect backoff, 30s ping/pong, 50-item cache,
// re-read D1 only on reconnect.
export function NotificationsProvider({ children }) {
  const { user, token } = useAuth();
  const toast = useToast();
  const showConfirm = useConfirm();

  const [notifs, setNotifs] = useState([]);
  const notifsRef = useRef([]);
  notifsRef.current = notifs;

  const socketRef = useRef(null);
  const pingTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(2000);
  const connectedBeforeRef = useRef(false);
  const closedByUsRef = useRef(false);

  const loadNotifs = useCallback(async () => {
    try {
      const list = await apiFetch('/notifications');
      setNotifs(Array.isArray(list) ? list : []);
    } catch (e) {
      /* keep existing cache */
    }
  }, []);

  useEffect(() => {
    if (!user || !token) {
      setNotifs([]);
      connectedBeforeRef.current = false;
      return;
    }

    closedByUsRef.current = false;

    const stopPing = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    };
    const startPing = () => {
      stopPing();
      pingTimerRef.current = setInterval(() => {
        try {
          if (socketRef.current && socketRef.current.readyState === 1)
            socketRef.current.send('ping');
        } catch (e) {}
      }, 30000);
    };
    const closeSocket = () => {
      stopPing();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        try {
          socketRef.current.onclose = null;
          socketRef.current.close();
        } catch (e) {}
        socketRef.current = null;
      }
    };
    const scheduleReconnect = () => {
      if (closedByUsRef.current || reconnectTimerRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, reconnectDelayRef.current);
      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 60000);
    };
    const connect = () => {
      closeSocket();
      if (closedByUsRef.current) return;
      if (!WS_BASE) return;
      try {
        const ws = new WebSocket(
          WS_BASE + '/ws?token=' + encodeURIComponent(token),
        );
        socketRef.current = ws;
        ws.onopen = () => {
          reconnectDelayRef.current = 2000;
          startPing();
          // Only re-read D1 on a RECONNECT (catch anything missed offline).
          if (connectedBeforeRef.current) {
            loadNotifs();
            emitRealtime('reconnect'); // let the data cache re-validate loaded months
          }
          connectedBeforeRef.current = true;
        };
        ws.onmessage = (ev) => {
          if (ev.data === 'pong') return;
          let data;
          try {
            data = JSON.parse(ev.data);
          } catch (e) {
            return;
          }
          // Live data-change push — hand off to the cache/view subscribers and stop.
          if (data && data.kind === 'sync') {
            emitRealtime('sync', data);
            return;
          }
          if (data && data.kind === 'notif') {
            if (data.id != null) {
              setNotifs((prev) => {
                if (prev.some((n) => n.id === data.id)) return prev;
                const next = [
                  {
                    id: data.id,
                    message: data.message || '',
                    type: data.type || 'info',
                    student_name: data.student_name || '',
                    read: 0,
                    created_at: data.created_at || new Date().toISOString(),
                  },
                  ...prev,
                ];
                if (next.length > 50) next.pop();
                return next;
              });
            } else {
              loadNotifs();
            }
            toast(data.message || 'New notification');
            // One chime per push; throttled inside so a burst won't stack.
            playNotifSound();
          }
        };
        ws.onclose = () => {
          stopPing();
          scheduleReconnect();
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch (e) {}
        };
      } catch (e) {
        scheduleReconnect();
      }
    };

    // initNotifications: single load, then open socket.
    loadNotifs();
    connect();

    return () => {
      closedByUsRef.current = true;
      closeSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id, token]);

  const unreadCount = notifs.filter((n) => !n.read).length;

  const markRead = useCallback(async (id) => {
    setNotifs((prev) => prev.map((n) => (n.id == id ? { ...n, read: 1 } : n)));
    try {
      await apiFetch('/notifications', 'POST', { id });
    } catch (e) {}
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: 1 })));
    try {
      await apiFetch('/notifications/read-all', 'POST');
    } catch (e) {}
  }, []);

  const deleteNotif = useCallback(async (id) => {
    setNotifs((prev) => prev.filter((n) => n.id != id));
    try {
      await apiFetch('/notifications/' + id, 'DELETE');
    } catch (e) {}
  }, []);

  const clearAll = useCallback(async () => {
    const ok = await showConfirm({
      title: 'Clear all notifications?',
      message:
        'All your notifications will be permanently deleted. This cannot be undone.',
      okText: 'Clear all',
      danger: true,
      hideCancel: true,
    });
    if (!ok) return;
    setNotifs([]);
    try {
      await apiFetch('/notifications/clear-all', 'POST');
    } catch (e) {}
  }, [showConfirm]);

  const value = {
    notifs,
    unreadCount,
    bellVisible: !!user,
    markRead,
    markAllRead,
    deleteNotif,
    clearAll,
    reload: loadNotifs,
  };
  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotifCtx);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

// Shared time formatter for notification timestamps (legacy formatNotifTime).
// Moved to lib/format.js (next to uiLocale, which it depends on). Re-exported
// here so existing importers keep working.
export { formatNotifTime } from '../lib/format.js';
