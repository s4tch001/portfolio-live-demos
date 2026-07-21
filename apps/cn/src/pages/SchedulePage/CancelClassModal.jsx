import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';

// Confirm a class cancellation and capture WHY it was cancelled. The reason is
// stored on the schedule and shown later when the cancelled cell is opened.
export default function CancelClassModal({ open, onClose, schedule, teacherName, onConfirm }) {
  const toast = useToast();
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasonError, setReasonError] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setBusy(false);
      setReasonError(false);
    }
  }, [open]);

  if (!schedule) return null;

  const submit = async () => {
    const r = reason.trim();
    if (!r) {
      // Surface WHY the button didn't proceed: highlight the field + tell the user.
      setReasonError(true);
      toast(t('cancelC.reasonRequired'));
      return;
    }
    setReasonError(false);
    setBusy(true);
    try {
      await onConfirm(r);
    } catch (e) {
      // parent surfaces the error via toast; keep the modal open to retry
    } finally {
      setBusy(false);
    }
  };

  const lines = [
    { label: t('sched.teacher'), value: teacherName || t('sched.unknownTeacher') },
    { label: t('sched.student'), value: schedule.student || '-' },
    { label: t('sched.date'), value: schedule.date || '-' },
    { label: t('sched.time'), value: schedule.timeslot || '-' },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t('cancelC.title')} className="confirm-modal">
      <div className="modal-body">
        <div className="confirm-dialog-message">
          {t('cancelC.message')}
        </div>
        <div className="confirm-dialog-lines">
          {lines.map((l, i) => (
            <div className="confirm-dialog-line" key={i}>
              <span className="confirm-dialog-label">{l.label}:</span>{' '}
              <span>{l.value}</span>
            </div>
          ))}
        </div>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label>{t('cancelC.reasonLabel')}</label>
          <textarea
            className={'form-control' + (reasonError ? ' required-error' : '')}
            placeholder={t('cancelC.reasonPh')}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError && e.target.value.trim()) setReasonError(false);
            }}
            rows={3}
            autoFocus
          />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          {t('cancelC.keep')}
        </button>
        <button className="btn btn-warning" onClick={submit} disabled={busy}>
          <i className="fa-solid fa-ban" aria-hidden="true"></i>{' '}
          {busy ? t('cancelC.cancelling') : t('schedM.cancelClass')}
        </button>
      </div>
    </Modal>
  );
}
