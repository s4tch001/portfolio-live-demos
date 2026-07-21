import { roleLabel } from '../lib/date.js';

const BADGE_CLASS = { leader: 'leaderBadge', member: 'memberBadge', guest: 'guestBadge' };

export default function RoleBadge({ role }) {
  return <span className={BADGE_CLASS[role] || 'memberBadge'}>{roleLabel(role)}</span>;
}
