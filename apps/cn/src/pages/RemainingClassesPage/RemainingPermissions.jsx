import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { onRealtime } from '../../lib/realtime.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { PERM_LABEL_KEYS } from './remainingConstants.js';

// Admin permissions matrix (legacy renderPermissionsTab + savePermissions).
// Toggles update local state; Save persists each non-master admin via PUT.
export default function RemainingPermissions() {
  const toast = useToast();
  const t = useT();
  const { loadMyPermissions } = useAuth();
  const [keys, setKeys] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [errMsg, setErrMsg] = useState('');
  const [saving, setSaving] = useState(false);
  // Track unsaved local toggles so a live refetch never clobbers an in-progress edit.
  const dirtyRef = useRef(false);

  const load = useCallback(() => {
    return apiFetch('/admin-permissions')
      .then((d) => {
        setKeys(d.keys || []);
        // The master admin (devpau) is never shown in the permissions matrix
        // (its perms can't be changed anyway — the server rejects it).
        setAdmins(
          (d.admins || [])
            .filter((a) => !a.master)
            .map((a) => ({ ...a, perms: { ...a.perms } })),
        );
        dirtyRef.current = false;
        setState('ready');
      })
      .catch((e) => {
        setErrMsg(
          (e.message || '').toLowerCase().includes('forbidden')
            ? t('rperm.noPermission')
            : t('rem.failedToLoad', { msg: e.message || '' }),
        );
        setState('error');
      });
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: another admin was added/removed or had perms changed → refresh the
  // matrix, unless this admin has unsaved local toggles.
  useEffect(
    () =>
      onRealtime('sync', (msg) => {
        if (msg && (msg.resource === 'permissions' || msg.resource === 'admins') && !dirtyRef.current) {
          load();
        }
      }),
    [load],
  );

  const toggle = (ai, key, checked) => {
    dirtyRef.current = true;
    setAdmins((prev) => {
      const next = prev.slice();
      next[ai] = { ...next[ai], perms: { ...next[ai].perms, [key]: checked } };
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    let ok = 0;
    let fail = 0;
    for (const a of admins) {
      if (a.master) continue;
      try {
        await apiFetch('/admin-permissions/' + a.id, 'PUT', { perms: a.perms });
        ok++;
      } catch (e) {
        fail++;
      }
    }
    toast(fail ? t('rperm.savedCount', { ok, fail }) : t('rperm.saved'));
    dirtyRef.current = false; // saved — live refetches may resume
    setSaving(false);
    await loadMyPermissions(); // re-apply my own gating in case I changed it
  };

  return (
    <>
      <div className="filter-bar">
        <span className="filter-label">{t('rperm.intro')}</span>
      </div>
      {state === 'loading' && <SkeletonList count={5} height={52} />}
      {state === 'error' && <div className="notif-empty">{errMsg}</div>}
      {state === 'ready' && admins.length === 0 && (
        <div className="notif-empty">{t('rperm.noAdmins')}</div>
      )}
      {state === 'ready' && admins.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
              <i className={'fa-solid ' + (saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk')}></i>{' '}
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="perms-table">
                <thead>
                  <tr>
                    <th>{t('rperm.admin')}</th>
                    {keys.map((k) => (
                      <th key={k}>{PERM_LABEL_KEYS[k] ? t(PERM_LABEL_KEYS[k]) : k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a, ai) => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{a.fullname || a.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                          @{a.username}
                          {a.master ? ' · ' + t('rperm.master') : ''}
                        </div>
                      </td>
                      {keys.map((k) => (
                        <td key={k} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={!!a.perms[k]}
                            disabled={a.master}
                            onChange={(e) => toggle(ai, k, e.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
