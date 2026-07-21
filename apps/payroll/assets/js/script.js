// ── EMPLOYEE COLORS ─────────────────────────────────────────────────
import '@pauuu-demo/demo-shell';

const EMP_COLORS = [
  '#b47cff',
  '#4fffb0',
  '#00d4ff',
  '#ffd166',
  '#ff6b6b',
  '#ff9f43',
  '#a29bfe',
  '#74b9ff',
  '#fd79a8',
  '#55efc4',
];

// ── STATE ────────────────────────────────────────────────────────────
let employees = [
  { id: 1, name: '' },
  { id: 2, name: '' },
];
let lastEdited = null; // 'total' | employee id (number)

// ── DOM REFS ─────────────────────────────────────────────────────────
const $totalUSD = document.getElementById('totalUSD');
const $rateUSD = document.getElementById('rateUSD');
const $convRate = document.getElementById('conversionRate');
const $totalHours = document.getElementById('totalHours');
const $resultsArea = document.getElementById('resultsArea');
const $hoursWarn = document.getElementById('hoursWarn');
const $employeeList = document.getElementById('employeeList');
const $btnRemoveEmp = document.getElementById('btnRemoveEmp');
const $empCountLabel = document.getElementById('empCountLabel');

// Prevent scroll from changing number input values
document.addEventListener(
  'wheel',
  () => {
    if (
      document.activeElement &&
      document.activeElement.type === 'number'
    ) {
      document.activeElement.blur();
    }
  },
  { passive: true },
);

$totalUSD.addEventListener('input', compute);
$rateUSD.addEventListener('input', compute);
$convRate.addEventListener('input', compute);
$totalHours.addEventListener('input', () => {
  lastEdited = 'total';
  compute();
});
$totalHours.addEventListener('blur', () => {
  lastEdited = 'total';
  syncHours();
  compute();
});

// ── HELPERS ──────────────────────────────────────────────────────────
function val(el) {
  if (!el) return null;
  const v = parseFloat(el.value);
  const max = el.max === '' ? Number.POSITIVE_INFINITY : Number(el.max);
  return !Number.isFinite(v) || v < 0 || v > max ? null : v;
}

function getEmpColor(index) {
  return EMP_COLORS[index % EMP_COLORS.length];
}

function getEmpDisplayName(emp) {
  return emp.name.trim() !== '' ? emp.name.trim() : `Person #${emp.id}`;
}

function getHoursEl(empId) {
  return document.getElementById(`hoursEmp_${empId}`);
}

function setReadonly(el, v) {
  if (!el) return;
  el.value = v !== null ? String(Math.round(v * 100) / 100) : '';
  el.classList.add('readonly-field');
}
function setEditable(el) {
  if (!el) return;
  el.classList.remove('readonly-field');
}

// ── RENDER EMPLOYEES ─────────────────────────────────────────────────
function renderEmployees() {
  $employeeList.innerHTML = '';

  employees.forEach((emp, idx) => {
    const color = getEmpColor(idx);
    const row = document.createElement('div');
    row.className = 'employee-row';
    row.id = `empRow_${emp.id}`;

    row.innerHTML = `
      <div class="emp-left-col">
        <div class="emp-name-wrap">
          <div class="emp-dot" style="background:${color};"></div>
          <input
            type="text"
            class="emp-name-input"
            id="nameEmp_${emp.id}"
            placeholder="Person #${emp.id}"
            value="${escHtml(emp.name)}"
            maxlength="30"
            autocomplete="off"
            spellcheck="false"
            title="Click to rename"
          />
        </div>
        <span class="emp-name-hint">Optional: change name</span>
      </div>
      <div class="emp-hours-wrap">
        <span class="emp-hours-prefix" style="color:${color};">
          <i class="fa-regular fa-clock"></i>
        </span>
        <input
          type="number"
          class="emp-hours-input"
          id="hoursEmp_${emp.id}"
          placeholder="0"
          min="0"
          max="10000"
          step="0.5"
          style="border-color: rgba(${hexToRgb(color)}, 0.25);"
        />
      </div>
    `;

    $employeeList.appendChild(row);

    // Name input listener
    const nameEl = document.getElementById(`nameEmp_${emp.id}`);
    nameEl.addEventListener('input', (e) => {
      emp.name = e.target.value;
      compute();
    });

    // Hours input listener
    const hoursEl = document.getElementById(`hoursEmp_${emp.id}`);
    const empId = emp.id;
    hoursEl.addEventListener('input', () => {
      lastEdited = empId;
      compute();
    });
    hoursEl.addEventListener('focus', () => {
      hoursEl.style.borderColor = color;
      hoursEl.style.boxShadow = `0 0 0 3px ${color}22`;
    });
    hoursEl.addEventListener('blur', () => {
      if (!hoursEl.classList.contains('readonly-field')) {
        hoursEl.style.borderColor = `rgba(${hexToRgb(color)}, 0.25)`;
        hoursEl.style.boxShadow = '';
      }
      lastEdited = empId;
      syncHours();
      compute();
    });
  });

  updateEmployeeControls();
}

