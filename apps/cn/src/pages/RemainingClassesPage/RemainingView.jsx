import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { unschedulableStatus } from '../../lib/accountStatus.js';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { onRealtime } from '../../lib/realtime.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { useReceiptModal } from './ReceiptModalContext.jsx';

// Compute a student's balance display state (legacy renderRemainingList).
// `badgeKey` is translated at render; `badgeEn` (English) feeds the search index.
function enrich(s) {
  // '' when schedulable, else the status label ('Inactive' | 'End of Contract').
  const inactive = unschedulableStatus(s.status);
  const monthly = !!s.has_monthly_fee;
  const bal = Number(s.balance) || 0;
  let stateClass, badgeClass, badgeKey, badgeEn, label;
  if (monthly) {
    stateClass = 'bal-monthly';
    badgeClass = 'badge-monthly';
    badgeKey = 'rview.monthlyFee';
    badgeEn = 'Monthly Fee';
    label = '∞';
  } else if (bal <= 0) {
    stateClass = 'bal-empty';
    badgeClass = 'badge-empty';
    badgeKey = 'rview.noClasses';
    badgeEn = 'No classes';
    label = String(bal);
  } else if (bal <= 5) {
    stateClass = 'bal-low';
    badgeClass = 'badge-low';
    badgeKey = 'rview.lowBalance';
    badgeEn = 'Low balance';
    label = String(bal);
  } else {
    stateClass = 'bal-ok';
    badgeClass = 'badge-ok';
    badgeKey = 'rview.active';
    badgeEn = 'Active';
    label = String(bal);
  }
  return { s, inactive, monthly, bal, stateClass, badgeClass, badgeKey, badgeEn, label };
}

export default function RemainingView() {
  const t = useT();
  const [balances, setBalances] = useState(null);
  const [search, setSearch] = useState('');
  const { openList, onChanged } = useReceiptModal();

  const load = useCallback(() => {
    apiFetch('/class-balances')
      .then((d) => setBalances(Array.isArray(d) ? d : []))
      .catch(() => setBalances([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch balances when a delete inside the receipt modal changes the data.
  useEffect(() => onChanged(load), [onChanged, load]);

  // Live: another user changed a receipt/transaction or a student → refresh balances.
  useEffect(
    () =>
      onRealtime('sync', (msg) => {
        if (msg && (msg.resource === 'transactions' || msg.resource === 'students')) load();
      }),
    [load],
  );

  const sorted = useMemo(() => {
    if (!Array.isArray(balances)) return [];
    const q = search.trim().toLowerCase();
    const enriched = balances.map(enrich);
    const filtered = q
      ? enriched.filter((e) =>
          [e.s.name, e.badgeEn, e.inactive || '', e.label]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : enriched;
    return filtered.slice().sort((A, B) => {
      const ai = A.inactive ? 1 : 0;
      const bi = B.inactive ? 1 : 0;
      if (ai !== bi) return ai - bi;
      if (!ai) {
        const diff = (B.monthly ? Infinity : B.bal) - (A.monthly ? Infinity : A.bal);
        if (diff) return diff;
      }
      return String(A.s.name || '').localeCompare(String(B.s.name || ''));
    });
  }, [balances, search]);

  return (
    <>
      <div className="filter-bar">
        <span className="filter-label" id="remaining-view-total">{t('rview.totalStudents', { n: sorted.length })}</span>
        <input
          type="search"
          className="form-control"
          placeholder={t('rview.searchPh')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      {balances === null ? (
        <SkeletonList count={6} height={68} />
      ) : sorted.length === 0 ? (
        <div className="notif-empty">{t('rview.noStudents')}</div>
      ) : (
        <div className="remaining-view-grid" id="remaining-view-list">
          {sorted.map((e) => (
            <button
              type="button"
              key={e.s.id}
              className={'remaining-balance-card ' + e.stateClass}
              onClick={() => openList(e.s.id, e.s.name)}
            >
              <span className="rbc-avatar">{(e.s.name || '?').charAt(0).toUpperCase()}</span>
              <span className="rbc-main">
                {/* Stacked so long username/info stay readable: name, then the
                    login username, then the admin note (Info), then the badges. */}
                <span className="rbc-name">{e.s.name}</span>
                <span className="rbc-sub">{e.s.username || '—'}</span>
                {e.s.notes ? <span className="rbc-sub rbc-info">{e.s.notes}</span> : null}
                <span className="rbc-badges">
                  <span className={'bal-badge ' + e.badgeClass}>{t(e.badgeKey)}</span>
                  {e.inactive && <span className="bal-badge badge-empty">{t('acctStatus.' + e.inactive)}</span>}
                </span>
              </span>
              <span className="rbc-count">
                {e.label}
                <small>{t('rview.classesSmall')}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
