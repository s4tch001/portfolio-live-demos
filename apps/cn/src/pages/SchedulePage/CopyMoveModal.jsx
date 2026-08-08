import { useState, useEffect, useMemo } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { apiFetch } from '../../lib/apiClient.js';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { dateToStr, parseDate, formatDateNice, manilaToday, uiLocale } from '../../lib/format.js';
import { isActiveAccount } from '../../lib/accountStatus.js';

// Mini month calendar used for source/dest day picking (legacy renderCopyCal /
// renderDestCal). selectedDates is click-ordered; the badge shows the order.
function MiniCalendar({ year, month, onPrev, onNext, selectedDates, scheduledDates, onDayClick, selClass }) {
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = manilaToday();
  const label = first.toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric' });
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(<div className="mini-cal-day empty" key={'e' + i} />);
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = dateToStr(new Date(year, month, day));
    const idx = selectedDates.indexOf(ds);
    const isToday =
      today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    const cls =
      'mini-cal-day' + (isToday ? ' today-mini' : '') + (idx >= 0 ? ' ' + selClass : '');
    const hasSched = idx < 0 && scheduledDates && scheduledDates.has(ds);
    cells.push(
      <div
        key={day}
        className={cls}
        style={hasSched ? { border: '1.5px solid var(--accent)', fontWeight: 700 } : undefined}
        onClick={() => onDayClick(ds)}
      >
        {day}
        {idx >= 0 && (
          <span style={{ display: 'block', fontSize: 9, lineHeight: 1 }}>{idx + 1}</span>
        )}
      </div>,
    );
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
        <button className="btn btn-secondary btn-sm" onClick={onPrev} aria-label="Previous month">
          <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        <span style={{ fontWeight: 600, minWidth: 140, textAlign: 'center' }}>{label}</span>
        <button className="btn btn-secondary btn-sm" onClick={onNext} aria-label="Next month">
          <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
      <div className="mini-cal-grid">{cells}</div>
    </div>
  );
}