function updateEmployeeControls() {
  const n = employees.length;
  $btnRemoveEmp.disabled = n <= 2;
  $empCountLabel.textContent = n === 1 ? '1 person' : `${n} persons`;
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ── ADD / REMOVE EMPLOYEE ────────────────────────────────────────────
function nextAvailableId() {
  const usedIds = new Set(employees.map((e) => e.id));
  let n = 1;
  while (usedIds.has(n)) n++;
  return n;
}

function addEmployee() {
  employees.push({ id: nextAvailableId(), name: '' });
  renderEmployees();
  syncHours();
  compute();
}

function removeEmployee() {
  if (employees.length <= 2) return;
  employees.pop();
  if (
    lastEdited !== 'total' &&
    !employees.find((e) => e.id === lastEdited)
  ) {
    lastEdited = null;
  }
  renderEmployees();
  syncHours();
  compute();
}

// ── SYNC HOURS ───────────────────────────────────────────────────────
// Logic: if exactly one employee has no value, compute it from total minus others.
// If total is lastEdited and only one emp is missing, fill it.
// If an emp is lastEdited and total is present, recompute the missing one.
function syncHours() {
  const total = val($totalHours);
  const empEls = employees.map((e) => ({
    emp: e,
    el: getHoursEl(e.id),
    v: val(getHoursEl(e.id)),
  }));
  const nullEls = empEls.filter((x) => x.v === null);
  const knownEls = empEls.filter((x) => x.v !== null);

  // Reset all to editable first (we'll re-set readonly below)
  empEls.forEach((x) => setEditable(x.el));
  setEditable($totalHours);

  if (total !== null && nullEls.length === 1) {
    // Can fill the missing employee
    const sumKnown = knownEls.reduce((s, x) => s + x.v, 0);
    const remaining = total - sumKnown;
    if (remaining >= 0) {
      setReadonly(nullEls[0].el, remaining);
    } else {
      $hoursWarn.classList.add('show');
      return;
    }
  } else if (total === null && nullEls.length === 0) {
    // All employees filled, compute total
    const sumAll = empEls.reduce((s, x) => s + x.v, 0);
    setReadonly($totalHours, sumAll);
  } else if (total !== null && nullEls.length === 0) {
    // Everything filled — check mismatch
    const sumAll = empEls.reduce((s, x) => s + x.v, 0);
    $hoursWarn.classList.toggle('show', Math.abs(sumAll - total) > 0.01);
    return;
  }

  // Warn check
  const totalFinal = val($totalHours);
  const empVals = employees.map((e) => val(getHoursEl(e.id)));
  if (totalFinal !== null && empVals.every((v) => v !== null)) {
    const sumAll = empVals.reduce((s, v) => s + v, 0);
    $hoursWarn.classList.toggle(
      'show',
      Math.abs(sumAll - totalFinal) > 0.01,
    );
  } else {
    $hoursWarn.classList.remove('show');
  }
}

// ── FORMAT ───────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  return n.toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── CLEAR ALL ────────────────────────────────────────────────────────
function clearAll() {
  [$totalUSD, $rateUSD, $convRate, $totalHours].forEach((el) => {
    el.value = '';
    setEditable(el);
  });
  employees.forEach((emp) => {
    const el = getHoursEl(emp.id);
    if (el) {
      el.value = '';
      setEditable(el);
    }
  });
  lastEdited = null;
  $hoursWarn.classList.remove('show');
  compute();
}

// ── COMPUTE ──────────────────────────────────────────────────────────
function compute() {
  const totalUSD = val($totalUSD);
  const rateUSD = val($rateUSD);
  const convRate = val($convRate);

  const empHours = employees.map((emp) => ({
    emp,
    hrs: val(getHoursEl(emp.id)),
  }));

  const anyHours = empHours.some((x) => x.hrs !== null);
  const ready = totalUSD && rateUSD && convRate && anyHours;

  if (!ready) {
    $resultsArea.innerHTML = `
      <div class="results-card">
        <div class="empty-state">
          <div class="empty-icon">🧮</div>
          Enter values above to start the computation.
        </div>
      </div>`;
    return;
  }

  const totalHoursPaid = totalUSD / rateUSD;
  const totalPHP = totalUSD * convRate;
  const ratePerHourPHP = totalPHP / totalHoursPaid;

  // Build pay boxes
  const payBoxesHTML = empHours
    .map((x, idx) => {
      const color = getEmpColor(idx);
      const name = getEmpDisplayName(x.emp);
      if (x.hrs === null) {
        return `
        <div class="pay-box" style="background:${color}14; border:1px solid ${color}40;">
          <div class="pay-box-name" style="color:${color};">${escHtml(name)}</div>
          <div class="pay-box-sub" style="padding-top:0.5rem;">No hours entered</div>
        </div>`;
      }
      const payPHP = ratePerHourPHP * x.hrs;
      const payUSD = (x.hrs / totalHoursPaid) * totalUSD;
      return `
      <div class="pay-box" style="background:${color}14; border:1px solid ${color}40;">
        <div class="pay-box-name" style="color:${color};">${escHtml(name)}</div>
        <div class="pay-box-php" style="color:${color};">₱ ${fmt(payPHP)}</div>
        <div class="pay-box-sub">${fmt(x.hrs, 1)} hours rendered</div>
        <div class="pay-box-usd">$ ${fmt(payUSD)} USD</div>
      </div>`;
    })
    .join('');

  // Build formula lines
  const formulaLines = empHours
    .filter((x) => x.hrs !== null)
    .map((x) => {
      const name = getEmpDisplayName(x.emp);
      const payPHP = ratePerHourPHP * x.hrs;
      return `<div class="f-line"><span class="f-key">${escHtml(name)}'s Pay:</span><span class="f-val">₱${fmt(ratePerHourPHP)}/hr × ${fmt(x.hrs, 1)} hrs = ₱${fmt(payPHP)}</span></div>`;
    })
    .join('');

  $resultsArea.innerHTML = `
    <div class="results-card">
      <div class="section-label" style="margin-bottom:1rem;">Summary</div>

      <div class="result-row">
        <span class="result-label">Total Hours Paid (USD ÷ Rate)</span>
        <span class="result-value accent2">${fmt(totalHoursPaid)} hrs</span>
      </div>
      <div class="result-row">
        <span class="result-label">Total Pay in PHP</span>
        <span class="result-value gold">₱ ${fmt(totalPHP)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">PHP Rate per Hour</span>
        <span class="result-value accent">₱ ${fmt(ratePerHourPHP)}/hr</span>
      </div>

      <div class="divider"></div>
      <div class="section-label" style="margin-bottom:1rem;">Pay Split</div>

      <div class="pay-split">${payBoxesHTML}</div>

      <div class="formula-trace">
        <div class="f-line"><span class="f-key">Total Hours Paid:</span><span class="f-val">$${fmt(totalUSD)} ÷ $${fmt(rateUSD)}/hr = ${fmt(totalHoursPaid)} hrs</span></div>
        <div class="f-line"><span class="f-key">Total PHP:</span><span class="f-val">$${fmt(totalUSD)} × ₱${fmt(convRate)} = ₱${fmt(totalPHP)}</span></div>
        <div class="f-line"><span class="f-key">PHP/hr Rate:</span><span class="f-val">₱${fmt(totalPHP)} ÷ ${fmt(totalHoursPaid)} hrs = ₱${fmt(ratePerHourPHP)}/hr</span></div>
        ${formulaLines}
      </div>
    </div>`;
}

// ── INIT ─────────────────────────────────────────────────────────────
document.getElementById('btnAddEmp').addEventListener('click', addEmployee);
$btnRemoveEmp.addEventListener('click', removeEmployee);
document.getElementById('btnClear').addEventListener('click', clearAll);

renderEmployees();
syncHours();
compute();
