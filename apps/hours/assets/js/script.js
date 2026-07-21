import '@pauuu-demo/demo-shell';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
);
const API = `${SUPABASE_URL}/functions/v1/hours-api`;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth();
let selectedDate = null;
let editingIndex = null;
let sessionToken = '';
let data = {};

function element(id) {
  return document.getElementById(id);
}

function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getHours(key) {
  return data[key] ?? [];
}

function sumHours(key) {
  return getHours(key).reduce((sum, value) => sum + value, 0);
}

function roundHours(value) {
  return Math.round(value * 100) / 100;
}

function setSyncStatus(state, label) {
  element('syncDot').className = `sync-dot${state ? ` ${state}` : ''}`;
  element('syncLabel').textContent = label;
}

async function apiRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('preview_not_configured');
  }
  const headers = new Headers(options.headers);
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('content-type', 'application/json');
  if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload.error ?? 'request_failed'));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadMonth(year, month) {
  if (!sessionToken) return;
  setSyncStatus('syncing', 'loading');
  try {
    const payload = await apiRequest(`/entries?month=${encodeURIComponent(monthKey(year, month))}`);
    for (const key of Object.keys(data)) {
      if (key.startsWith(monthKey(year, month))) delete data[key];
    }
    for (const row of payload.entries ?? []) {
      if (typeof row.dateKey === 'string' && Array.isArray(row.hoursList)) {
        data[row.dateKey] = row.hoursList.map(Number).filter(Number.isFinite);
      }
    }
    setSyncStatus('ok', 'synced');
  } catch (error) {
    console.error('Hours preview load failed:', error.message);
    setSyncStatus('err', error.status === 401 ? 'session expired' : 'error');
  }
}

