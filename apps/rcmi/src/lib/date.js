export const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatDate(date) {
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()}`;
}

// "MM-YYYY" key for the batch month endpoint.
export function formatMonth(date) {
  return `${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function todayAtStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
}

export function buildCalendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const todayKey = formatDate(todayAtStart());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: formatDate(date),
      isCurrentMonth: date.getMonth() === month,
      isToday: formatDate(date) === todayKey,
    };
  });
}

export function roleLabel(role) {
  if (role === 'leader') return 'Leader';
  if (role === 'guest') return 'Guest';
  return 'Member';
}

export function roleRank(role) {
  if (role === 'leader') return 0;
  if (role === 'guest') return 2;
  return 1;
}

export function sortByRoleThenName(people) {
  return [...people].sort((a, b) => (
    roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name)
  ));
}

export function getRoleGroups(people) {
  const sorted = sortByRoleThenName(people);
  return [
    { key: 'leaders', title: 'Leaders', people: sorted.filter((person) => person.role === 'leader') },
    { key: 'members', title: 'Members', people: sorted.filter((person) => person.role === 'member') },
    { key: 'guests', title: 'Guests', people: sorted.filter((person) => person.role === 'guest') },
  ];
}

// Groups present/absent people by the leader they're assigned to, for the
// "By Leader" attendance views and the CSV per-day export file. Input
// people carry { id, name, role, leaderId, leaderName, status }. Anyone with
// no resolvable leaderId (legacy data from before leader assignment existed)
// is bucketed into a trailing "Unassigned" group instead of being dropped.
export function getHierarchicalGroups(people) {
  const leaders = people.filter((person) => person.role === 'leader');
  const others = sortByRoleThenName(people.filter((person) => person.role !== 'leader'));

  const groups = leaders
    .map((leader) => ({
      leaderId: leader.id,
      leaderName: leader.name,
      leaderPresent: leader.status === 'present',
      people: others.filter((person) => person.leaderId === leader.id),
    }))
    .sort((a, b) => a.leaderName.localeCompare(b.leaderName));

  const leaderIds = new Set(leaders.map((leader) => leader.id));
  const unassigned = others.filter((person) => !person.leaderId || !leaderIds.has(person.leaderId));
  if (unassigned.length > 0) {
    groups.push({ leaderId: null, leaderName: 'Unassigned', leaderPresent: null, people: unassigned });
  }

  return groups;
}
