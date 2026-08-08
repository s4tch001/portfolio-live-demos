import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/apiClient.js';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import StudentField from '../../components/ui/StudentField.jsx';
import MultiStudentField from '../../components/ui/MultiStudentField.jsx';
import ReceiptPicker from '../../components/ui/ReceiptPicker.jsx';
import { useReceiptModal } from './ReceiptModalContext.jsx';
import {
  isValidReceiptNo,
  isReceiptTaken,
  getOldestReceiptAllocations,
  resolveAttachReceipt,
  resolveStudentId,
} from '../../lib/receipts.js';
import { manilaDateKey } from '../../lib/format.js';

// [type value, translation key for the dropdown label]. The value stays as the
// English type key the server expects.
const TYPE_OPTIONS = [
  ['cancel-monthly-fee', 'rmod.typeCancelMf'],
  ['purchase', 'rmod.typePackage'],
  ['compensation', 'rmod.typeCompensation'],
  ['manual', 'rmod.typeManual'],
  ['monthly-fee', 'rmod.typeMonthlyFee'],
  ['promo', 'rmod.typePromo'],
  ['recommendation', 'rmod.typeRecommendation'],
  ['refund', 'rmod.typeRefund'],
  ['transfer', 'rmod.typeTransfer'],
];

// Exact icon/colour per form (from the v15 index.html #remaining-form-* blocks).
// titleKey/subKey are translated at render in <FormHead>.
const FORM_HEADS = {
  'cancel-monthly-fee': { color: '#dc2626', icon: 'fa-ban', titleKey: 'rmod.typeCancelMf', subKey: 'rmod.cmfSub' },
  purchase: { color: '#2563eb', icon: 'fa-cart-shopping', titleKey: 'rmod.typePackage', subKey: 'rmod.packageSub' },
  'monthly-fee': { color: '#059669', icon: 'fa-infinity', titleKey: 'rmod.typeMonthlyFee', subKey: 'rmod.mfSub' },
  manual: { color: '#0891b2', icon: 'fa-sliders', titleKey: 'rmod.manualTitle', subKey: 'rmod.manualSub' },
  compensation: { color: '#7c3aed', icon: 'fa-hand-holding-heart', titleKey: 'rmod.typeCompensation', subKey: 'rmod.compensationSub' },
  promo: { color: '#ea580c', icon: 'fa-gift', titleKey: 'rmod.typePromo', subKey: 'rmod.promoSub' },
  recommendation: { color: '#be185d', icon: 'fa-user-plus', titleKey: 'rmod.typeRecommendation', subKey: 'rmod.recommendationSub' },
  refund: { color: '#d97706', icon: 'fa-rotate-left', titleKey: 'rmod.typeRefund', subKey: 'rmod.refundSub' },
  transfer: { color: '#0d9488', icon: 'fa-right-left', titleKey: 'rmod.typeTransfer', subKey: 'rmod.transferSub' },
};

const today = () => manilaDateKey();
const EMPTY = {
  student: '', receipt: '', date: '', pkg: '', teacher: '', status: '', amount: '',
  transaction: '', remarks: '', classes: '', note: '', direction: 'add',
  fromStudent: '', toStudent: '', info: '', studentList: [],
  // Exact row ids captured from the picker/suggestions (0 = typed by hand).
  // Duplicate-name-safe: the id, not the name, is what the submit uses.
  studentId: 0, fromStudentId: 0, toStudentId: 0,
};

