import { normalizeAccountStatus } from '../../lib/accountStatus.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Green (Active) / yellow (End of Contract) / red (Inactive | Login Blocked) status badge —
// matches legacy renderAccountStatusBadge, plus the End-of-Contract state.
// variant="account" → staff terms (enabled/disabled); default → student enrollment terms.
export default function StatusBadge({ account, status, variant }) {
  const t = useT();
  const s = normalizeAccountStatus(account ? account.status : status);
  const cls = s === 'Active' ? 'badge-green' : s === 'End of Contract' ? 'badge-yellow' : 'badge-red';
  const prefix = variant === 'account' ? 'acctStatus.' : 'status.';
  return <span className={'badge ' + cls}>{t(prefix + s, s)}</span>;
}
