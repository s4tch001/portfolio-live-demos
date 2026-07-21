import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PasswordField from '../../components/ui/PasswordField.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';

const hintStyle = {
  fontWeight: 400,
  textTransform: 'none',
  color: 'var(--text3)',
};

// Add/Edit student modal. China build: every student is a login account, so
// username + password are captured here. On edit, a blank password keeps the
// current one (same pattern as the teacher/admin modals).
export default function StudentModal({ open, onClose, student, teachers, onSave }) {
  const toast = useToast();
  const t = useT();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [teacherId, setTeacherId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState({});
  const editing = !!student;

  useEffect(() => {
    if (open) {
      setName(student?.name || '');
      setUsername(student?.username || '');
      setPassword('');
      setNotes(student?.notes || '');
      setTeacherId(student?.teacher_id || 0);
      setBusy(false);
      setInvalid({});
    }
  }, [open, student]);

  const mark = (k) => setInvalid((p) => ({ ...p, [k]: true }));
  const clearMark = (k) => setInvalid((p) => ({ ...p, [k]: false }));

  const save = async () => {
    const inv = {};
    if (!name.trim()) inv.name = true;
    if (!username.trim()) inv.username = true;
    // Password required only when creating; on edit, blank = keep unchanged.
    if (!editing && !password.trim()) inv.password = true;
    setInvalid(inv);
    if (Object.keys(inv).length) {
      toast('Please complete the highlighted required fields.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        username: username.trim(),
        notes: notes.trim(),
        teacher_id: Number(teacherId) || 0,
      };
      if (password) payload.password = password;
      await onSave(payload);
    } catch (e) {
      if (/username/i.test(e.message || '')) mark('username');
      toast('Error: ' + (e.message || 'Could not save student'));
    } finally {
      setBusy(false);
    }
  };

  const cls = (k) => 'form-control' + (invalid[k] ? ' required-error' : '');

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('students.edit') : t('students.add')}>
      <div className="modal-body">
        <div className="form-group">
          <label>{t('students.name')}</label>
          <input
            type="text"
            className={cls('name')}
            placeholder="e.g. Maria Santos"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearMark('name');
            }}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('students.username')} <span style={hintStyle}>({t('students.usernameHint')})</span></label>
            <input
              type="text"
              className={cls('username')}
              placeholder={t('students.usernamePh')}
              maxLength={20}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearMark('username');
              }}
            />
          </div>
          <div className="form-group">
            <label>{t('students.password')}</label>
            <PasswordField
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearMark('password');
              }}
              placeholder={editing ? t('students.keepPassword') : t('students.enterPassword')}
              className={cls('password')}
            />
          </div>
        </div>
        <div className="form-group">
          <label>
            {t('students.handlingTeacher')} <span style={hintStyle}>({t('common.optional')})</span>
          </label>
          <select
            className="form-control"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          >
            <option value="0">{t('students.noHandler')}</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullname}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>
            {t('students.info')} <span style={hintStyle}>({t('common.optional')})</span>
          </label>
          <input
            type="text"
            className="form-control"
            placeholder={t('students.infoPlaceholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? t('common.loading') : t('students.saveStudent')}
        </button>
      </div>
    </Modal>
  );
}
