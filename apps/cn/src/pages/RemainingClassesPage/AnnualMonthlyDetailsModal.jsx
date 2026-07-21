import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { apiFetch } from '../../lib/apiClient.js';
import { buildMonthlyLedger, monthlyPaymentLine, ordinal } from '../../lib/receiptCard.js';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Read-only breakdown of a student's monthly-fee payments (1st = enrollment,
// then each recorded payment). Opened from the Annual Report "Monthly fee
// students" list via the view-details button. Fetches the student's ledger on
// demand so the annual summary payload stays lean.
export default function AnnualMonthlyDetailsModal({ open, onClose, student }) {
  const t = useT();
  const [ledger, setLedger] = useState('loading'); // 'loading' | 'error' | array
  const studentId = student && student.student_id;
  const studentName = (student && student.name) || '';

  useEffect(() => {
    if (!open || !studentId) return undefined;
    let alive = true;
    setLedger('loading');
    apiFetch('/class-transactions?student_id=' + studentId)
      .then((txns) => {
        if (alive) setLedger(buildMonthlyLedger(txns));
      })
      .catch(() => {
        if (alive) setLedger('error');
      });
    return () => {
      alive = false;
    };
  }, [open, studentId]);

  return (
    <Modal open={open} onClose={onClose} title={t('rmod.typeMonthlyFee')} maxWidth="768px">
      <div className="modal-body">
        <div className="annual-mf-head">
          <i className="fa-solid fa-infinity"></i>
          <span>{t('rmod.typeMonthlyFee')} · <strong>{studentName}</strong></span>
        </div>
        {ledger === 'loading' ? (
          <div className="notif-empty"><span className="spinner"></span> {t('common.loading')}</div>
        ) : ledger === 'error' ? (
          <div className="notif-empty">{t('amf.failedPayments')}</div>
        ) : !ledger.length ? (
          <div className="notif-empty">{t('amf.noPayments')}</div>
        ) : (
          <ol className="annual-mf-list">
            {ledger.map((p, i) => (
              <li key={p.id}>
                <span className="annual-mf-ord">{t('amf.nthPayment', { ord: ordinal(i + 1), n: i + 1 })}</span>
                <span className="annual-mf-detail">{monthlyPaymentLine(p, t)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}
