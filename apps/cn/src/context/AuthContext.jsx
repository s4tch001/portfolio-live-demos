import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  apiFetch,
  setAuthToken,
  setUnauthorizedHandler,
} from '../lib/apiClient.js';
import { onRealtime } from '../lib/realtime.js';

const SESSION_USER_KEY = 'edu_user';
const SESSION_TOKEN_KEY = 'edu_session_token';
const SESSION_REMEMBER_KEY = 'edu_session_remember';

const AuthContext = createContext(null);

// --- session storage helpers (same keys + rules as legacy app.js:1092-1128) ---
function saveSession(user, token, rememberMe) {
  try {
    clearSessionStorageBoth();
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    storage.setItem(SESSION_TOKEN_KEY, token);
    storage.setItem(SESSION_REMEMBER_KEY, rememberMe ? '1' : '0');
  } catch (e) {}
}
function clearSessionStorageBoth() {
  try {
    [sessionStorage, localStorage].forEach((s) => {
      s.removeItem(SESSION_USER_KEY);
      s.removeItem(SESSION_TOKEN_KEY);
      s.removeItem(SESSION_REMEMBER_KEY);
    });
  } catch (e) {}
}
function readSession() {
  try {
    const storage = localStorage.getItem(SESSION_TOKEN_KEY)
      ? localStorage
      : sessionStorage;
    const s = storage.getItem(SESSION_USER_KEY);
    const token = storage.getItem(SESSION_TOKEN_KEY) || '';
    if (s && token) {
      return { user: JSON.parse(s), token, remember: storage.getItem(SESSION_REMEMBER_KEY) === '1' };
    }
  } catch (e) {}
  return null;
}
// Re-save the stored user object (in whichever storage currently holds the
// session) after a field like `language` changes, so a session restore reflects
// the latest value instead of the one snapshotted at login.
function updateStoredUser(user) {
  try {
    const storage = localStorage.getItem(SESSION_TOKEN_KEY) ? localStorage : sessionStorage;
    if (storage.getItem(SESSION_TOKEN_KEY)) {
      storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    }
  } catch (e) {}
}

export function AuthProvider({ children }) {
  const restored = readSession();
  const [user, setUser] = useState(restored ? restored.user : null);
  const [token, setToken] = useState(restored ? restored.token : '');
  // perms: null = "not loaded / failed" → default-allow (legacy _myPerms semantics).
  const [perms, setPerms] = useState(null);

  // Keep the apiClient module token aligned with state before any effect or
  // request runs. Idempotent (just assigns a module var), so safe each render.
  setAuthToken(token);

  const isAdmin = !!user && user.role === 'admin';
  const isMasterAdmin = useCallback(
    () =>
      !!user &&
      user.role === 'admin' &&
      String(user.username || '').toLowerCase() === 'devpau',
    [user],
  );
  const canManageDatabase = isMasterAdmin;
  const canBackupDatabase = isMasterAdmin;

  // Mirror legacy myPerm: non-admins false; null perms default-allow; else perms[key] !== false.
  const myPerm = useCallback(
    (key) => {
      if (!user || user.role !== 'admin') return false;
      if (!perms) return true;
      return perms[key] !== false;
    },
    [user, perms],
  );

  const loadMyPermissions = useCallback(async () => {
    try {
      const d = await apiFetch('/my-permissions');
      setPerms(d && d.perms ? d.perms : null);
    } catch (e) {
      setPerms(null);
    }
  }, []);

  // Mirror the user's UI-language choice into auth state + stored session so a
  // later restore keeps it. The server persistence (so it follows the user to
  // other devices on next login) is fired by LanguageProvider.setLang.
  const setUserLanguage = useCallback((code) => {
    setUser((u) => {
      if (!u || u.language === code) return u;
      const next = { ...u, language: code };
      updateStoredUser(next);
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', 'POST');
    } catch (e) {}
    clearSessionStorageBoth();
    setAuthToken('');
    setToken('');
    setUser(null);
    setPerms(null);
  }, []);

  const login = useCallback(
    async ({ username, password, remember }) => {
      const res = await apiFetch(
        '/auth/login',
        'POST',
        { username, password, remember_me: !!remember },
        { skipAuthHandler: true },
      );
      if (!res || !res.user) {
        const err = new Error('Invalid username or password.');
        err.data = res;
        throw err;
      }
      const newToken = res.token || '';
      setAuthToken(newToken);
      saveSession(res.user, newToken, !!remember);
      setUser(res.user);
      setToken(newToken);
      if (res.user.role === 'admin') loadMyPermissions();
      return res.user;
    },
    [loadMyPermissions],
  );

  // Register the global 401 handler once: an authenticated request that 401s
  // forces a logout (legacy app had no global handler; this is a safe add).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSessionStorageBoth();
      setAuthToken('');
      setToken('');
      setUser(null);
      setPerms(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // On a restored admin session, load permissions once.
  useEffect(() => {
    if (user && user.role === 'admin') loadMyPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live: when THIS admin's permissions are changed by another admin, reload them
  // so the nav tabs appear/disappear without a refresh.
  useEffect(() => {
    if (!user || user.role !== 'admin') return undefined;
    return onRealtime('sync', (msg) => {
      if (msg && msg.resource === 'permissions' && Number(msg.id) === Number(user.id)) {
        loadMyPermissions();
      }
    });
  }, [user, loadMyPermissions]);

  const value = {
    user,
    token,
    isAdmin,
    perms,
    isMasterAdmin,
    canManageDatabase,
    canBackupDatabase,
    myPerm,
    loadMyPermissions,
    login,
    logout,
    setUserLanguage,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Landing route per role (legacy: admin -> accounts, teacher -> schedule).
export function defaultRouteFor(user) {
  if (user && user.role === 'admin') return '/accounts';
  return '/schedule';
}
