import { createContext, useContext, useState, useRef, useCallback } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { useT } from '../i18n/LanguageProvider.jsx';

const ConfirmCtx = createContext(null);

// Promise-based confirm dialog matching legacy showConfirmDialog (app.js:9279).
// Reuses the .modal.confirm-modal markup so styling is identical. Supports
// { title, message, lines, okText, danger, hideCancel }.
export function ConfirmProvider({ children }) {
  const t = useT();
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const showConfirm = useCallback(
    (opts = {}) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setState({
          title: '',
          message: '',
          lines: [],
          okText: '', // '' → translated default ("Confirm") resolved at render
          danger: false,
          hideCancel: false,
          ...opts,
        });
      }),
    [],
  );

  const finish = useCallback((val) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    if (r) r(!!val);
  }, []);

  return (
    <ConfirmCtx.Provider value={showConfirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => finish(false)}
        title={state ? state.title || t('common.confirm') : ''}
        className="confirm-modal"
      >
        {state && (
          <>
            <div className="modal-body">
              {state.message && (
                <div className="confirm-dialog-message">{state.message}</div>
              )}
              <div className="confirm-dialog-lines">
                {(state.lines || [])
                  .map((line, i) => {
                    if (line && typeof line === 'object') {
                      const label = String(line.label || '').trim();
                      const value = String(line.value || '').trim();
                      if (!label && !value) return null;
                      return (
                        <div className="confirm-dialog-line" key={i}>
                          <span className="confirm-dialog-label">{label}:</span>{' '}
                          <span>{value || '-'}</span>
                        </div>
                      );
                    }
                    const value = String(line || '').trim();
                    return value ? (
                      <div className="confirm-dialog-line" key={i}>
                        {value}
                      </div>
                    ) : null;
                  })
                  .filter(Boolean)}
              </div>
            </div>
            <div className="modal-footer">
              {!state.hideCancel && (
                <button className="btn btn-secondary" onClick={() => finish(false)}>
                  {t('common.cancel')}
                </button>
              )}
              <button
                className={'btn btn-primary' + (state.danger ? ' btn-danger-confirm' : '')}
                onClick={() => finish(true)}
              >
                {state.okText || t('common.confirm')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
