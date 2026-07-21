import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import PasswordField from '../../components/ui/PasswordField.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { normalizeAccountStatus } from '../../lib/accountStatus.js';

export default function AdminModal({ open, onClose, admin, isUsernameTaken, onSave }) {
  const toast = useToast();
  const t = useT();
  const [fullname, setFullname] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invalid, setInvalid] = useState({});
  const [busy, setBusy] = useState(false);
  const editId = admin ? admin.id : '';

  useEffect(() => {
    if (open) {
      setFullname(admin?.fullname || '');
      setUsername(admin?.username || '');
      setPassword('');
      setInvalid({});
      setBusy(false);
    }
  }, [open, admin]);

  const clearMark = (k) => setInvalid((p) => ({ ...p, [k]: false }));
  const mark = (k) => setInvalid((p) => ({ ...p, [k]: true }));

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
      status: admin ? normalizeAccountStatus(admin.status) : 'Active',
    };
    if (password) payload.password = password;
    try {
      await onSave(payload, !!editId);
    } catch (e) {
      if (/username/i.test(e.message || '')) mark('username');
      toast(t('common.error') + ': ' + (e.message || t('acct.couldNotSaveAdmin')));
    } finally {
      setBusy(false);
    }
  };

  const cls = (k) => 'form-control' + (invalid[k] ? ' required-error' : '');

  return (
    <Modal open={open} onClose={onClose} title={admin ? t('acct.editAdmin') : t('acct.addAdmin')}>
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group">
            <label>{t('common.fullName')}</label>
            <input
              type="text"
              className={cls('fullname')}
              placeholder={t('acct.phAdminName')}
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
              placeholder={t('acct.phAdminUser')}
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
            placeholder={admin ? t('acct.phPwKeep') : t('acct.phPwEnter')}
            className={cls('password')}
          />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? t('common.saving') : t('acct.saveAdmin')}
        </button>
      </div>
    </Modal>
  );
}
