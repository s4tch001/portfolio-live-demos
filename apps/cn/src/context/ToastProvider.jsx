import { createContext, useContext, useCallback } from 'react';
import { ButterPop } from '../lib/butterpop/butterpop.esm.js';
import '../lib/butterpop/butterpop.css';

const ToastCtx = createContext(null);

// Infer the toast type from the message so the existing single-arg call sites
// (toast('Saved.'), toast('Error: ...')) get sensible colors without edits.
// Call sites can still override with an explicit second arg: toast(msg, 'error').
function inferType(text) {
  const t = text.toLowerCase();
  if (/error|fail|failed|cannot|can't|invalid|not found|unable|denied|forbidden|insufficient|already (used|exists)|wrong|expired|no active|not on the|must be different|no remaining|inactive and/.test(t)) {
    return 'error';
  }
  if (/success|saved|submitted|added|created|updated|deleted|cleared|restored|sent|copied|moved|transferred|cancelled|started|enabled|hidden|shown|granted/.test(t)) {
    return 'success';
  }
  if (/please|required|select|choose|complete|must|enter|at least|no changes|already|generate|highlighted/.test(t)) {
    return 'warning';
  }
  return 'info';
}

// All app toasts render through ButterPop (bottom-right, light/dark to match the
// app theme, 7s with a progress bar). Replaces the legacy .toast-stack.
export function ToastProvider({ children }) {
  const toast = useCallback((msg, type) => {
    const message = String(msg ?? '');
    if (!message) return;
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    ButterPop.show({
      message,
      type: type || inferType(message),
      position: 'bottom-right',
      theme,
      duration: 7000,
      progress: true,
      closable: true,
      pauseOnHover: true,
      closeOnClick: false,
      preventDuplicates: true, // keep the legacy "no duplicate on screen" behavior
    });
  }, []);

  return <ToastCtx.Provider value={toast}>{children}</ToastCtx.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
