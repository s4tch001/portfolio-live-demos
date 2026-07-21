import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PasswordField from '../../components/ui/PasswordField.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { normalizeAccountStatus } from '../../lib/accountStatus.js';

// Teacher color choices (legacy account-color-choices). Label is a translation key.
const COLORS = [
  ['#2563eb', 'acct.colorBlue'],
  ['#16a34a', 'acct.colorGreen'],
  ['#7c3aed', 'acct.colorPurple'],
  ['#ea580c', 'acct.colorOrange'],
  ['#dc2626', 'acct.colorRed'],
  ['#0891b2', 'acct.colorTeal'],
  ['#be185d', 'acct.colorPink'],
];

export default function TeacherModal({ open, onClose, teacher, isUsernameTaken, onSave }) {
  const toast = useToast();
  const t = useT();
  const [fullname, setFullname] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [invalid, setInvalid] = useState({});
  const [busy, setBusy] = useState(false);
  const editId = teacher ? teacher.id : '';

  useEffect(() => {
    if (open) {
      setFullname(teacher?.fullname || '');
      setUsername(teacher?.username || '');
      setPassword('');
      setColor(teacher?.color || '#2563eb');
      setInvalid({});
      setBusy(false);
    }
  }, [open, teacher]);

  const mark = (k) => setInvalid((p) => ({ ...p, [k]: true }));
  const clearMark = (k) => setInvalid((p) => ({ ...p, [k]: false }));

  const save = async () => {
    const inv = {};
    if (!fullname.trim()) inv.fullname = true;
    if (!username.trim()) inv.username = true;
    if (!editId && !password.trim()) inv.password = true;
    let usernameMsgShown = false;
    if (username.trim() && isUsernameTaken(username, editId) && !inv.username) {
      inv.username = true;
      toast(t('toast.usernameExists'));
      usernameMsgShown = true;
    }
    setInvalid(inv);
    if (Object.keys(inv).length) {
      if (!usernameMsgShown) toast(t('toast.completeRequired'));
      return;
    }
    setBusy(true);
    const payload = {
      fullname: fullname.trim(),
      username: username.trim(),
      color,
      status: teacher ? normalizeAccountStatus(teacher.status) : 'Active',
    };
    if (password) payload.password = password;
    try {
      await onSave(payload, !!editId);
    } catch (e) {
      if (/username/i.test(e.message || '')) mark('username');
      toast(t('common.error') + ': ' + (e.message || t('acct.couldNotSaveTeacher')));
    } finally {
      setBusy(false);
    }
  };

  const cls = (k) => 'form-control' + (invalid[k] ? ' required-error' : '');

  return (
    <Modal open={open} onClose={onClose} title={teacher ? t('acct.editTeacher') : t('acct.addTeacher')}>
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group">
            <label>{t('common.fullName')}</label>
            <input
              type="text"
              className={cls('fullname')}
              placeholder={t('acct.phTeacherName')}
              value={fullname}
              onChange={(e) => {
                setFullname(e.target.value);
                clearMark('fullname');
              }}
            />
          </div>
          <div className="form-group">
            <label>{t('common.username')}</label>
            <input
              type="text"
              className={cls('username')}
              placeholder={t('acct.phTeacherUser')}
              maxLength={20}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearMark('username');
              }}
            />
          </div>
        </div>
        <div className="form-group">
          <label>{t('common.password')}</label>
          <PasswordField
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearMark('password');
            }}
            placeholder={teacher ? t('acct.phPwKeep') : t('acct.phPwEnter')}
            className={cls('password')}
          />
        </div>
        <div className="form-group">
          <label>{t('acct.color')}</label>
          <div className="color-choice-list">
            {COLORS.map(([hex, labelKey]) => (
              <button
                type="button"
                key={hex}
                className={'color-choice' + (color === hex ? ' active' : '')}
                onClick={() => setColor(hex)}
              >
                <span>{t(labelKey)}</span>
                <span className="color-swatch" style={{ background: hex }}></span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? t('common.saving') : t('acct.saveTeacher')}
        </button>
      </div>
    </Modal>
  );
}
