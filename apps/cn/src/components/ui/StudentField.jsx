import { useState, useRef, useEffect } from 'react';
import StudentPickerModal from './StudentPickerModal.jsx';
import StudentMeta from './StudentMeta.jsx';
import { unschedulableStatus } from '../../lib/accountStatus.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Student name field matching the SPA: type to auto-search a suggestions dropdown,
// or click the side button to pick from the full student-list modal.
// `schedMode` flags inactive students as not-selectable in the suggestions
// (they can't be scheduled).
export default function StudentField({
  value,
  onChange,
  students,
  disabled = false,
  schedMode = false,
  // Like schedMode but blocks ONLY End-of-Contract students from selection
  // (Inactive students stay selectable, just badged). Used by Modify Classes.
  blockEndOfContract = false,
  invalid = false,
  placeholder = 'Type or pick student',
  pickerTitle = 'Select Student',
}) {
  const t = useT();
  const [showSug, setShowSug] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!showSug) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSug(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [showSug]);

  const matches =
    value && value.length >= 1
      ? students.filter((s) => String(s.name || '').toLowerCase().includes(value.toLowerCase())).slice(0, 30)
      : [];

  return (
    <div className="student-input-wrap" ref={wrapRef}>
      <input
        type="text"
        className={'form-control' + (invalid ? ' required-error' : '')}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSug(true);
        }}
        onFocus={() => {
          if (value) setShowSug(true);
        }}
      />
      <button
        type="button"
        className="btn btn-secondary student-pick-btn"
        title="Pick a student"
        aria-label="Pick a student"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
      >
        <i className="fa-solid fa-users" aria-hidden="true"></i>
      </button>
      {showSug && matches.length > 0 && (
        <div className="student-suggestions" style={{ display: 'block' }}>
          {matches.map((s) => {
            const blocked = unschedulableStatus(s.status);
            const isEoc = blocked === 'End of Contract';
            const notSelectable = (schedMode && blocked) || (blockEndOfContract && isEoc);
            const showBadge = blocked && (schedMode || blockEndOfContract);
            const statusBadge = showBadge ? (
              <span className={'badge ' + (isEoc ? 'badge-yellow' : 'badge-red')} style={{ marginLeft: 6 }}>
                {t('acctStatus.' + blocked, blocked)}
              </span>
            ) : null;
            if (notSelectable) {
              return (
                <div
                  key={s.id}
                  className="student-suggestion-item"
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  title={t('acctStatus.' + blocked, blocked)}
                >
                  <span>{s.name}{statusBadge}</span>
                  <StudentMeta student={s} />
                </div>
              );
            }
            return (
              <div
                key={s.id}
                className="student-suggestion-item"
                onMouseDown={() => {
                  // Pass the row too — callers that track student_id use it; the
                  // plain-text callers ignore the extra arg.
                  onChange(s.name, s);
                  setShowSug(false);
                }}
              >
                <span>{s.name}{statusBadge}</span>
                <StudentMeta student={s} />
              </div>
            );
          })}
        </div>
      )}
      <StudentPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        students={students}
        title={pickerTitle}
        blockEndOfContract={blockEndOfContract}
        onPick={(name, s) => onChange(name, s)}
      />
    </div>
  );
}
