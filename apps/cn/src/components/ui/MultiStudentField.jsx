import { useState, useRef, useEffect } from 'react';
import StudentPickerModal from './StudentPickerModal.jsx';
import StudentMeta from './StudentMeta.jsx';
import { unschedulableStatus } from '../../lib/accountStatus.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Multi-select student field (promo / compensation): pick several students at
// once via the side button's picker, or type to add from the suggestions. Each
// selected student is a removable chip. `value` is an array of entries
// { id, name } — id is the exact student row (duplicate-name-safe); id 0 marks
// a hand-typed name that matched no suggestion. `onChange` receives the next array.
export default function MultiStudentField({ value, onChange, students, placeholder = 'Type or pick students', blockEndOfContract = false }) {
  const t = useT();
  const [text, setText] = useState('');
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

  // An entry is selected when its id matches (linked) or, for typed id-0
  // entries, when the name matches.
  const hasEntry = (list, entry) =>
    list.some((v) =>
      entry.id > 0 ? Number(v.id) === Number(entry.id) : !(Number(v.id) > 0) && v.name === entry.name,
    );
  const entryKey = (v) => (Number(v.id) > 0 ? 'id:' + v.id : 'nm:' + v.name);

  // Add from a suggestion row (exact student) or a hand-typed name (id 0).
  const add = (entry) => {
    const name = String(entry.name || '').trim();
    if (name) {
      const next = { id: Number(entry.id) || 0, name };
      if (!hasEntry(value, next)) onChange([...value, next]);
    }
    setText('');
    setShowSug(false);
  };
  const remove = (entry) => onChange(value.filter((v) => entryKey(v) !== entryKey(entry)));

  const matches =
    text.length >= 1
      ? students
          .filter(
            (s) =>
              String(s.name || '').toLowerCase().includes(text.toLowerCase()) &&
              !hasEntry(value, { id: s.id, name: s.name }),
          )
          .slice(0, 30)
      : [];

  return (
    <div ref={wrapRef}>
      {value.length > 0 && (
        <div className="multi-student-chips">
          {value.map((v) => (
            <span className="multi-student-chip" key={entryKey(v)}>
              {v.name}
              <button type="button" aria-label={'Remove ' + v.name} onClick={() => remove(v)}>
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="student-input-wrap">
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          autoComplete="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setShowSug(true);
          }}
          onFocus={() => {
            if (text) setShowSug(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const top = matches[0];
              const topBlocked = top && blockEndOfContract && unschedulableStatus(top.status) === 'End of Contract';
              if (top && !topBlocked) add({ id: top.id, name: top.name });
              else if (!top && text.trim()) add({ id: 0, name: text });
            }
          }}
        />
        <button
          type="button"
          className="btn btn-secondary student-pick-btn"
          title="Pick students"
          aria-label="Pick students"
          onClick={() => setPickerOpen(true)}
        >
          <i className="fa-solid fa-users" aria-hidden="true"></i>
        </button>
        {showSug && matches.length > 0 && (
          <div className="student-suggestions" style={{ display: 'block' }}>
            {matches.map((s) => {
              const blocked = unschedulableStatus(s.status);
              const notSelectable = blockEndOfContract && blocked === 'End of Contract';
              const badge = blocked ? (
                <span className="bal-badge badge-empty" style={{ marginLeft: 6 }}>{t('acctStatus.' + blocked, blocked)}</span>
              ) : null;
              if (notSelectable) {
                return (
                  <div
                    key={s.id}
                    className="student-suggestion-item"
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                    title={t('acctStatus.' + blocked, blocked)}
                  >
                    <span>{s.name}{badge}</span>
                    <StudentMeta student={s} />
                  </div>
                );
              }
              return (
                <div
                  key={s.id}
                  className="student-suggestion-item"
                  onMouseDown={() => add({ id: s.id, name: s.name })}
                >
                  <span>{s.name}{badge}</span>
                  <StudentMeta student={s} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <StudentPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        students={students}
        title="Select Students"
        multiple
        blockEndOfContract={blockEndOfContract}
        preselected={value.filter((v) => Number(v.id) > 0).map((v) => Number(v.id))}
        onPickMany={(rows) => {
          const next = [...value];
          for (const s of rows) {
            const entry = { id: Number(s.id) || 0, name: String(s.name || '').trim() };
            if (entry.name && !hasEntry(next, entry)) next.push(entry);
          }
          onChange(next);
        }}
      />
    </div>
  );
}
