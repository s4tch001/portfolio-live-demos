import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { getOpenId, setOpenId, subscribeMenu } from './accountMenuStore.js';

// Kebab (⋮) actions menu used by Students/Accounts tables. The panel uses
// position:fixed (CSS) and is positioned relative to the viewport so it
// escapes the table's overflow — faithful to legacy positionAccountActionsPanel.
// A shared store holds the single open menu id, so only one is ever open.
// actions: [{ label, danger?, disabled?, onClick }]
export default function AccountActionsMenu({ actions, ariaLabel = 'Actions' }) {
  const myId = useId();
  const [openId, setLocalOpenId] = useState(getOpenId());
  const [pos, setPos] = useState(null);
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const open = openId === myId;
  const close = () => setOpenId(null);

  useEffect(() => subscribeMenu(setLocalOpenId), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      // Clicking ANY kebab button is handled by its own toggle (via the shared
      // store) — don't let the outside-click close fight it.
      if (e.target.closest && e.target.closest('.account-action-menu-btn')) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !panelRef.current) return;
    const edge = 8;
    const gap = 6;
    const b = btnRef.current.getBoundingClientRect();
    const p = panelRef.current.getBoundingClientRect();
    let left = b.right - p.width;
    left = Math.max(edge, Math.min(left, window.innerWidth - p.width - edge));
    let top = b.bottom + gap;
    if (top + p.height + edge > window.innerHeight) top = b.top - p.height - gap;
    if (top < edge) top = Math.max(edge, window.innerHeight - p.height - edge);
    setPos({ left, top });
  }, [open]);

  return (
    <div className={'account-actions-menu' + (open ? ' open' : '')} ref={menuRef}>
      <button
        type="button"
        className="account-action-menu-btn"
        aria-label={ariaLabel}
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setPos(null);
          setOpenId(open ? null : myId);
        }}
      >
        <i className="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
      </button>
      {open && (
        <div
          className="account-actions-panel"
          ref={panelRef}
          style={pos ? { left: pos.left + 'px', top: pos.top + 'px' } : { visibility: 'hidden' }}
        >
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              className={a.danger ? 'danger' : undefined}
              disabled={a.disabled}
              onClick={() => {
                close();
                if (!a.disabled) a.onClick();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
