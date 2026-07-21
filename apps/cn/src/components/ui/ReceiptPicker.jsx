import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { getNextReceiptNo, getStudentReceipts, resolveStudentId } from '../../lib/receipts.js';

// Receipt number field (legacy renderReceiptPicker). Type-able input + a body:
//   mode 'new'  (Class Package): auto-generate a fresh no. + "Generate New No."
//   mode 'pick' (Manual / Monthly Fee): quick-pick chips of the student's own
//                receipts + "New Receipt".
// `studentId` (optional): the exact row id captured by the caller's picker —
// wins over the name lookup so duplicate names resolve to the right student.
export default function ReceiptPicker({ studentName, studentId = 0, value, onChange, mode = 'pick' }) {
  const toast = useToast();
  const t = useT();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const name = (studentName || '').trim();

  useEffect(() => {
    let alive = true;
    if (!name) {
      setReceipts([]);
      return;
    }
    if (mode === 'new') {
      // Auto-generate once if empty; admin can still type/regenerate.
      if (!value) {
        getNextReceiptNo().then((n) => {
          if (alive && n) onChange(n);
        });
      }
      return;
    }
    setLoading(true);
    (async () => {
      const sid = Number(studentId) > 0 ? Number(studentId) : await resolveStudentId(name);
      const list = sid ? await getStudentReceipts(sid) : [];
      if (alive) {
        setReceipts(list);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, studentId, mode]);

  const generateNew = async () => {
    const next = await getNextReceiptNo();
    if (!next) {
      toast(t('rpick.couldNotGen'));
      return;
    }
    onChange(next);
  };

  return (
    <div className="receipt-picker">
      <input
        type="text"
        className="form-control receipt-input"
        placeholder={t('rpick.placeholder')}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="receipt-picker-body">
        {!name ? (
          <span className="receipt-picker-hint">{t('rpick.pickStudentFirst')}</span>
        ) : mode === 'new' ? (
          <>
            <button type="button" className="btn btn-sm btn-secondary receipt-new-btn" style={{ marginLeft: 0 }} onClick={generateNew}>
              <i className="fa-solid fa-rotate"></i> {t('rpick.generateNew')}
            </button>
            <span className="receipt-picker-note" style={{ marginLeft: 8 }}>
              {t('rpick.customHint')}
            </span>
          </>
        ) : loading ? (
          <span className="receipt-picker-hint">{t('common.loading')}</span>
        ) : (
          <>
            <div className="receipt-chip-row">
              {receipts.length ? (
                receipts.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={'receipt-chip' + (r === value ? ' active' : '')}
                    onClick={() => onChange(r)}
                  >
                    {r}
                  </button>
                ))
              ) : (
                <span className="receipt-picker-hint">{t('rpick.noReceipts')}</span>
              )}
            </div>
            <button type="button" className="btn btn-sm btn-secondary receipt-new-btn" onClick={generateNew}>
              <i className="fa-solid fa-plus"></i> {t('rpick.newReceipt')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
