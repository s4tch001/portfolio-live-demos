import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, queryPath } from '../../lib/apiClient.js';
import { useData } from '../../context/DataContext.jsx';
import { onRealtime } from '../../lib/realtime.js';
import { useT } from '../../i18n/LanguageProvider.jsx';
import { uiLocale } from '../../lib/format.js';
import AnnualDownloadModal from './AnnualDownloadModal.jsx';
import AnnualMonthlyDetailsModal from './AnnualMonthlyDetailsModal.jsx';

const YEARS = [];
for (let y = 2025; y <= 2099; y++) YEARS.push(y);

// Short month label localized to the UI language (Jan / 1月 / …). Any 2020 date
// works for the month-name lookup; the year is irrelevant.
const monthShort = (idx) => new Date(2020, idx, 1).toLocaleDateString(uiLocale(), { month: 'short' });

// Stat tiles shown in the dashboard. `key` maps to the /annual-summary response.
// goodUp = an increase vs last year is a *good* thing (drives the delta chip colour).
const STAT_CARDS = [
  { key: 'totalReceipts', labelKey: 'ryear.statReceipts', icon: 'fa-receipt', accent: 'var(--accent)', money: false, goodUp: true },
  { key: 'totalRmb', labelKey: 'ryear.statCollected', icon: 'fa-coins', accent: 'var(--green)', money: true, goodUp: true },
  { key: 'activeStudents', labelKey: 'ryear.statActive', icon: 'fa-user-check', accent: 'var(--green)', money: false, goodUp: true },
  { key: 'newStudents', labelKey: 'ryear.statNew', icon: 'fa-user-plus', accent: 'var(--accent)', money: false, goodUp: true },
  { key: 'becameInactive', labelKey: 'ryear.statInactive', icon: 'fa-user-clock', accent: 'var(--yellow)', money: false, goodUp: false },
  { key: 'leftStudents', labelKey: 'ryear.statLeft', icon: 'fa-user-xmark', accent: 'var(--red)', money: false, goodUp: false },
];

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// rAF count-up from 0 → target whenever target changes. Honours reduced-motion.
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(prefersReduced ? target : 0);
  const raf = useRef(0);
  useEffect(() => {
    if (prefersReduced) {
      setVal(target);
      return undefined;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

function fmtMoney(n) {
  const rounded = Math.round((Number(n) || 0) * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString()
    : rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Animated numeric value used inside each stat card.
function StatValue({ value, money }) {
  const animated = useCountUp(Number(value) || 0);
  const shown = money ? fmtMoney(animated) : Math.round(animated).toLocaleString();
  return (
    <div className="stat-value">
      {shown}
      {money ? <span className="stat-unit"> RMB</span> : null}
    </div>
  );
}

// Small ▲/▼ chip comparing this year to last year.
function DeltaChip({ delta, goodUp, money }) {
  const tr = useT();
  if (delta === 0) {
    return <span className="annual-delta annual-delta-flat" title={tr('ryear.sameAsLast')}>{tr('ryear.noChange')}</span>;
  }
  const up = delta > 0;
  const good = up === goodUp;
  const mag = money ? fmtMoney(Math.abs(delta)) : Math.abs(delta).toLocaleString();
  return (
    <span className={'annual-delta ' + (good ? 'annual-delta-good' : 'annual-delta-bad')}>
      <i className={'fa-solid ' + (up ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down')}></i>
      {up ? '+' : '−'}{mag} {tr('ryear.vsLastYr')}
    </span>
  );
}

// Animated SVG donut with a gradient track + per-segment glow. `idKey` must be unique
// per rendered donut so the gradient defs don't collide.
function MovementDonut({ segments, total, centerLabel, centerValue, replayKey, idKey, ariaLabel }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const gradId = `annualTrackGrad-${idKey}`;
  let acc = 0;
  return (
    <svg className="annual-donut" viewBox="0 0 140 140" key={replayKey} role="img" aria-label={ariaLabel || 'Movement breakdown'}>
      <defs>
        {/* Moving gradient shine on the track — a lighter band sweeps across once every 5s. */}
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="var(--purple)" stopOpacity="0.22" />
          <stop offset="42%" stopColor="var(--accent)" stopOpacity="0.16" />
          <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.55" />
          <stop offset="58%" stopColor="var(--accent)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--purple)" stopOpacity="0.22" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="-1 0; 1 0; -1 0"
            keyTimes="0; 0.5; 1"
            calcMode="spline"
            keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r={R} className="annual-donut-track" fill="none" strokeWidth="14" stroke={`url(#${gradId})`} />
      {segments.map((s) => {
        if (!s.value) return null;
        const frac = s.value / total;
        const len = frac * C;
        const seg = (
          <circle
            key={s.label}
            className="annual-donut-seg"
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={s.color}
            style={{ color: s.color }}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-acc}
            transform="rotate(-90 70 70)"
          />
        );
        acc += len;
        return seg;
      })}
      <text x="70" y="65" textAnchor="middle" dominantBaseline="middle" className="annual-donut-value">{centerValue}</text>
      <text x="70" y="83" textAnchor="middle" dominantBaseline="middle" className="annual-donut-label">{centerLabel}</text>
    </svg>
  );
}

// A themed named-list card (icon title + shine, then rows of name + right-side
// meta chip). Used for the moved-students / new-enrollments / inactive-teachers
// lists that sit under the leaderboards.
// `subFor` (optional): returns a small secondary line (student username · info)
// rendered under the name. Lists without it (e.g. teachers) are unchanged.
function NamedList({ icon, iconColor, title, items, empty, renderMeta, subFor }) {
  return (
    <div className="card annual-board annual-list-card annual-anim">
      <div className="annual-dist-title">
        <i className={'fa-solid ' + icon} style={{ color: iconColor, marginRight: 8 }}></i>
        {title}
        {items.length > 0 && <span className="annual-list-count">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>{empty}</div>
      ) : (
        <ul className="annual-namelist">
          {items.map((it, i) => {
            const sub = subFor ? subFor(it) : null;
            return (
              <li key={it.name + '-' + i}>
                <span className="annual-namelist-name">
                  {it.name}
                  {sub && (
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>
                      {sub}
                    </span>
                  )}
                </span>
                {renderMeta(it)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Annual Receipt Report — a year-at-a-glance summary dashboard. Pulls server-side
// aggregates from /annual-summary (cheap on D1 reads) for the selected year, plus the
// previous year for the comparison chips.
export default function RemainingYearly() {
  const { teachers, students, ensureStudents } = useData();
  // `t` is used as the teacher arrow-param in a Top-5 map, so the translator is `tr`.
  const tr = useT();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [state, setState] = useState(null); // summary object | 'loading' | 'error' | null
  const [prev, setPrev] = useState(null); // previous-year summary (for deltas)
  const [errMsg, setErrMsg] = useState('');
  const [metric, setMetric] = useState('receipts'); // monthly chart: 'receipts' | 'rmb'
  const [dlOpen, setDlOpen] = useState(false); // Annual Report download (year picker) modal
  const [mfDetail, setMfDetail] = useState(null); // monthly-fee student whose payment breakdown is open

  const teacherName = useCallback(
    (id) => {
      const tc = (teachers || []).find((x) => x.id == id);
      return (tc && (tc.fullname || tc.username)) || tr('reports.unknown');
    },
    [teachers, tr],
  );

  // Students feed the small "username · info" line beside student names in the
  // Top-5 and named lists below. ID-first (the summary rows carry student_id);
  // exact-name fallback for rows the server couldn't link.
  useEffect(() => {
    ensureStudents();
  }, [ensureStudents]);
  const studentSub = useCallback(
    (name, studentId = 0) => {
      const sid = Number(studentId) || 0;
      let s = sid > 0 ? (students || []).find((x) => Number(x.id) === sid) : null;
      if (!s) {
        const key = String(name || '').trim().toLowerCase();
        if (!key) return null;
        s = (students || []).find((x) => String(x.name || '').trim().toLowerCase() === key);
      }
      if (!s) return null;
      return (s.username || '—') + ' · ' + (s.notes || '—');
    },
    [students],
  );
  // Username · Info line for a summary row. The server now embeds username+notes
  // on every list row (so it works even for deleted / beyond-the-loaded-list
  // students); fall back to the loaded students list for older payloads.
  const rowSub = useCallback(
    (row) => {
      if (!row) return null;
      if (row.username || row.notes) return (row.username || '—') + ' · ' + (row.notes || '—');
      return studentSub(row.name || row.student, row.student_id);
    },
    [studentSub],
  );

  const load = useCallback(() => {
    if (!year) {
      setState(null);
      setPrev(null);
      return;
    }
    setState('loading');
    setErrMsg('');
    const prevYear = String(Number(year) - 1);
    Promise.all([
      apiFetch(queryPath('/annual-summary', { year })),
      // Previous year only feeds the delta chips — compact mode skips the heavy scans.
      apiFetch(queryPath('/annual-summary', { year: prevYear, compact: 1 })).catch(() => null),
    ])
      .then(([cur, p]) => {
        setState(cur && typeof cur === 'object' ? cur : null);
        setPrev(p && typeof p === 'object' ? p : null);
      })
      .catch((e) => {
        setState('error');
        setErrMsg(e.message || '');
      });
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: a receipt/transaction or student changed elsewhere → refresh the totals.
  useEffect(
    () =>
      onRealtime('sync', (msg) => {
        if (msg && (msg.resource === 'transactions' || msg.resource === 'students')) load();
      }),
    [load],
  );

  const summary = state && typeof state === 'object' ? state : null;
  const prevHasData =
    prev &&
    ['totalReceipts', 'totalRmb', 'newStudents', 'activeStudents', 'becameInactive', 'leftStudents'].some(
      (k) => (prev[k] || 0) > 0,
    );

  const dist = summary
    ? [
        { label: tr('ryear.distNew'), value: summary.newStudents || 0, color: 'var(--accent)' },
        { label: tr('ryear.distInactive'), value: summary.becameInactive || 0, color: 'var(--yellow)' },
        { label: tr('ryear.distLeft'), value: summary.leftStudents || 0, color: 'var(--red)' },
      ]
    : [];
  const distTotal = dist.reduce((s, d) => s + d.value, 0);
  const net = summary ? (summary.newStudents || 0) - (summary.leftStudents || 0) : 0;
  const avgPerReceipt =
    summary && summary.totalReceipts ? (summary.totalRmb || 0) / summary.totalReceipts : 0;
  // Retention = active ÷ (active + left this year).
  const retentionDen = summary ? (summary.activeStudents || 0) + (summary.leftStudents || 0) : 0;
  const retention = retentionDen ? Math.round(((summary.activeStudents || 0) / retentionDen) * 100) : null;
  const monthly = (summary && summary.monthly) || [];
  const monthMax = monthly.reduce((m, x) => Math.max(m, metric === 'rmb' ? x.rmb : x.receipts), 0);
  const busiest = summary && summary.busiestMonth;
  const topStudents = (summary && summary.topStudents) || [];
  const topTeachers = (summary && summary.topTeachers) || [];
  const movedStudents = (summary && summary.movedStudents) || [];
  const newStudentsList = (summary && summary.newStudentsList) || [];
  const inactiveTeachers = (summary && summary.inactiveTeachers) || [];
  const monthlyFeeList = (summary && summary.monthlyFeeList) || [];
  const cancelMonthlyList = (summary && summary.cancelMonthlyList) || [];
  // Teacher movement — active vs inactive teachers only (snapshot counts).
  const teacherDist = summary
    ? [
        { label: tr('ryear.distActive'), value: summary.teacherActive || 0, color: 'var(--green)' },
        { label: tr('ryear.distInactive'), value: summary.teacherInactive || 0, color: 'var(--red)' },
      ]
    : [];
  const teacherDistTotal = teacherDist.reduce((s, d) => s + d.value, 0);

  return (
    <div className="tab-pane active" id="tab-remaining-yearly">
      <div className="filter-bar">
        <label style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)', marginRight: 8 }}>
          {tr('rem.selectYear')}
        </label>
        <select
          className="form-control"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{ maxWidth: 160 }}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary annual-download-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => setDlOpen(true)}
        >
          <i className="fa-solid fa-file-excel"></i> {tr('common.download')}
        </button>
      </div>

      <AnnualDownloadModal open={dlOpen} onClose={() => setDlOpen(false)} currentYear={year} />
      <AnnualMonthlyDetailsModal open={!!mfDetail} onClose={() => setMfDetail(null)} student={mfDetail} />

      <div id="yearly-report-body">
        {!year ? (
          <div className="notif-empty">{tr('ryear.selectYearPrompt')}</div>
        ) : !state || state === 'loading' ? (
          <div className="notif-empty">{tr('common.loading')}</div>
        ) : state === 'error' ? (
          <div className="notif-empty">{tr('rmod.error', { msg: errMsg })}</div>
        ) : (
          <div className="annual-summary" key={summary.year || year}>
            <div className="annual-summary-head annual-anim" style={{ animationDelay: '0ms' }}>
              <span className="annual-summary-eyebrow">{tr('rtab.yearly')}</span>
              <h2 className="annual-summary-year">{tr('ryear.yearLabel', { y: summary.year || year })}</h2>
            </div>

            <div className="stats-grid">
              {STAT_CARDS.map((c, i) => {
                const cur = summary[c.key] || 0;
                const delta = prevHasData ? cur - (prev[c.key] || 0) : null;
                return (
                  <div className="stat-card annual-anim" key={c.key} style={{ animationDelay: 60 + i * 55 + 'ms' }}>
                    <div className="stat-icon" style={{ color: c.accent }}>
                      <i className={'fa-solid ' + c.icon}></i>
                    </div>
                    <StatValue value={cur} money={c.money} />
                    <div className="stat-label">{tr(c.labelKey)}</div>
                    {delta !== null && <DeltaChip delta={delta} goodUp={c.goodUp} money={c.money} />}
                  </div>
                );
              })}
            </div>

            <div className="annual-lower">
              <div className="card annual-dist-card annual-anim" style={{ animationDelay: '430ms' }}>
                <div className="annual-dist-title">{tr('ryear.movement')}</div>
                <div className="annual-dist-body">
                  <div className="annual-move-block">
                    <div className="annual-move-subtitle">{tr('ryear.studentMovement')}</div>
                    {distTotal === 0 ? (
                      <div className="annual-move-empty">{tr('ryear.noStudentMovement', { year: summary.year || year })}</div>
                    ) : (
                      <>
                        <MovementDonut
                          idKey="students"
                          ariaLabel={tr('ryear.studentMovement')}
                          segments={dist}
                          total={distTotal}
                          centerValue={(net >= 0 ? '+' : '−') + Math.abs(net)}
                          centerLabel={tr('ryear.net')}
                          replayKey={summary.year || year}
                        />
                        <div className="annual-dist-legend">
                          {dist.map((d) => (
                            <span className="annual-dist-legend-item" key={d.label}>
                              <span className="annual-dist-dot" style={{ background: d.color }} />
                              {d.label} <strong>{d.value}</strong>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="annual-move-block">
                    <div className="annual-move-subtitle">{tr('ryear.teacherMovement')}</div>
                    {teacherDistTotal === 0 ? (
                      <div className="annual-move-empty">{tr('ryear.noTeachers')}</div>
                    ) : (
                      <>
                        <MovementDonut
                          idKey="teachers"
                          ariaLabel={tr('ryear.teacherMovement')}
                          segments={teacherDist}
                          total={teacherDistTotal}
                          centerValue={teacherDistTotal}
                          centerLabel={tr('ryear.teachersLabel')}
                          replayKey={summary.year || year}
                        />
                        <div className="annual-dist-legend">
                          {teacherDist.map((d) => (
                            <span className="annual-dist-legend-item" key={d.label}>
                              <span className="annual-dist-dot" style={{ background: d.color }} />
                              {d.label} <strong>{d.value}</strong>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="card annual-highlights annual-anim" style={{ animationDelay: '500ms' }}>
                <div className="annual-dist-title">{tr('ryear.highlights')}</div>
                <div className="annual-hl-row">
                  <span className="annual-hl-icon" style={{ color: 'var(--green)' }}>
                    <i className="fa-solid fa-scale-balanced"></i>
                  </span>
                  <div>
                    <div className="annual-hl-value">{fmtMoney(avgPerReceipt)} <small>RMB</small></div>
                    <div className="annual-hl-label">{tr('ryear.avgPerReceipt')}</div>
                  </div>
                </div>
                <div className="annual-hl-row">
                  <span className="annual-hl-icon" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    <i className={'fa-solid ' + (net >= 0 ? 'fa-arrow-up-right-dots' : 'fa-arrow-down')}></i>
                  </span>
                  <div>
                    <div className="annual-hl-value">{net >= 0 ? '+' : '−'}{Math.abs(net)}</div>
                    <div className="annual-hl-label">{tr('ryear.netChange')}</div>
                  </div>
                </div>
                <div className="annual-hl-row">
                  <span className="annual-hl-icon" style={{ color: 'var(--accent)' }}>
                    <i className="fa-solid fa-heart-pulse"></i>
                  </span>
                  <div>
                    <div className="annual-hl-value">{retention === null ? '—' : retention + '%'}</div>
                    <div className="annual-hl-label">{tr('ryear.retention')}</div>
                  </div>
                </div>
                <div className="annual-hl-row">
                  <span className="annual-hl-icon" style={{ color: 'var(--purple)' }}>
                    <i className="fa-solid fa-fire"></i>
                  </span>
                  <div>
                    <div className="annual-hl-value">
                      {busiest ? monthShort(Number(busiest.month) - 1) : '—'}
                    </div>
                    <div className="annual-hl-label">
                      {tr('ryear.busiest')}{busiest ? tr('ryear.busiestSuffix', { n: busiest.receipts }) : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card annual-chart-card annual-anim" style={{ animationDelay: '560ms' }}>
              <div className="annual-chart-head">
                <div className="annual-dist-title" style={{ margin: 0 }}>{tr('ryear.monthlyBreakdown')}</div>
                <div className="annual-metric-toggle">
                  <button
                    type="button"
                    className={metric === 'receipts' ? 'active' : ''}
                    onClick={() => setMetric('receipts')}
                  >
                    {tr('ryear.metricReceipts')}
                  </button>
                  <button
                    type="button"
                    className={metric === 'rmb' ? 'active' : ''}
                    onClick={() => setMetric('rmb')}
                  >
                    RMB
                  </button>
                </div>
              </div>
              <div className="annual-chart" role="img" aria-label={tr('ryear.monthlyBreakdown')}>
                {monthly.map((m, i) => {
                  const v = metric === 'rmb' ? m.rmb : m.receipts;
                  const h = monthMax > 0 ? (v / monthMax) * 100 : 0;
                  return (
                    <div className="annual-chart-col" key={m.month}>
                      <div className="annual-chart-bar-wrap">
                        <span className="annual-chart-val">{v > 0 ? (metric === 'rmb' ? fmtMoney(v) : v) : ''}</span>
                        <div
                          className="annual-chart-bar"
                          style={{ height: h + '%', transitionDelay: 560 + i * 30 + 'ms' }}
                          title={`${monthShort(i)}: ${metric === 'rmb' ? fmtMoney(v) + ' RMB' : v + ' ' + tr('ryear.metricReceipts')}`}
                        />
                      </div>
                      <span className="annual-chart-label">{monthShort(i)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="annual-boards">
              <div className="card annual-board annual-anim" style={{ animationDelay: '620ms' }}>
                <div className="annual-dist-title">
                  <i className="fa-solid fa-medal" style={{ color: 'var(--yellow)', marginRight: 8 }}></i>
                  {tr('ryear.top5Students')}
                </div>
                {topStudents.length === 0 ? (
                  <div style={{ color: 'var(--text3)', fontSize: 13 }}>{tr('ryear.noReports', { year: summary.year || year })}</div>
                ) : (
                  <ol className="annual-rank">
                    {topStudents.map((s, i) => (
                      <li key={s.student}>
                        <span className={'annual-rank-num annual-rank-' + (i + 1)}>{i + 1}</span>
                        <span className="annual-rank-name">
                          {s.student}
                          {rowSub(s) && (
                            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>
                              {rowSub(s)}
                            </span>
                          )}
                        </span>
                        <span className="annual-rank-meta">
                          <strong>{s.present}</strong> {tr('ryear.presentWord')}
                          {s.absent > 0 ? <span className="annual-rank-sub">{tr('ryear.absentSuffix', { n: s.absent })}</span> : <span className="annual-rank-perfect">{tr('ryear.perfect')}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="card annual-board annual-anim" style={{ animationDelay: '680ms' }}>
                <div className="annual-dist-title">
                  <i className="fa-solid fa-chalkboard-user" style={{ color: 'var(--accent)', marginRight: 8 }}></i>
                  {tr('ryear.top5Teachers')}
                </div>
                {topTeachers.length === 0 ? (
                  <div style={{ color: 'var(--text3)', fontSize: 13 }}>{tr('ryear.noReports', { year: summary.year || year })}</div>
                ) : (
                  <ol className="annual-rank">
                    {topTeachers.map((t, i) => (
                      <li key={t.teacher_id}>
                        <span className={'annual-rank-num annual-rank-' + (i + 1)}>{i + 1}</span>
                        <span className="annual-rank-name">{t.teacher || teacherName(t.teacher_id)}</span>
                        <span className="annual-rank-meta">
                          <strong>{t.classes}</strong> {tr('ryear.classesWord')}
                          {t.cancelled > 0 ? <span className="annual-rank-sub">{tr('ryear.cancelledSuffix', { n: t.cancelled })}</span> : <span className="annual-rank-perfect">{tr('ryear.noCancels')}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {/* Named lists — students side (left column) and teachers side (right column). */}
            <div className="annual-boards annual-lists">
              <div className="annual-lists-col">
                <NamedList
                  icon="fa-user-xmark"
                  iconColor="var(--red)"
                  title={tr('ryear.leftInactiveStudents')}
                  items={movedStudents}
                  subFor={(m) => rowSub(m)}
                  empty={tr('ryear.noLeftInactive', { year: summary.year || year })}
                  renderMeta={(m) => (
                    <span className={'annual-tag ' + (m.type === 'Left' ? 'annual-tag-left' : 'annual-tag-inactive')}>
                      <i className={'fa-solid ' + (m.type === 'Left' ? 'fa-right-from-bracket' : 'fa-user-clock')}></i>
                      {m.type === 'Left' ? tr('ryear.tagLeft') : tr('ryear.tagInactive')}
                      {m.date ? <span className="annual-tag-date"> · {m.date}</span> : null}
                    </span>
                  )}
                />
                <NamedList
                  icon="fa-user-plus"
                  iconColor="var(--green)"
                  title={tr('ryear.newEnrollments')}
                  items={newStudentsList}
                  subFor={(n) => rowSub(n)}
                  empty={tr('ryear.noNewEnroll', { year: summary.year || year })}
                  renderMeta={(n) => (
                    <span className="annual-tag annual-tag-new">
                      <i className="fa-solid fa-seedling"></i>
                      {tr('ryear.tagNew')}
                      {n.date ? <span className="annual-tag-date"> · {n.date}</span> : null}
                    </span>
                  )}
                />
              </div>
              <div className="annual-lists-col">
                <NamedList
                  icon="fa-user-clock"
                  iconColor="var(--yellow)"
                  title={tr('ryear.teachersInactive')}
                  items={inactiveTeachers}
                  empty={tr('ryear.noTeachersInactive', { year: summary.year || year })}
                  renderMeta={(t) => (
                    <span className="annual-tag annual-tag-inactive">
                      <i className="fa-solid fa-user-clock"></i>
                      {tr('ryear.tagInactive')}
                      {t.date ? <span className="annual-tag-date"> · {t.date}</span> : null}
                    </span>
                  )}
                />
                <NamedList
                  icon="fa-infinity"
                  iconColor="var(--green)"
                  title={tr('ryear.monthlyFeeStudents')}
                  items={monthlyFeeList}
                  subFor={(m) => rowSub(m)}
                  empty={tr('ryear.noMonthlyFee', { year: summary.year || year })}
                  renderMeta={(m) => (
                    <>
                      <span className="annual-tag annual-tag-monthly">
                        <i className="fa-solid fa-infinity"></i>
                        {tr('ryear.tagMonthly')}
                        {m.date ? <span className="annual-tag-date"> · {m.date}</span> : null}
                      </span>
                      <button
                        type="button"
                        className="annual-view-details"
                        title={tr('ryear.viewDetails')}
                        aria-label={tr('ryear.viewDetails')}
                        onClick={() => setMfDetail(m)}
                      >
                        <i className="fa-solid fa-receipt"></i>
                      </button>
                    </>
                  )}
                />
                <NamedList
                  icon="fa-ban"
                  iconColor="var(--red)"
                  title={tr('ryear.cancelledMonthlyFee')}
                  items={cancelMonthlyList}
                  subFor={(c) => rowSub(c)}
                  empty={tr('ryear.noCancellations', { year: summary.year || year })}
                  renderMeta={(c) => (
                    <span className="annual-tag annual-tag-cancel">
                      <i className="fa-solid fa-ban"></i>
                      {tr('ryear.tagCancelled')}
                      {c.date ? <span className="annual-tag-date"> · {c.date}</span> : null}
                    </span>
                  )}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
