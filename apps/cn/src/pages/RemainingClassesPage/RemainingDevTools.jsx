import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useConfirm } from '../../context/ConfirmProvider.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import PasswordField from '../../components/ui/PasswordField.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { DEV_TABLES } from './remainingConstants.js';

// Dev Tools — master admin only. Clear table data (legacy renderDevToolsTab +
// clearCheckedDevTables). Destructive: deletes rows only, keeps admin accounts.
export default function RemainingDevTools() {
  const toast = useToast();
  const showConfirm = useConfirm();
  const { isMasterAdmin } = useAuth();
  // `t` is used as the table arrow-param below, so the translator is `tr`.
  const tr = useT();
  const [checked, setChecked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [hideDev, setHideDev] = useState(false);
  const [hideDevSaving, setHideDevSaving] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [pentestAccounts, setPentestAccounts] = useState([]);
  const [pentestSel, setPentestSel] = useState('');
  const [pentestCurrent, setPentestCurrent] = useState('');
  const [pentestSaving, setPentestSaving] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const master = isMasterAdmin();

  const changePassword = async () => {
    if (!curPw || !newPw) {
      toast(tr('rdev.enterPw'));
      return;
    }
    if (newPw.length < 6) {
      toast(tr('rdev.pwMin6'));
      return;
    }
    if (newPw !== confirmPw) {
      toast(tr('rdev.pwMismatch'));
      return;
    }
    setPwSaving(true);
    try {
      await apiFetch('/dev/change-password', 'POST', { current_password: curPw, new_password: newPw });
      toast(tr('rdev.pwChanged'));
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e) {
      toast(tr('rdev.pwErr', { msg: e.message || String(e) }));
    } finally {
      setPwSaving(false);
    }
  };

  // Load the "hide dev from logs" + maintenance settings (master only).
  useEffect(() => {
    if (!master) return;
    let alive = true;
    apiFetch('/dev/log-settings')
      .then((d) => alive && setHideDev(!!(d && d.hide_dev_logs)))
      .catch(() => {});
    apiFetch('/dev/maintenance')
      .then((d) => alive && setMaintenance(!!(d && d.maintenance)))
      .catch(() => {});
    apiFetch('/dev/pentest-account')
      .then((d) => {
        if (!alive || !d) return;
        setPentestAccounts(Array.isArray(d.accounts) ? d.accounts : []);
        setPentestCurrent(d.username || '');
        setPentestSel(d.username || '');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [master]);

  const applyPentest = async () => {
    setPentestSaving(true);
    try {
      const res = await apiFetch('/dev/pentest-account', 'POST', { username: pentestSel });
      const u = (res && res.username) || '';
      setPentestCurrent(u);
      setPentestSel(u);
      toast(u ? tr('rdev.pentestSet', { u }) : tr('rdev.pentestCleared'));
    } catch (e) {
      toast(tr('rdev.pentestErr', { msg: e.message || String(e) }));
    } finally {
      setPentestSaving(false);
    }
  };

  const toggleMaintenance = async () => {
    const next = !maintenance;
    setMaintenanceSaving(true);
    setMaintenance(next); // optimistic
    try {
      await apiFetch('/dev/maintenance', 'POST', { on: next });
      toast(next ? tr('rdev.maintOn') : tr('rdev.maintOff'));
    } catch (e) {
      setMaintenance(!next); // revert on failure
      toast(tr('rdev.maintErr', { msg: e.message || String(e) }));
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const toggleHideDev = async () => {
    const next = !hideDev;
    setHideDevSaving(true);
    setHideDev(next); // optimistic
    try {
      await apiFetch('/dev/log-settings', 'POST', { hide: next });
      toast(next ? tr('rdev.hideOn') : tr('rdev.hideOff'));
    } catch (e) {
      setHideDev(!next); // revert on failure
      toast(tr('rdev.settingErr', { msg: e.message || String(e) }));
    } finally {
      setHideDevSaving(false);
    }
  };

  if (!master) {
    return (
      <div className="remaining-devtools-stack">
        <div className="filter-bar">
          <span className="filter-label">{tr('rdev.clearIntro')}</span>
        </div>
        <div className="notif-empty">{tr('rdev.masterOnly')}</div>
      </div>
    );
  }

  const toggle = (table) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });

  const clear = async () => {
    const tables = DEV_TABLES.filter((t) => checked.has(t.table));
    if (!tables.length) {
      toast(tr('rdev.selectTable'));
      return;
    }
    const labels = tables.map((t) => tr(t.labelKey));
    const ok = await showConfirm({
      title: tr('rdev.clearConfirmTitle'),
      message: tr('rdev.clearConfirmMsg', { tables: labels.join(', ') }),
      okText: tr('rdev.clear'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    let okCount = 0;
    let fail = 0;
    for (const t of tables) {
      try {
        await apiFetch('/dev/clear-table', 'POST', { table: t.table });
        okCount++;
      } catch (e) {
        fail++;
      }
    }
    toast(fail ? tr('rdev.clearedResult', { ok: okCount, fail }) : tr('rdev.cleared', { tables: labels.join(', ') }));
    setChecked(new Set());
    setBusy(false);
  };

  return (
    <div className="remaining-devtools-stack">
      <div className="filter-bar">
        <span className="filter-label">
          {tr('rdev.clearIntroFull')}
        </span>
      </div>
      <div className="card">
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 14,
          }}
        >
          <div>
            <div className="page-title" style={{ margin: 0 }}>
              {tr('rdev.clearTitle')}
            </div>
            <p className="page-sub" style={{ margin: '4px 0 0' }}>
              {tr('rdev.clearSub')}
            </p>
          </div>
          <button className="btn btn-danger" onClick={clear} disabled={busy}>
            <i className="fa-solid fa-trash-can"></i> {busy ? tr('rdev.clearing') : tr('rdev.clear')}
          </button>
        </div>
        <div className="dev-table-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DEV_TABLES.map((t) => (
            <label
              key={t.table}
              className="dev-table-row"
              style={{
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 12, padding: '11px 14px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)',
              }}
            >
              <span className="dev-table-name" style={{ fontWeight: 600 }}>
                <i className={'fa-solid ' + t.icon} style={{ marginRight: 8, color: 'var(--text3)' }}></i>
                {tr(t.labelKey)}
              </span>
              <input
                type="checkbox"
                checked={checked.has(t.table)}
                onChange={() => toggle(t.table)}
                style={{ width: 18, height: 18, flexShrink: 0 }}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="page-title" style={{ margin: 0 }}>
          {tr('rdev.logPrivacy')}
        </div>
        <p className="page-sub" style={{ margin: '4px 0 14px' }}>
          {tr('rdev.logPrivacySub')}
        </p>
        <label
          className="dev-table-row"
          style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, padding: '11px 14px',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)',
          }}
        >
          <span className="dev-table-name" style={{ fontWeight: 600 }}>
            <i className="fa-solid fa-user-secret" style={{ marginRight: 8, color: 'var(--text3)' }}></i>
            {tr('rdev.hideDevLabel')}
          </span>
          <input
            type="checkbox"
            checked={hideDev}
            onChange={toggleHideDev}
            disabled={hideDevSaving}
            style={{ width: 18, height: 18, flexShrink: 0 }}
          />
        </label>
      </div>

      <div className="card">
        <div className="page-title" style={{ margin: 0 }}>
          {tr('rdev.maintenance')}
        </div>
        <p className="page-sub" style={{ margin: '4px 0 14px' }}>
          {tr('rdev.maintenanceSub')}
        </p>
        <label
          className="dev-table-row"
          style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, padding: '11px 14px',
            border: '1px solid ' + (maintenance ? 'var(--red)' : 'var(--border)'),
            borderRadius: 'var(--radius)', background: 'var(--surface)',
          }}
        >
          <span className="dev-table-name" style={{ fontWeight: 600 }}>
            <i className="fa-solid fa-screwdriver-wrench" style={{ marginRight: 8, color: maintenance ? 'var(--red)' : 'var(--text3)' }}></i>
            {tr('rdev.maintenanceLabel')}
            {maintenance && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>{tr('rdev.on')}</span>}
          </span>
          <input
            type="checkbox"
            checked={maintenance}
            onChange={toggleMaintenance}
            disabled={maintenanceSaving}
            style={{ width: 18, height: 18, flexShrink: 0 }}
          />
        </label>
      </div>

      <div className="card">
        <div className="page-title" style={{ margin: 0 }}>
          {tr('rdev.pentest')}
        </div>
        <p className="page-sub" style={{ margin: '4px 0 14px' }}>
          {tr('rdev.pentestSub')}
        </p>
        <p className="page-sub" style={{ margin: '0 0 14px', color: 'var(--red)' }}>
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>{' '}
          {tr('rdev.pentestWarn')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <select
            className="form-control"
            value={pentestSel}
            onChange={(e) => setPentestSel(e.target.value)}
            style={{ maxWidth: 340 }}
          >
            <option value="">{tr('rdev.pentestNone')}</option>
            {pentestAccounts.map((a) => (
              <option key={a.role + ':' + a.username} value={a.username}>
                {a.username} ({a.role})
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={applyPentest}
            disabled={pentestSaving || pentestSel === pentestCurrent}
          >
            <i className="fa-solid fa-user-shield" aria-hidden="true"></i>{' '}
            {pentestSaving ? tr('common.saving') : tr('rdev.apply')}
          </button>
        </div>
        <p className="page-sub" style={{ margin: '10px 0 0' }}>
          {tr('rdev.currentlyExemptPre')}<strong>{pentestCurrent ? pentestCurrent : tr('rdev.noneWord')}</strong>
        </p>
      </div>

      <div className="card">
        <div className="page-title" style={{ margin: 0 }}>
          {tr('rdev.changePw')}
        </div>
        <p className="page-sub" style={{ margin: '4px 0 14px' }}>
          {tr('rdev.changePwSub')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          <div className="form-group">
            <label>{tr('rdev.currentPw')}</label>
            <PasswordField
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              placeholder={tr('rdev.currentPwPh')}
              className="form-control"
            />
          </div>
          <div className="form-group">
            <label>{tr('rdev.newPw')}</label>
            <PasswordField
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder={tr('rdev.newPwPh')}
              className="form-control"
            />
          </div>
          <div className="form-group">
            <label>{tr('rdev.confirmPw')}</label>
            <PasswordField
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder={tr('rdev.confirmPwPh')}
              className="form-control"
            />
          </div>
          <div>
            <button className="btn btn-primary" onClick={changePassword} disabled={pwSaving}>
              <i className="fa-solid fa-key" aria-hidden="true"></i>{' '}
              {pwSaving ? tr('common.saving') : tr('rdev.changePwBtn')}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