async function persistDate(key) {
  setSyncStatus('syncing', 'saving');
  try {
    const list = data[key] ?? [];
    if (list.length === 0) {
      delete data[key];
      await apiRequest(`/entries/${encodeURIComponent(key)}`, { method: 'DELETE' });
    } else {
      await apiRequest(`/entries/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ hoursList: list }),
      });
    }
    setSyncStatus('ok', 'saved');
  } catch (error) {
    console.error('Hours preview save failed:', error.message);
    setSyncStatus('err', error.status === 401 ? 'session expired' : 'error');
  }
}

function render() {
  const title = element('monthTitle');
  title.replaceChildren(document.createTextNode(`${MONTHS[currentMonth]} `));
  const year = document.createElement('span');
  year.textContent = String(currentYear);
  title.append(year);
  renderGrid();
  renderStats();
}

function renderGrid() {
  const grid = element('daysGrid');
  grid.replaceChildren();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const weekTotals = new Map();
  let weekIndex = 0;
  const cells = Array.from({ length: firstDay }, () => ({ empty: true }));

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayOfWeek = new Date(currentYear, currentMonth, day).getDay();
    if (dayOfWeek === 0 && day > 1) weekIndex += 1;
    const key = dateKey(currentYear, currentMonth, day);
    weekTotals.set(weekIndex, (weekTotals.get(weekIndex) ?? 0) + sumHours(key));
    cells.push({ day, dayOfWeek, key, hours: sumHours(key), weekIndex });
  }

  for (const cell of cells) {
    const dayCell = document.createElement('div');
    dayCell.className = 'day-cell';
    if (cell.empty) {
      dayCell.classList.add('empty');
      grid.append(dayCell);
      continue;
    }
    if (cell.dayOfWeek === 0) dayCell.classList.add('sunday');
    if (cell.dayOfWeek === 6) dayCell.classList.add('saturday');
    if (
      currentYear === today.getFullYear()
      && currentMonth === today.getMonth()
      && cell.day === today.getDate()
    ) dayCell.classList.add('today');

    const number = document.createElement('div');
    number.className = 'day-num';
    number.textContent = String(cell.day);
    dayCell.append(number);

    const entries = getHours(cell.key);
    if (entries.length > 0) {
      const badge = document.createElement('div');
      badge.className = 'hours-badge';
      for (const value of entries) {
        const pip = document.createElement('div');
        pip.className = 'hour-pip';
        pip.textContent = `${value}h`;
        badge.append(pip);
      }
      dayCell.append(badge);
    }

    if (cell.dayOfWeek === 6) {
      const total = document.createElement('div');
      total.className = 'total-badge';
      total.textContent = `Week: ${roundHours(weekTotals.get(cell.weekIndex) ?? 0)}h`;
      dayCell.append(total);
    }
    dayCell.addEventListener('click', () => openModal(cell.day));
    grid.append(dayCell);
  }

  while (grid.childElementCount % 7 !== 0) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    grid.append(empty);
  }
}

function appendStat(container, label, value, className = '') {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const statLabel = document.createElement('div');
  statLabel.className = 'stat-label';
  statLabel.textContent = label;
  const statValue = document.createElement('div');
  statValue.className = `stat-val${className ? ` ${className}` : ''}`;
  statValue.textContent = value;
  card.append(statLabel, statValue);
  container.append(card);
}

function renderStats() {
  const stats = element('statsBar');
  stats.replaceChildren();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  let monthTotal = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    monthTotal += sumHours(dateKey(currentYear, currentMonth, day));
  }
  let weekTotal = 0;
  if (currentYear === today.getFullYear() && currentMonth === today.getMonth()) {
    const weekStart = today.getDate() - today.getDay();
    for (let offset = 0; offset < 7; offset += 1) {
      const day = weekStart + offset;
      if (day >= 1 && day <= daysInMonth) {
        weekTotal += sumHours(dateKey(currentYear, currentMonth, day));
      }
    }
  }
  appendStat(stats, 'Month Total', `${roundHours(monthTotal)}h`, 'green');
  appendStat(stats, 'This Week', `${roundHours(weekTotal)}h`, 'orange');
  appendStat(stats, 'Month', MONTHS[currentMonth]);
}

function openModal(day) {
  selectedDate = dateKey(currentYear, currentMonth, day);
  const dayOfWeek = new Date(currentYear, currentMonth, day).getDay();
  const date = element('modalDate');
  date.replaceChildren(document.createTextNode(`${DAY_NAMES[dayOfWeek]}, `));
  const label = document.createElement('span');
  label.textContent = `${MONTHS[currentMonth]} ${day}`;
  date.append(label);
  renderModal();
  element('overlay').classList.add('open');
  element('hoursInput').focus();
}

function closeModal() {
  element('overlay').classList.remove('open');
  element('hoursInput').value = '';
  selectedDate = null;
  editingIndex = null;
}

function actionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn-icon ${className}`;
  button.title = label;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderModal() {
  const list = element('hoursList');
  const totalElement = element('dayTotal');
  const entries = getHours(selectedDate);
  list.replaceChildren();
  totalElement.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No hours logged yet.';
    list.append(empty);
    return;
  }

  entries.forEach((value, index) => {
    const item = document.createElement('div');
    item.className = `hour-item${editingIndex === index ? ' editing' : ''}`;
    const valueElement = document.createElement('div');
    valueElement.className = 'hour-val';
    const label = document.createElement('div');
    label.className = 'hour-label';
    label.textContent = `Entry ${index + 1}`;
    const actions = document.createElement('div');
    actions.className = 'item-actions';

    if (editingIndex === index) {
      const input = document.createElement('input');
      input.className = 'edit-input';
      input.type = 'number';
      input.min = '0.1';
      input.max = '24';
      input.step = '0.1';
      input.value = String(value);
      valueElement.append(input);
      actions.append(
        actionButton('Save', 'save', () => saveEdit(index, input)),
        actionButton('Cancel', 'cancel', () => { editingIndex = null; renderModal(); }),
      );
      queueMicrotask(() => input.focus());
    } else {
      valueElement.textContent = `${value}h`;
      actions.append(
        actionButton('Edit', 'edit', () => { editingIndex = index; renderModal(); }),
        actionButton('Remove', 'del', () => removeEntry(index)),
      );
    }
    item.append(valueElement, label, actions);
    list.append(item);
  });

  const totalLabel = document.createElement('span');
  totalLabel.className = 'day-total-label';
  totalLabel.textContent = 'Day Total';
  const totalValue = document.createElement('span');
  totalValue.className = 'day-total-val';
  totalValue.textContent = `${roundHours(entries.reduce((sum, value) => sum + value, 0))}h`;
  totalElement.append(totalLabel, totalValue);
}

function validHours(value) {
  return Number.isFinite(value) && value > 0 && value <= 24;
}

async function saveEdit(index, input) {
  const value = Number(input.value);
  if (!validHours(value)) {
    input.style.borderColor = 'var(--danger)';
    return;
  }
  data[selectedDate][index] = value;
  editingIndex = null;
  await persistDate(selectedDate);
  renderModal();
  render();
}

async function removeEntry(index) {
  data[selectedDate].splice(index, 1);
  await persistDate(selectedDate);
  renderModal();
  render();
}

async function addEntry() {
  const input = element('hoursInput');
  const value = Number(input.value);
  if (!validHours(value)) {
    input.style.borderColor = 'var(--danger)';
    setTimeout(() => { input.style.borderColor = ''; }, 800);
    return;
  }
  data[selectedDate] ??= [];
  data[selectedDate].push(value);
  await persistDate(selectedDate);
  input.value = '';
  renderModal();
  render();
}

async function unlock() {
  const input = element('pwInput');
  const error = element('pwError');
  const button = element('pwSubmit');
  button.disabled = true;
  button.textContent = 'Checking…';
  error.textContent = '';
  try {
    const payload = await apiRequest('/session', {
      method: 'POST',
      body: JSON.stringify({ password: input.value }),
    });
    sessionToken = String(payload.token ?? '');
    if (!sessionToken) throw new Error('invalid_session');
    input.value = '';
    element('pwGate').classList.add('hidden');
    await loadMonth(currentYear, currentMonth);
    render();
  } catch (requestError) {
    error.textContent = requestError.message === 'preview_not_configured'
      ? 'Local preview environment is not configured.'
      : 'Incorrect password or login is temporarily limited.';
    input.select();
  } finally {
    button.disabled = false;
    button.textContent = 'Unlock';
  }
}

element('pwSubmit').addEventListener('click', unlock);
element('pwInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') unlock();
});
element('addBtn').addEventListener('click', addEntry);
element('hoursInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addEntry();
});
element('closeBtn').addEventListener('click', closeModal);
element('overlay').addEventListener('click', (event) => {
  if (event.target === element('overlay')) closeModal();
});
element('prevBtn').addEventListener('click', async () => {
  currentMonth -= 1;
  if (currentMonth < 0) { currentMonth = 11; currentYear -= 1; }
  await loadMonth(currentYear, currentMonth);
  render();
});
element('nextBtn').addEventListener('click', async () => {
  currentMonth += 1;
  if (currentMonth > 11) { currentMonth = 0; currentYear += 1; }
  await loadMonth(currentYear, currentMonth);
  render();
});

const themeToggle = element('themeToggle');
function applyTheme(theme) {
  const light = theme === 'light';
  document.body.classList.toggle('light', light);
  themeToggle.textContent = light ? '☀️' : '🌙';
  themeToggle.title = light ? 'Switch to dark mode' : 'Switch to light mode';
}
applyTheme(localStorage.getItem('theme'));
themeToggle.addEventListener('click', () => {
  const theme = document.body.classList.contains('light') ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
  applyTheme(theme);
});

render();