export default function CopyMoveModal({ open, isMove, onClose, teachers, schedules }) {
  const data = useData();
  const toast = useToast();
  const t = useT();
  const now = manilaToday();

  const activeTeachers = useMemo(() => teachers.filter(isActiveAccount), [teachers]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [step, setStep] = useState(1);
  const [sourceDates, setSourceDates] = useState([]);
  const [destDates, setDestDates] = useState([]);
  const [srcY, setSrcY] = useState(now.getFullYear());
  const [srcM, setSrcM] = useState(now.getMonth());
  const [dstY, setDstY] = useState(now.getFullYear());
  const [dstM, setDstM] = useState(now.getMonth());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(activeTeachers.map((t) => String(t.id))));
      setStep(1);
      setSourceDates([]);
      setDestDates([]);
      setSrcY(now.getFullYear());
      setSrcM(now.getMonth());
      setDstY(now.getFullYear());
      setDstM(now.getMonth());
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load the source month so "has schedule" borders are accurate.
  useEffect(() => {
    if (open) data.ensureMonth(srcY, srcM);
  }, [open, srcY, srcM, data]);

  const checkedIds = [...selectedIds].map(Number);
  const scheduledDates = useMemo(() => {
    return new Set(
      schedules
        .filter((s) => !checkedIds.length || checkedIds.includes(s.teacher_id))
        .map((s) => s.date),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, selectedIds]);

  const toggleTeacher = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const k = String(id);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const handleSrcClick = (ds) => {
    setSourceDates((prev) => {
      const idx = prev.indexOf(ds);
      const next = idx >= 0 ? prev.filter((d) => d !== ds) : [...prev, ds].sort();
      return next;
    });
    setDestDates([]); // reset dest when source changes
  };

  const handleDestClick = (ds) => {
    setDestDates((prev) => {
      const idx = prev.indexOf(ds);
      if (idx >= 0) return prev.filter((d) => d !== ds);
      if (prev.length < sourceDates.length) return [...prev, ds];
      toast(t('copyM.onlySelect', { n: sourceDates.length }));
      return prev;
    });
  };

  const goStep2 = () => {
    if (!selectedIds.size) {
      toast(t('copyM.selectTeacher'));
      return;
    }
    if (!sourceDates.length) {
      toast(t('copyM.selectSource'));
      return;
    }
    setDestDates([]);
    setStep(2);
  };

  const confirm = async () => {
    if (destDates.length !== sourceDates.length) {
      toast(t('copyM.selectExact', { n: sourceDates.length, have: destDates.length }));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/schedules/bulk-copy', 'POST', {
        source_dates: sourceDates,
        dest_dates: destDates,
        teacher_ids: checkedIds,
        move: isMove,
      });
      // Refresh every month touched by source/dest (force replace).
      const months = new Set();
      [...sourceDates, ...destDates].forEach((ds) => {
        const d = parseDate(ds);
        months.add(d.getFullYear() + '-' + d.getMonth());
      });
      await Promise.all(
        [...months].map((k) => {
          const [y, m] = k.split('-').map(Number);
          return data.reloadMonth(y, m);
        }),
      );
      const base = isMove
        ? t('copyM.moved', { n: res.inserted })
        : t('copyM.copied', { n: res.inserted });
      toast(
        res.skipped
          ? `${base} ${t('copyM.skippedSuffix', { n: res.skipped })}`
          : base,
      );
      onClose();
    } catch (e) {
      toast(e.message || t('copyM.error'));
    } finally {
      setBusy(false);
    }
  };

  const title = isMove ? (
    <>
      <i className="fa-solid fa-box-archive" aria-hidden="true"></i> {t('sched.moveSchedule')}
    </>
  ) : (
    <>
      <i className="fa-solid fa-clipboard-list" aria-hidden="true"></i> {t('sched.copySchedule')}
    </>
  );

  const tabStyle = (active) => ({
    background: active ? 'var(--accent)' : 'var(--surface2)',
    color: active ? '#fff' : 'var(--text3)',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
  });

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="640px">
      <div className="modal-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <span style={tabStyle(step === 1)}>{t('copyM.step1')}</span>
          <span style={tabStyle(step === 2)}>{t('copyM.step2')}</span>
        </div>

        {step === 1 && (
          <div>
            <div className="form-group">
              <label>{t('copyM.teachers')}</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedIds(new Set(activeTeachers.map((tc) => String(tc.id))))}
                >
                  {t('sched.all')}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>
                  {t('sched.clear')}
                </button>
              </div>
              <div className="teacher-check-list six-columns">
                {activeTeachers.map((t) => (
                  <label className="teacher-check-item" key={t.id}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(t.id))}
                      onChange={() => toggleTeacher(t.id)}
                    />
                    <div
                      style={{
                        width: 24, height: 24, borderRadius: 6, background: t.color || '#2563eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {(t.fullname || '').charAt(0)}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{t.fullname}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>{t('copyM.sourceDays')}</label>
              <MiniCalendar
                year={srcY}
                month={srcM}
                selClass="src-selected"
                selectedDates={sourceDates}
                scheduledDates={scheduledDates}
                onDayClick={handleSrcClick}
                onPrev={() => {
                  const d = new Date(srcY, srcM - 1, 1);
                  setSrcY(d.getFullYear());
                  setSrcM(d.getMonth());
                }}
                onNext={() => {
                  const d = new Date(srcY, srcM + 1, 1);
                  setSrcY(d.getFullYear());
                  setSrcM(d.getMonth());
                }}
              />
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>
                {sourceDates.length
                  ? t('copyM.daysSelected', { n: sourceDates.length, list: sourceDates.map(formatDateNice).join(', ') })
                  : t('copyM.noDays')}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="form-group">
              <label>{t('copyM.destDays', { dest: destDates.length, src: sourceDates.length })}</label>
              <MiniCalendar
                year={dstY}
                month={dstM}
                selClass="dest-selected"
                selectedDates={destDates}
                onDayClick={handleDestClick}
                onPrev={() => {
                  const d = new Date(dstY, dstM - 1, 1);
                  setDstY(d.getFullYear());
                  setDstM(d.getMonth());
                }}
                onNext={() => {
                  const d = new Date(dstY, dstM + 1, 1);
                  setDstY(d.getFullYear());
                  setDstM(d.getMonth());
                }}
              />
            </div>
            <div className="form-group">
              <label>{t('copyM.mapping')}</label>
              <div>
                {sourceDates.map((src, i) => (
                  <div className="date-pair-row" key={src}>
                    <span className="src-date">{formatDateNice(src)}</span>
                    <span className="arrow">
                      <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
                    </span>
                    <span className={'dest-date' + (destDates[i] ? '' : ' empty')}>
                      {destDates[i] ? formatDateNice(destDates[i]) : t('copyM.notAssigned')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        {step === 2 && (
          <button className="btn btn-secondary" style={{ marginRight: 'auto' }} onClick={() => setStep(1)}>
            {t('common.back')}
          </button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        {step === 1 ? (
          <button className="btn btn-primary" onClick={goStep2}>
            {t('copyM.next')}
          </button>
        ) : (
          <button
            className={isMove ? 'btn btn-danger' : 'btn btn-success'}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? (
              <>
                <span className="spinner"></span> {t('copyM.processing')}
              </>
            ) : isMove ? (
              t('sched.moveSchedule')
            ) : (
              t('sched.copySchedule')
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}
