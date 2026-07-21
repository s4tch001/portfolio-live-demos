import { useState } from 'react';
import { getRoleGroups, getHierarchicalGroups } from '../lib/date.js';
import RoleBadge from './RoleBadge.jsx';

function StatusToggle({ person, onChangeStatus }) {
  return (
    <button
      className={`statusToggle ${person.status === 'present' ? 'present' : 'absent'}`}
      onClick={() => onChangeStatus(person.id, person.status === 'present' ? 'absent' : 'present')}
    >
      {person.status === 'present' ? 'Present' : 'Absent'}
    </button>
  );
}

function AttendanceRow({ person, onChangeStatus, className = 'attendanceRow' }) {
  return (
    <div className={className} role="row">
      <div className="nameCell">
        <strong>{person.name}</strong>
        <RoleBadge role={person.role} />
      </div>
      <div className="statusCell">
        <StatusToggle person={person} onChangeStatus={onChangeStatus} />
      </div>
    </div>
  );
}

export default function AttendanceEditor({
  selectedReadable,
  loading,
  saving,
  attendance,
  hierarchicalAttendance,
  search,
  onSearch,
  onChangeStatus,
}) {
  const [viewMode, setViewMode] = useState('leader');
  const canGroupByLeader = Array.isArray(hierarchicalAttendance);

  const roleGroups = getRoleGroups(attendance);

  // "By Leader" search matches on the LEADER's name: a matching leader is shown
  // together with all of their members/guests. An empty search shows every
  // group. (The "All" view does its own per-person filtering upstream.)
  const term = search.toLowerCase();
  const allHierarchicalGroups = canGroupByLeader ? getHierarchicalGroups(hierarchicalAttendance) : [];
  const hierarchicalGroups = term
    ? allHierarchicalGroups.filter((group) => group.leaderName.toLowerCase().includes(term))
    : allHierarchicalGroups;

  const showByLeader = viewMode === 'leader' && canGroupByLeader;

  return (
    <div>
      <div className="sectionTitle">
        <div>
          <p className="eyebrow">Manage Attendance</p>
          <h2>{selectedReadable}</h2>
        </div>
        {saving && <span className="savingPill">Saving...</span>}
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

      <label className="fieldLabel" htmlFor="editorSearch">Search member</label>
      <input
        id="editorSearch"
        className="input"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Type a name..."
      />

      {loading ? <p className="emptyState">Loading members...</p> : null}

      {!loading && attendance.length === 0 ? (
        <p className="emptyState">No members found. Add members first in Member Directory.</p>
      ) : showByLeader ? (
        <div className="groupedPeople">
          {hierarchicalGroups.map((group) => {
            const leaderRow = hierarchicalAttendance.find((person) => person.id === group.leaderId);
            return (
              <section className="roleGroup leaderGroup" key={group.leaderId || 'unassigned'}>
                <h3>{group.leaderName}</h3>
                <div className="attendanceTable" role="table" aria-label={`${group.leaderName} attendance editor`}>
                  <div className="tableHead" role="row">
                    <span>Name</span>
                    <span>Status</span>
                  </div>
                  {leaderRow && (
                    <AttendanceRow
                      key={leaderRow.id}
                      person={leaderRow}
                      onChangeStatus={onChangeStatus}
                      className="attendanceRow leaderRow"
                    />
                  )}
                  {group.people.map((person) => (
                    <AttendanceRow key={person.id} person={person} onChangeStatus={onChangeStatus} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="groupedPeople">
          {roleGroups.map((group) => group.people.length > 0 && (
            <section className="roleGroup" key={group.key}>
              <h3>{group.title}</h3>
              <div className="attendanceTable" role="table" aria-label={`${group.title} attendance editor`}>
                <div className="tableHead" role="row">
                  <span>Name</span>
                  <span>Status</span>
                </div>
                {group.people.map((person) => (
                  <AttendanceRow key={person.id} person={person} onChangeStatus={onChangeStatus} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
