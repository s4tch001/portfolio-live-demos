import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import StudentMeta from './StudentMeta.jsx';
import { unschedulableStatus } from '../../lib/accountStatus.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Click-to-pick student list (legacy modal-student-picker). Searchable.
// Single mode: one click selects (onPick(name, row)). Multiple mode: checkboxes
// keyed by student ID (duplicate names stay distinct rows) + an "Add" button
// that returns every checked student ROW (onPickMany) — used by promo/
// compensation where the additional classes go to several students at once.
// `preselected` = array of student ids.
export default function StudentPickerModal({
  open,
  onClose,
  students,
  onPick,
  onPickMany,
  multiple = false,
  preselected = [],
  title = null,
  // When true, End-of-Contract students can't be picked (their contract ended);
  // Inactive students stay selectable but are badged. Matches the Add Schedule flow.
  blockEndOfContract = false,
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(new Set());

  useEffect(() => {
    if (open) {
      setQ('');
      setPicked(new Set((preselected || []).map(Number)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Search matches name, login username, AND info/notes (not just the name).
  const filtered = students
    .filter((s) => {
      const query = q.trim().toLowerCase();
      if (!query) return true;
      return [s.name, s.username, s.notes].some((v) => String(v || '').toLowerCase().includes(query));
    })
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmMany = () => {
    onPickMany(students.filter((s) => picked.has(Number(s.id))));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title || t('spick.selectStudent')} maxWidth="460px">
      <div className="modal-body">
        <input
          type="search"
          className="form-control"
          placeholder={t('spick.searchPh')}
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div className="student-picker-list">
          {filtered.length === 0 ? (
            <div className="notif-empty">{t('rview.noStudents')}</div>
          ) : (
            filtered.map((s) => {
              // unschedulableStatus → 'Inactive' | 'End of Contract' | ''. The badge
              // shows the ACTUAL status (was hardcoded 'Inactive', which mislabelled
              // End-of-Contract students). EOC is blocked from selection when asked.
              const blocked = unschedulableStatus(s.status);
              const statusLabel = blocked ? t('acctStatus.' + blocked, blocked) : '';
              const notSelectable = blockEndOfContract && blocked === 'End of Contract';
              if (multiple) {
                const checked = picked.has(Number(s.id));
                return (
                  <label
                    className={'student-picker-item' + (checked ? ' picked' : '')}
                    key={s.id}
                    style={{ cursor: notSelectable ? 'not-allowed' : 'pointer', opacity: notSelectable ? 0.55 : 1 }}
                    title={notSelectable ? `${statusLabel}` : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={notSelectable}
                      onChange={() => toggle(Number(s.id))}
                      style={{ marginRight: 10, flexShrink: 0 }}
                    />
                    <span>{s.name}</span>
                    {s.has_monthly_fee ? <span className="bal-badge badge-monthly">{t('ryear.tagMonthly')}</span> : null}
                    {blocked ? <span className="bal-badge badge-empty">{statusLabel}</span> : null}
                    <StudentMeta student={s} />
                  </label>
                );
              }
              if (notSelectable) {
                return (
                  <div
                    className="student-picker-item"
                    key={s.id}
                    style={{ opacity: 0.55, cursor: 'not-allowed' }}
                    title={statusLabel}
                  >
                    <span>{s.name}</span>
                    {s.has_monthly_fee ? <span className="bal-badge badge-monthly">{t('ryear.tagMonthly')}</span> : null}
                    <span className="bal-badge badge-empty">{statusLabel}</span>
                    <StudentMeta student={s} />
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  className="student-picker-item"
                  key={s.id}
                  onClick={() => {
                    // Second arg = the full student row so callers can keep the exact
                    // student id (names may be duplicated); old callers ignore it.
                    onPick(s.name, s);
                    onClose();
                  }}
                >
                  <span>{s.name}</span>
                  {s.has_monthly_fee ? <span className="bal-badge badge-monthly">{t('ryear.tagMonthly')}</span> : null}
                  {blocked ? <span className="bal-badge badge-empty">{statusLabel}</span> : null}
                  <StudentMeta student={s} />
                </button>
              );
            })
          )}
        </div>
      </div>
      {multiple && (
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={confirmMany} disabled={picked.size === 0}>
            {picked.size === 0
              ? t('spick.add')
              : t(picked.size === 1 ? 'spick.addOne' : 'spick.addMany', { n: picked.size })}
          </button>
        </div>
      )}
    </Modal>
  );
}
