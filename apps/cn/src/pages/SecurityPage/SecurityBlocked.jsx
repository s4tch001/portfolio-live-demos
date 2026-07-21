import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { formatNotifTime } from '../../lib/format.js';
import SecurityCard from './SecurityCard.jsx';

// Moved here from RemainingDevTools — a block list belongs with the rest of the
// security picture, not in Dev Tools next to "clear table data".
//
// Addresses are NOT masked in this table, unlike the traffic panel: the full
// address is the argument to Unblock, so hiding it would be theatre that also
// breaks the feature.
export default function SecurityBlocked() {
  const t = useT();
  const toast = useToast();
  const [blocked, setBlocked] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unblocking, setUnblocking] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setBlocked(await apiFetch('/dev/blocked'));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = async (type, value) => {
    setUnblocking(type + ':' + value);
    try {
      await apiFetch('/dev/unblock', 'POST', { type, value });
      toast(
        type === 'ip'
          ? t('rdev.ipUnblocked', { ip: value })
          : t('rdev.acctUnblocked', { name: value }),
      );
      await load();
    } catch (e) {
      toast(t('rdev.unblockErr', { msg: e.message || String(e) }));
    } finally {
      setUnblocking('');
    }
  };

  const total = blocked ? blocked.accounts.length + blocked.ips.length : 0;

  return (
    <SecurityCard
      className="b-full"
      icon="fa-ban"
      tone="red"
      title={t('rdev.blockedTitle')}
      sub={t('rdev.blockedSub')}
      note={t('sec.fail2banNote')}
      action={
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={refreshing}>
          <i className={'fa-solid fa-rotate' + (refreshing ? ' fa-spin' : '')} aria-hidden="true"></i> {t('rdev.refresh')}
        </button>
      }
    >
      {error ? (
        <div className="notif-empty">
          {t('sec.loadErr', { msg: error.message || String(error) })}
        </div>
      ) : !blocked ? (
        <div className="notif-empty">…</div>
      ) : total === 0 ? (
        <div className="sec-allclear">
          <i className="fa-solid fa-circle-check" aria-hidden="true"></i>
          {t('rdev.noBlocked')}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="sec-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>{t('common.username')}</th>
                <th>{t('rdev.thBlockedAt')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {blocked.accounts.map((a) => (
                <tr key={'acct:' + a.username}>
                  <td>
                    <code className="sec-ip">{a.ip || '--'}</code>
                  </td>
                  <td>
                    <strong>{a.username}</strong>{' '}
                    <span className="sec-role">({a.role})</span>
                  </td>
                  <td className="sec-lastseen">{a.at ? formatNotifTime(a.at) : '--'}</td>
                  <td className="sec-cell-right">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={unblocking === 'account:' + a.username}
                      onClick={() => unblock('account', a.username)}
                    >
                      {unblocking === 'account:' + a.username ? '...' : t('rdev.unblock')}
                    </button>
                  </td>
                </tr>
              ))}
              {blocked.ips.map((i) => (
                <tr key={'ip:' + i.ip}>
                  <td>
                    <code className="sec-ip">{i.ip}</code>
                  </td>
                  <td>--</td>
                  <td className="sec-lastseen">{i.at ? formatNotifTime(i.at) : '--'}</td>
                  <td className="sec-cell-right">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={unblocking === 'ip:' + i.ip}
                      onClick={() => unblock('ip', i.ip)}
                    >
                      {unblocking === 'ip:' + i.ip ? '...' : t('rdev.unblock')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SecurityCard>
  );
}
