import { useState } from 'react';
import { getRoleGroups, getHierarchicalGroups } from '../lib/date.js';
import RoleBadge from './RoleBadge.jsx';

function PersonCard({ person }) {
  return (
    <article className="personCard">
      <div className="nameCell">
        <strong>{person.name}</strong>
        <RoleBadge role={person.role} />
      </div>
    </article>
  );
}

export default function AttendanceViewer({
  selectedReadable,
  loading,
  presentPeople,
  hierarchicalAttendance,
  totalPresent,
  search,
  onSearch,
}) {
  const [viewMode, setViewMode] = useState('leader');
  const canGroupByLeader = Array.isArray(hierarchicalAttendance);

  const roleGroups = getRoleGroups(presentPeople);

  const term = search.toLowerCase();
  const hierarchicalGroups = canGroupByLeader
    ? getHierarchicalGroups(
        hierarchicalAttendance.filter(
          (person) => person.role === 'leader'
            || (person.status === 'present' && person.name.toLowerCase().includes(term)),
        ),
      )
    : [];

  const showByLeader = viewMode === 'leader' && canGroupByLeader;

  return (
    <div>
      <div className="sectionTitle">
        <div>
          <p className="eyebrow">Attendance Records</p>
          <h2>{selectedReadable}</h2>
        </div>
        <span className="counter">{totalPresent} Present</span>
      </div>

      {canGroupByLeader && (
        <div className="viewToggle">
          <button type="button" className={viewMode === 'leader' ? 'active' : ''} onClick={() => setViewMode('leader')}>
            By Leader
          </button>
          <button type="button" className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>
            All
          </button>
        </div>
      )}

      <label className="fieldLabel" htmlFor="viewerSearch">Search present member</label>
      <input
        id="viewerSearch"
        className="input"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Type a name..."
      />

      {loading ? <p className="emptyState">Loading attendance...</p> : null}

      {!loading && presentPeople.length === 0 ? (
        <p className="emptyState">No present members found for this day.</p>
      ) : showByLeader ? (
        <div className="groupedPeople">
          {hierarchicalGroups.map((group) => (group.leaderPresent || group.people.length > 0) && (
            <section className="roleGroup leaderGroup" key={group.leaderId || 'unassigned'}>
              <h3>{group.leaderName}{group.leaderPresent === false ? ' (Absent)' : ''}</h3>
              <div className="personList">
                {group.leaderPresent ? (
                  <PersonCard person={{ id: group.leaderId, name: group.leaderName, role: 'leader' }} />
                ) : null}
                {group.people.map((person) => <PersonCard key={person.id} person={person} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="groupedPeople">
          {roleGroups.map((group) => group.people.length > 0 && (
            <section className="roleGroup" key={group.key}>
              <h3>{group.title}</h3>
              <div className="personList">
                {group.people.map((person) => <PersonCard key={person.id} person={person} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
