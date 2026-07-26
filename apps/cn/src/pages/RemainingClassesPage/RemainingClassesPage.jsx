import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { REMAINING_TABS } from './remainingConstants.js';
import RemainingView from './RemainingView.jsx';
import RemainingPermissions from './RemainingPermissions.jsx';
import RemainingDevTools from './RemainingDevTools.jsx';
import RemainingModify from './RemainingModify.jsx';
import RemainingReceipts from './RemainingReceipts.jsx';
import RemainingYearly from './RemainingYearly.jsx';
import { ReceiptModalProvider } from './ReceiptModalContext.jsx';

// Remaining Classes page: permission-gated sub-tabs, each with its own URL
// (/remaining-classes/<tab>) so a refresh restores the exact sub-tab.
export default function RemainingClassesPage() {
  const { myPerm, isMasterAdmin } = useAuth();
  const tr = useT();
  const params = useParams();
  const navigate = useNavigate();

  const currentId = (params['*'] || '').split('/')[0];
  const isVisible = (t) => (t.master ? isMasterAdmin() : myPerm(t.perm));
  const visibleTabs = REMAINING_TABS.filter(isVisible);
  const activeTab = visibleTabs.find((t) => t.id === currentId) || visibleTabs[0];

  // If the URL points at a tab this admin can't see (or none), redirect to the
  // first permitted tab (legacy ensureAllowedRemainingTab).
  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!visibleTabs.find((t) => t.id === currentId)) {
      navigate('/remaining-classes/' + visibleTabs[0].id, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, visibleTabs.length]);

  if (!visibleTabs.length) {
    return (
      <section className="page active" id="page-remaining-classes">
        <div className="notif-empty">{tr('rtab.noAccess')}</div>
      </section>
    );
  }

  return (
    <section className="page active" id="page-remaining-classes">
      <div className="page-header">
        <div>
          <div className="page-title">{tr('rtab.title')}</div>
          <div className="page-sub">{tr('rtab.subtitle')}</div>
        </div>
      </div>
      <div className="tab-bar" id="remaining-tab-bar">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            className={'tab-btn' + (activeTab.id === t.id ? ' active' : '')}
            onClick={() => navigate('/remaining-classes/' + t.id)}
            title={tr(t.labelKey)}
          >
            <i className={'fa-solid ' + t.icon} aria-hidden="true"></i>
            <span className="tab-label">{tr(t.labelKey)}</span>
          </button>
        ))}
      </div>
      <ReceiptModalProvider>
        <div className="tab-pane active">
          {activeTab.id === 'modify' && <RemainingModify />}
          {activeTab.id === 'view' && <RemainingView />}
          {activeTab.id === 'receipts' && <RemainingReceipts />}
          {activeTab.id === 'yearly' && <RemainingYearly />}
          {activeTab.id === 'permissions' && <RemainingPermissions />}
          {activeTab.id === 'devtools' && <RemainingDevTools />}
        </div>
      </ReceiptModalProvider>
    </section>
  );
}
