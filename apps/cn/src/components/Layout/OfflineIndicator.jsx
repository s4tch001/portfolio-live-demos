import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Facebook-style connectivity indicator pinned bottom-left. Persistent while
// offline; on reconnect it shows a brief "Connection restored" state that fades
// out on its own — NO page reload (the app's WebSocket reconnect + DataProvider
// catch-up already refresh the data, and a reload would wipe unsaved work).
// Purely client-side (navigator.onLine + window events).
const RESTORED_VISIBLE_MS = 2500; // how long "Connection restored" stays
const FADE_MS = 300; // matches the CSS exit animation

export default function OfflineIndicator() {
  const t = useT();
  const [status, setStatus] = useState(() => (navigator.onLine ? 'online' : 'offline'));
  const [leaving, setLeaving] = useState(false);
  const wasOfflineRef = useRef(!navigator.onLine);
  const timersRef = useRef([]);

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    const goOffline = () => {
      clearTimers();
      setLeaving(false);
      wasOfflineRef.current = true;
      setStatus('offline');
    };
    const goOnline = () => {
      // Only celebrate if we were actually offline before.
      if (!wasOfflineRef.current) {
        setStatus('online');
        return;
      }
      wasOfflineRef.current = false;
      clearTimers();
      setLeaving(false);
      setStatus('restored');
      // Hold the message, then fade it out and unmount — no reload.
      timersRef.current.push(setTimeout(() => setLeaving(true), RESTORED_VISIBLE_MS));
      timersRef.current.push(
        setTimeout(() => {
          setLeaving(false);
          setStatus('online');
        }, RESTORED_VISIBLE_MS + FADE_MS),
      );
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      clearTimers();
    };
  }, []);

  if (status === 'online') return null;

  const restored = status === 'restored';
  return (
    <div
      className={'offline-indicator' + (restored ? ' restored' : '') + (leaving ? ' leaving' : '')}
      role="status"
      aria-live="polite"
    >
      <i
        className={'fa-solid ' + (restored ? 'fa-plug-circle-check' : 'fa-plug-circle-xmark')}
        aria-hidden="true"
      ></i>
      <span>{restored ? t('offline.restored') : t('offline.offline')}</span>
    </div>
  );
}
