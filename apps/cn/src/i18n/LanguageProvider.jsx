import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { STRINGS } from './strings.js';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../lib/apiClient.js';

// China build: UI language selection. us=English, cn=Simplified, hk=Traditional
// (Hong Kong), tw=Traditional (Taiwan). Only UI CHROME is translated — never
// user content (report text, names, notes) nor the brand name / support email.
export const LANGUAGES = [
  { code: 'us', label: 'English', short: 'EN' },
  { code: 'cn', label: '简体中文', short: '简' },
  { code: 'hk', label: '繁體中文（香港）', short: '繁' },
  { code: 'tw', label: '繁體中文（台灣）', short: '繁' },
];
const CODES = LANGUAGES.map((l) => l.code);
const LANG_KEY = 'lang';

const LangContext = createContext(null);

function readInitial() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (CODES.includes(v)) return v;
  } catch (e) {}
  return 'us';
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitial);
  const { user, setUserLanguage } = useAuth();

  // Refs let the login-apply effect and setLang read the latest values without
  // re-subscribing / racing state updates.
  const langRef = useRef(lang);
  langRef.current = lang;
  const userRef = useRef(user);
  userRef.current = user;

  // The whole UI (landing, login, and the in-app views for admin / teacher /
  // student) renders in the selected language. localStorage holds the working
  // copy so the choice is shared everywhere and survives reloads. For a
  // logged-in user the ACCOUNT language is the source of truth: it is applied
  // on login (below) and pushed back to the server when changed, so the choice
  // follows the user across devices. Only user CONTENT (names, report text,
  // notes) and the brand name / support email stay verbatim.
  const effectiveLang = lang;

  // On login (or session restore) apply the account's saved language exactly
  // once per user identity — so signing in on a new device adopts the language
  // you last chose. Keyed on role:id so an in-session switch (which updates the
  // user object) does not re-trigger and clobber the user's fresh choice.
  const appliedUserKeyRef = useRef(null);
  useEffect(() => {
    const key = user ? user.role + ':' + user.id : null;
    if (!key) {
      appliedUserKeyRef.current = null;
      return;
    }
    if (key !== appliedUserKeyRef.current) {
      appliedUserKeyRef.current = key;
      const accountLang = user.language;
      if (CODES.includes(accountLang) && accountLang !== langRef.current) {
        setLangState(accountLang);
        try {
          localStorage.setItem(LANG_KEY, accountLang);
        } catch (e) {}
      }
    }
  }, [user]);

  useEffect(() => {
    try {
      document.documentElement.lang =
        effectiveLang === 'us' ? 'en' : effectiveLang === 'cn' ? 'zh-Hans' : effectiveLang === 'tw' ? 'zh-Hant-TW' : 'zh-Hant-HK';
    } catch (e) {}
  }, [effectiveLang]);

  // localStorage is the single source of truth (no server persistence). One
  // LanguageProvider wraps the whole SPA, so landing / login / in-app all read
  // and write the same value — switching anywhere updates everywhere, and the
  // choice survives reloads. Cross-tab: mirror storage changes from other tabs.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === LANG_KEY && CODES.includes(e.newValue)) setLangState(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setLang = useCallback(
    (code) => {
      if (!CODES.includes(code)) return;
      setLangState(code);
      try {
        localStorage.setItem(LANG_KEY, code);
      } catch (e) {}
      // Logged in: persist to the account so the choice follows the user to
      // other devices, and keep the in-memory / stored session user in sync.
      if (userRef.current) {
        setUserLanguage(code);
        apiFetch('/me/language', 'POST', { language: code }).catch(() => {});
      }
    },
    [setUserLanguage],
  );

  const t = useCallback(
    (key, arg) => {
      // arg can be a string fallback (legacy) OR a params object for {placeholder}
      // interpolation, e.g. t('toast.teacherMarked', { status: t('status.Inactive') }).
      const entry = STRINGS[key];
      let str;
      if (!entry) str = typeof arg === 'string' ? arg : key;
      else str = entry[effectiveLang] || entry.us || (typeof arg === 'string' ? arg : key);
      if (arg && typeof arg === 'object') {
        str = str.replace(/\{(\w+)\}/g, (m, k) => (arg[k] != null ? String(arg[k]) : m));
      }
      return str;
    },
    [effectiveLang],
  );

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}

// Convenience hook when a component only needs the translator.
export function useT() {
  return useLang().t;
}