export default function RemainingModify() {
  const data = useData();
  const toast = useToast();
  // `t` is used as the transaction arrow-param below (.find((t) => t.type…)),
  // so the translator is aliased `tr`.
  const tr = useT();
  const { refresh, notifyChanged } = useReceiptModal();
  const [type, setType] = useState('');
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  // The student's active monthly fee (if any) while the Monthly Fee form is open.
  // When set, the form records a recurring payment instead of a new enrollment.
  const [activeMf, setActiveMf] = useState(null);

  useEffect(() => {
    data.ensureTeachers();
    data.ensureStudents();
  }, [data]);

  // Monthly Fee form: detect whether the typed student already has an active
  // monthly fee. Resolve the id locally from the loaded list, then fetch their
  // transactions. Drives the receipt-no vs "already active" branch in the form.
  useEffect(() => {
    if (type !== 'monthly-fee') {
      setActiveMf(null);
      return undefined;
    }
    const name = (f.student || '').trim().toLowerCase();
    // ID-first: the picker-captured id wins; typed names fall back to exact match.
    const stu = f.studentId
      ? { id: f.studentId }
      : (data.students || []).find((s) => String(s.name || '').trim().toLowerCase() === name);
    if (!stu) {
      setActiveMf(null);
      return undefined;
    }
    let alive = true;
    apiFetch('/class-transactions?student_id=' + stu.id)
      .then((txns) => {
        if (!alive) return;
        const mf = Array.isArray(txns) ? txns.find((t) => t.type === 'monthly-fee' && t.status === 'active') : null;
        setActiveMf(mf || null);
      })
      .catch(() => alive && setActiveMf(null));
    return () => {
      alive = false;
    };
  }, [type, f.student, f.studentId, data.students]);

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  // Name + captured row id in one update (id resets to 0 on free typing).
  const setStudentWithId = (nameKey, idKey) => (v, sObj) =>
    setF((prev) => ({ ...prev, [nameKey]: v, [idKey]: sObj ? Number(sObj.id) || 0 : 0 }));
  // ID-first resolution: the picker-captured id wins; hand-typed names fall back
  // to the exact-name server lookup (first match — same as before).
  const sidFor = async (name, pickedId) =>
    Number(pickedId) > 0 ? Number(pickedId) : await resolveStudentId(name);
  const clearForm = () => setF({ ...EMPTY, direction: 'add' });
  // Mirror legacy renderRemainingView() + refreshOpenReceiptModal() after a save.
  const afterSuccess = () => {
    notifyChanged();
    refresh();
  };

  const onTypeChange = (val) => {
    setType(val);
    // Default any date field to today (legacy toggleRemainingForm).
    setF({ ...EMPTY, direction: 'add', date: today() });
  };

  // Faithful port of submitRemainingForm.
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let payload = { type };
      if (type === 'monthly-fee') {
        if (!f.student.trim()) return toast(tr('rmod.selectStudent'));
        if (!f.date) return toast(tr('rmod.enterDate'));
        const sid = await sidFor(f.student, f.studentId);
        if (!sid) return toast(tr('rmod.studentNotFound'));
        // Authoritative re-check at submit time (state may be stale mid-typing).
        const existing = await apiFetch('/class-transactions?student_id=' + sid);
        const active = Array.isArray(existing) ? existing.find((t) => t.type === 'monthly-fee' && t.status === 'active') : null;
        if (active) {
          // Recurring payment — attach to the active monthly fee's receipt (no new receipt no).
          payload = { ...payload, type: 'monthly-fee-payment', student_id: sid, receipt_no: active.receipt_no || '', date: f.date, amount: f.amount.trim(), transaction_no: f.transaction.trim(), notes: f.remarks.trim() };
        } else {
          // New enrollment — needs its own receipt number.
          if (!f.receipt.trim()) return toast(tr('rmod.chooseReceipt'));
          if (!isValidReceiptNo(f.receipt)) return toast(tr('rmod.receiptFormat'));
          if (await isReceiptTaken(f.receipt)) return toast(tr('rmod.receiptTaken'));
          payload = { ...payload, student_id: sid, receipt_no: f.receipt.trim(), date: f.date, teacher_id: 0, amount: f.amount.trim(), transaction_no: f.transaction.trim(), notes: f.remarks.trim(), status: 'active' };
        }
      } else if (type === 'cancel-monthly-fee') {
        if (!f.student.trim()) return toast(tr('rmod.selectStudent'));
        const sid = await sidFor(f.student, f.studentId);
        if (!sid) return toast(tr('rmod.studentNotFound'));
        const mf = await apiFetch('/class-transactions?student_id=' + sid);
        const activeMf = Array.isArray(mf) ? mf.find((t) => t.type === 'monthly-fee' && t.status === 'active') : null;
        if (activeMf) {
          await apiFetch('/class-transactions', 'POST', { student_id: sid, type: 'cancel-monthly-fee', receipt_no: activeMf.receipt_no || '', date: today(), notes: f.info.trim() || 'Cancelled' });
          await apiFetch('/class-transactions/' + activeMf.id, 'PUT', { ...activeMf, status: 'inactive' });
          toast(tr('rmod.mfCancelled', { student: f.student }));
          clearForm();
          afterSuccess();
        } else {
          toast(tr('rmod.noActiveMf'));
        }
        return;
      } else if (type === 'manual') {
        const classes = parseInt(f.classes);
        if (!f.student.trim()) return toast(tr('rmod.selectStudent'));
        if (!classes || classes < 1) return toast(tr('rmod.classesMin1'));
        if (!f.receipt.trim()) return toast(tr('rmod.chooseReceipt'));
        if (!isValidReceiptNo(f.receipt)) return toast(tr('rmod.receiptFormat'));
        const sid = await sidFor(f.student, f.studentId);
        if (!sid) return toast(tr('rmod.studentNotFound'));
        const signed = f.direction === 'subtract' ? -classes : classes;
        payload = { ...payload, student_id: sid, total_classes: signed, receipt_no: f.receipt.trim(), notes: f.note.trim() || (f.direction === 'subtract' ? 'Manual deduction' : '') };
      } else if (type === 'compensation' || type === 'promo') {
        // Multiple students can each receive the same free classes (one txn each).
        const classes = parseInt(f.classes);
        // Entries are { id, name } from MultiStudentField — id 0 only for
        // hand-typed names that matched no suggestion.
        const list = (f.studentList || [])
          .map((v) => ({ id: Number(v.id) || 0, name: String(v.name || '').trim() }))
          .filter((v) => v.name);
        if (!list.length) return toast(tr('rmod.selectAtLeastOne'));
        if (!classes || classes < 1) return toast(tr('rmod.additionalMin1'));
        let ok = 0;
        const missing = [];
        for (const entry of list) {
          // ID-first: picked entries carry the exact row id; typed names fall
          // back to the exact-name server lookup.
          const sid = entry.id > 0 ? entry.id : await resolveStudentId(entry.name);
          if (!sid) {
            missing.push(entry.name);
            continue;
          }
          const receiptNo = await resolveAttachReceipt(sid);
          await apiFetch('/class-transactions', 'POST', {
            type,
            student_id: sid,
            total_classes: classes,
            receipt_no: receiptNo,
            notes: f.note.trim(),
          });
          ok++;
        }
        if (missing.length) toast(tr('rmod.studentsNotFound', { names: missing.join(', ') }));
        if (ok) {
          toast(tr('rmod.classesAdded', { classes, students: ok }));
          clearForm();
          afterSuccess();
        }
        return;
      } else if (type === 'recommendation') {
        const classes = parseInt(f.classes);
        if (!f.student.trim()) return toast(tr('rmod.selectStudent'));
        if (!classes || classes < 1) return toast(tr('rmod.additionalMin1'));
        const sid = await sidFor(f.student, f.studentId);
        if (!sid) return toast(tr('rmod.studentNotFound'));
        const receiptNo = await resolveAttachReceipt(sid);
        payload = { ...payload, student_id: sid, total_classes: classes, receipt_no: receiptNo, notes: f.note.trim() };
      } else if (type === 'purchase') {
        const pkg = parseInt(f.pkg);
        if (!f.student.trim()) return toast(tr('rmod.selectStudent'));
        if (!f.receipt.trim()) return toast(tr('rmod.chooseReceipt'));
        if (!isValidReceiptNo(f.receipt)) return toast(tr('rmod.receiptFormat'));
        if (await isReceiptTaken(f.receipt)) return toast(tr('rmod.receiptTaken'));
        if (!pkg || pkg < 1) return toast(tr('rmod.packageMin1'));
        if (!f.date) return toast(tr('rmod.enterDate'));
        const sid = await sidFor(f.student, f.studentId);
        if (!sid) return toast(tr('rmod.studentNotFound'));
        payload = { ...payload, student_id: sid, receipt_no: f.receipt.trim(), total_classes: pkg, teacher_id: 0, status: f.status, amount: f.amount.trim(), transaction_no: f.transaction.trim(), date: f.date, notes: f.remarks.trim() };
      } else if (type === 'refund') {
        const classes = parseInt(f.classes);
        if (!f.student.trim()) return toast(tr('rmod.selectStudent'));
        if (!classes || classes < 1) return toast(tr('rmod.refundMin1'));
        if (!f.date) return toast(tr('rmod.enterDate'));
        const sid = await sidFor(f.student, f.studentId);
        if (!sid) return toast(tr('rmod.studentNotFound'));
        const receiptNo = await resolveAttachReceipt(sid);
        payload = { ...payload, student_id: sid, total_classes: -classes, receipt_no: receiptNo, date: f.date, amount: f.amount.trim(), notes: f.note.trim() || 'Refund' };
      } else if (type === 'transfer') {
        const classes = parseInt(f.classes);
        if (!f.fromStudent.trim()) return toast(tr('rmod.selectSource'));
        if (!f.toStudent.trim()) return toast(tr('rmod.selectDest'));
        if (f.fromStudent === f.toStudent) return toast(tr('rmod.srcDstDiff'));
        if (!classes || classes < 1) return toast(tr('rmod.transferMin1'));
        const fromId = await sidFor(f.fromStudent, f.fromStudentId);
        const toId = await sidFor(f.toStudent, f.toStudentId);
        if (!fromId) return toast(tr('rmod.srcNotFound'));
        if (!toId) return toast(tr('rmod.dstNotFound'));
        const bal = await apiFetch('/class-balances?search=' + encodeURIComponent(f.fromStudent));
        const fromBal = Array.isArray(bal) ? bal.find((b) => b.id === fromId) : null;
        if (!(fromBal && fromBal.has_monthly_fee)) {
          const available = fromBal ? fromBal.balance || 0 : 0;
          if (classes > available) return toast(tr('rmod.insufficientBal', { student: f.fromStudent, n: available }));
        }
        const sourceTxns = await apiFetch('/class-transactions?student_id=' + fromId);
        const toReceipt = await resolveAttachReceipt(toId);
        const d = today();
        // Monthly Fee is unlimited, so it has no numeric receipt balance to split.
        // For class packages, consume the source's oldest receipt(s) first.
        const sourceAllocations = fromBal && fromBal.has_monthly_fee
          ? [{ receiptNo: await resolveAttachReceipt(fromId), classes }]
          : getOldestReceiptAllocations(sourceTxns, classes);
        if (!sourceAllocations.length) return toast(tr('rmod.insufficientBal', { student: f.fromStudent, n: fromBal ? fromBal.balance || 0 : 0 }));
        for (const allocation of sourceAllocations) {
          await apiFetch('/class-transactions', 'POST', {
            student_id: fromId,
            type: 'transfer',
            total_classes: -allocation.classes,
            receipt_no: allocation.receiptNo,
            date: d,
            notes: 'Transferred to ' + f.toStudent,
          });
        }
        await apiFetch('/class-transactions', 'POST', { student_id: toId, type: 'transfer', total_classes: classes, from_student_id: fromId, receipt_no: toReceipt, date: d, notes: 'Transferred from ' + f.fromStudent });
        toast(tr('rmod.transferred', { n: classes, from: f.fromStudent, to: f.toStudent }));
        clearForm();
        afterSuccess();
        return;
      }
      await apiFetch('/class-transactions', 'POST', payload);
      toast(tr('rmod.saved'));
      clearForm();
      afterSuccess();
    } catch (e) {
      toast(tr('rmod.error', { msg: e.message || String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const students = data.students;

  const FormHead = ({ color, icon, titleKey, subKey }) => (
    <div className="remaining-form-head">
      <span className="remaining-form-icon" style={{ background: color }}>
        <i className={'fa-solid ' + icon}></i>
      </span>
      <div>
        <div className="page-title">{tr(titleKey)}</div>
        <p className="page-sub">{tr(subKey)}</p>
      </div>
    </div>
  );

  const submitBtn = (labelKey) => (
    <button className="btn btn-primary" onClick={submit} disabled={busy}>
      {busy ? tr('common.saving') : tr(labelKey)}
    </button>
  );

  return (
    <>
      <div className="card">
        <div className="form-group">
          <label>{tr('rmod.selectType')}</label>
          <select className="form-control" value={type} onChange={(e) => onTypeChange(e.target.value)}>
            <option value="">{tr('rmod.selectPlaceholder')}</option>
            {TYPE_OPTIONS.map(([v, labelKey]) => (
              <option key={v} value={v}>
                {tr(labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {type === 'cancel-monthly-fee' && (
        <div className="card remaining-form">
          <FormHead {...FORM_HEADS['cancel-monthly-fee']} />
          <div className="form-group">
            <label>{tr('report.student')}</label>
            <StudentField value={f.student} onChange={setStudentWithId('student', 'studentId')} students={students} blockEndOfContract />
          </div>
          <div className="form-group">
            <label>{tr('rmod.infoReason')}</label>
            <textarea className="form-control" placeholder={tr('rmod.optionalNote')} value={f.info} onChange={(e) => set('info', e.target.value)} />
          </div>
          {submitBtn('rmod.typeCancelMf')}
        </div>
      )}

      {type === 'purchase' && (
        <div className="card remaining-form">
          <FormHead {...FORM_HEADS.purchase} />
          <div className="form-group">
            <label>{tr('students.name')}</label>
            <StudentField value={f.student} onChange={setStudentWithId('student', 'studentId')} students={students} blockEndOfContract />
          </div>
          <div className="form-group">
            <label>{tr('rmod.receiptNo')}</label>
            <ReceiptPicker studentName={f.student} studentId={f.studentId} value={f.receipt} onChange={(v) => set('receipt', v)} mode="new" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{tr('rmod.packageLabel')}</label>
              <input type="number" className="form-control" min="1" step="1" placeholder={tr('rmod.packagePh')} value={f.pkg} onChange={(e) => set('pkg', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{tr('tracker.date')} <span style={{ color: 'var(--red)' }} title={tr('rmod.required')}>*</span></label>
              <input type="date" className="form-control" value={f.date} onChange={(e) => set('date', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>{tr('common.status')}</label>
            <select className="form-control" value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">{tr('rmod.selectPlaceholder')}</option>
              <option value="new">{tr('rmod.statusNew')}</option>
              <option value="renew">{tr('rmod.statusRenew')}</option>
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{tr('rmod.amountRmb')}</label>
              <input type="text" className="form-control" placeholder={tr('rmod.amountPh')} value={f.amount} onChange={(e) => set('amount', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{tr('rmod.transactionNo')}</label>
              <input type="text" className="form-control" placeholder={tr('rmod.transactionPh')} value={f.transaction} onChange={(e) => set('transaction', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>{tr('rmod.remarks')}</label>
            <textarea className="form-control" placeholder={tr('rmod.remarksPh')} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
          {submitBtn('rmod.submitPackage')}
        </div>
      )}

      {type === 'monthly-fee' && (
        <div className="card remaining-form">
          <FormHead {...FORM_HEADS['monthly-fee']} />
          <div className="form-group">
            <label>{tr('report.student')}</label>
            <StudentField value={f.student} onChange={setStudentWithId('student', 'studentId')} students={students} blockEndOfContract />
          </div>
          {activeMf ? (
            <>
              <div className="remaining-active-mf">
                <i className="fa-solid fa-circle-check"></i>
                <span>{tr('rmod.activeMfPre')}<strong>{tr('rmod.activeMfBold')}</strong>{tr('rmod.activeMfPost')}</span>
              </div>
              <div className="form-group">
                <label>
                  {tr('rmod.receiptNo')}{' '}
                  <span style={{ color: 'var(--text3)', fontWeight: 500, fontSize: 12 }}>{tr('rmod.activeMfHint')}</span>
                </label>
                <input type="text" className="form-control" value={activeMf.receipt_no || '—'} readOnly disabled />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label>{tr('rmod.receiptNo')}</label>
              <ReceiptPicker studentName={f.student} studentId={f.studentId} value={f.receipt} onChange={(v) => set('receipt', v)} mode="pick" />
            </div>
          )}
          <div className="form-group">
            <label>{tr('tracker.date')} <span style={{ color: 'var(--red)' }} title={tr('rmod.required')}>*</span></label>
            <input type="date" className="form-control" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{tr('rmod.amountRmb')}</label>
              <input type="text" className="form-control" placeholder={tr('rmod.amountPh')} value={f.amount} onChange={(e) => set('amount', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{tr('rmod.transactionNo')}</label>
              <input type="text" className="form-control" placeholder={tr('rmod.transactionPh')} value={f.transaction} onChange={(e) => set('transaction', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>{tr('rmod.remarks')}</label>
            <textarea className="form-control" placeholder={tr('rmod.remarksPh')} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
          {submitBtn(activeMf ? 'rmod.submitPayment' : 'rmod.submitMonthlyFee')}
        </div>
      )}

      {type === 'manual' && (
        <div className="card remaining-form">
          <FormHead {...FORM_HEADS.manual} />
          <div className="form-group">
            <label>{tr('report.student')}</label>
            <StudentField value={f.student} onChange={setStudentWithId('student', 'studentId')} students={students} blockEndOfContract />
          </div>
          <div className="form-group">
            <label>{tr('rmod.receiptNo')}</label>
            <ReceiptPicker studentName={f.student} studentId={f.studentId} value={f.receipt} onChange={(v) => set('receipt', v)} mode="pick" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{tr('rmod.direction')}</label>
              <div className="seg-toggle">
                <button type="button" data-dir="add" className={'seg' + (f.direction === 'add' ? ' active' : '')} onClick={() => set('direction', 'add')}>
                  <i className="fa-solid fa-plus"></i> {tr('common.add')}
                </button>
                <button type="button" data-dir="subtract" className={'seg' + (f.direction === 'subtract' ? ' active' : '')} onClick={() => set('direction', 'subtract')}>
                  <i className="fa-solid fa-minus"></i> {tr('rmod.subtract')}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>{tr('rmod.numClasses')}</label>
              <input type="number" className="form-control" min="1" step="1" placeholder={tr('rmod.egTwo')} value={f.classes} onChange={(e) => set('classes', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>{tr('rmod.note')}</label>
            <textarea className="form-control" placeholder={tr('rmod.notePh')} value={f.note} onChange={(e) => set('note', e.target.value)} />
          </div>
          {submitBtn('rmod.submitAdjustment')}
        </div>
      )}

      {(type === 'compensation' || type === 'promo' || type === 'recommendation') && (
        <div className="card remaining-form">
          <FormHead {...FORM_HEADS[type]} />
          <div className="form-group">
            <label>{type === 'recommendation' ? tr('report.student') : tr('rmod.students')}</label>
            {type === 'recommendation' ? (
              <StudentField value={f.student} onChange={setStudentWithId('student', 'studentId')} students={students} blockEndOfContract />
            ) : (
              <MultiStudentField value={f.studentList} onChange={(list) => set('studentList', list)} students={students} blockEndOfContract />
            )}
          </div>
          <div className="form-group">
            <label>{tr('rmod.additionalClasses')}</label>
            <input type="number" className="form-control" min="1" step="1" placeholder={tr('rmod.egOne')} value={f.classes} onChange={(e) => set('classes', e.target.value)} />
          </div>
          <div className="form-group">
            <label>{type === 'recommendation' ? tr('rmod.referredName') : tr('rmod.note')}</label>
            <textarea className="form-control" placeholder={tr('rmod.notePh')} value={f.note} onChange={(e) => set('note', e.target.value)} />
          </div>
          {submitBtn('rmod.submit')}
        </div>
      )}

      {type === 'refund' && (
        <div className="card remaining-form">
          <FormHead {...FORM_HEADS.refund} />
          <div className="form-group">
            <label>{tr('report.student')}</label>
            <StudentField value={f.student} onChange={setStudentWithId('student', 'studentId')} students={students} blockEndOfContract />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{tr('rmod.classesToRefund')}</label>
              <input type="number" className="form-control" min="1" step="1" placeholder={tr('rmod.egOne')} value={f.classes} onChange={(e) => set('classes', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{tr('tracker.date')} <span style={{ color: 'var(--red)' }} title={tr('rmod.required')}>*</span></label>
              <input type="date" className="form-control" value={f.date} onChange={(e) => set('date', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>{tr('rmod.amountRmb')}</label>
            <input type="text" className="form-control" placeholder={tr('rmod.amountRefundedPh')} value={f.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div className="form-group">
            <label>{tr('rmod.note')}</label>
            <textarea className="form-control" placeholder={tr('rmod.notePh')} value={f.note} onChange={(e) => set('note', e.target.value)} />
          </div>
          {submitBtn('rmod.submitRefund')}
        </div>
      )}

      {type === 'transfer' && (
        <div className="card remaining-form">
          <FormHead {...FORM_HEADS.transfer} />
          <div className="form-group">
            <label>{tr('rmod.fromStudent')}</label>
            <StudentField value={f.fromStudent} onChange={setStudentWithId('fromStudent', 'fromStudentId')} students={students} blockEndOfContract pickerTitle={tr('rmod.selectSourceStudent')} />
          </div>
          <div className="form-group">
            <label>{tr('rmod.toStudent')}</label>
            <StudentField value={f.toStudent} onChange={setStudentWithId('toStudent', 'toStudentId')} students={students} blockEndOfContract pickerTitle={tr('rmod.selectDestStudent')} />
          </div>
          <div className="form-group">
            <label>{tr('rmod.classesToTransfer')}</label>
            <input type="number" className="form-control" min="1" step="1" placeholder={tr('rmod.egOne')} value={f.classes} onChange={(e) => set('classes', e.target.value)} />
          </div>
          {submitBtn('rmod.submitTransfer')}
        </div>
      )}
    </>
  );
}
