import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { roleLabel, sortByRoleThenName } from '../lib/date.js';
import { DISTRICT_LEADERS } from '../lib/constants.js';
import RoleBadge from './RoleBadge.jsx';

const SAVE_LABELS = { leader: 'Save Leader', member: 'Save Member', guest: 'Save Guest' };

function LeaderSelect({ id, leaderOptions, value, onChange, excludeId }) {
  const options = excludeId ? leaderOptions.filter((leader) => leader.id !== excludeId) : leaderOptions;
  return (
    <>
      <label className="fieldLabel" htmlFor={id}>Assign to Leader</label>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Select a leader...</option>
        {options.map((leader) => (
          <option key={leader.id} value={leader.id}>{leader.name}</option>
        ))}
      </select>
    </>
  );
}

function AssignLeaderPanel({ members, leaderOptions, onChanged, onError }) {
  const [leaderId, setLeaderId] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [assigning, setAssigning] = useState(false);

  const assignable = useMemo(
    () => sortByRoleThenName(members.filter((member) => member.role !== 'leader')),
    [members],
  );

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function assign() {
    if (!leaderId || selectedIds.size === 0) return;
    setAssigning(true);
    onError('');
    try {
      const data = await api('members', {
        method: 'PATCH',
        body: JSON.stringify({ ids: Array.from(selectedIds), leaderId }),
      });
      await onChanged(`Assigned ${data.updatedCount} member(s)/guest(s) to leader.`);
      setSelectedIds(new Set());
    } catch (err) {
      onError(err.message);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <section className="panel panelWide">
      <p className="eyebrow">Member Directory</p>
      <h2>Assign Members/Guests to Leader</h2>

      <label className="fieldLabel" htmlFor="assignLeaderSelect">Leader</label>
      <select
        id="assignLeaderSelect"
        className="input"
        value={leaderId}
        onChange={(event) => setLeaderId(event.target.value)}
      >
        <option value="">Select a leader...</option>
        {leaderOptions.map((leader) => (
          <option key={leader.id} value={leader.id}>{leader.name}</option>
        ))}
      </select>

      <div className="directoryList assignList">
        {assignable.length === 0 ? <p className="emptyState">No members/guests yet.</p> : null}
        {assignable.map((person) => {
          const currentLeader = members.find((member) => member.id === person.leaderId);
          return (
            <label className="directoryItem assignRow" key={person.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(person.id)}
                onChange={() => toggle(person.id)}
              />
              <span className="nameCell">
                <strong>{person.name}</strong>
                <RoleBadge role={person.role} />
              </span>
              <span className="mutedText">
                {currentLeader ? `Currently: ${currentLeader.name}` : 'Currently: Unassigned'}
              </span>
            </label>
          );
        })}
      </div>

      <button
        className="primaryButton"
        disabled={assigning || !leaderId || selectedIds.size === 0}
        onClick={assign}
      >
        {assigning ? 'Assigning...' : 'Assign Selected'}
      </button>
    </section>
  );
}

function AssignDistrictLeaderPanel({ members, districtLeaders, onChanged, onError }) {
  const [districtLeaderId, setDistrictLeaderId] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [assigning, setAssigning] = useState(false);

  const leaders = useMemo(
    () => sortByRoleThenName(members.filter((member) => member.role === 'leader')),
    [members],
  );

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function assign() {
    if (!districtLeaderId || selectedIds.size === 0) return;
    setAssigning(true);
    onError('');
    try {
      const data = await api('members', {
        method: 'PATCH',
        body: JSON.stringify({ ids: Array.from(selectedIds), districtLeaderId }),
      });
      await onChanged(`Assigned ${data.updatedCount} leader(s) to district leader.`);
      setSelectedIds(new Set());
    } catch (err) {
      onError(err.message);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <section className="panel panelWide">
      <p className="eyebrow">Member Directory</p>
      <h2>Assign Leader to District Leader</h2>

      <label className="fieldLabel" htmlFor="assignDistrictLeaderSelect">District Leader</label>
      <select
        id="assignDistrictLeaderSelect"
        className="input"
        value={districtLeaderId}
        onChange={(event) => setDistrictLeaderId(event.target.value)}
      >
        <option value="">Select a district leader...</option>
        {districtLeaders.map((districtLeader) => (
          <option key={districtLeader.id} value={districtLeader.id}>{districtLeader.name}</option>
        ))}
      </select>

      <div className="directoryList assignList">
        {leaders.length === 0 ? <p className="emptyState">No leaders yet.</p> : null}
        {leaders.map((leader) => {
          const currentDistrictLeader = districtLeaders.find(
            (districtLeader) => districtLeader.id === leader.districtLeaderId,
          );
          return (
            <label className="directoryItem assignRow" key={leader.id}>
              <input
                type="checkbox"
                checked={selectedIds.has(leader.id)}
                onChange={() => toggle(leader.id)}
              />
              <span className="nameCell">
                <strong>{leader.name}</strong>
                <RoleBadge role={leader.role} />
              </span>
              <span className="mutedText">
                {currentDistrictLeader ? `Currently: ${currentDistrictLeader.name}` : 'Currently: Unassigned'}
              </span>
            </label>
          );
        })}
      </div>

      <button
        className="primaryButton"
        disabled={assigning || !districtLeaderId || selectedIds.size === 0}
        onClick={assign}
      >
        {assigning ? 'Assigning...' : 'Assign Selected'}
      </button>
    </section>
  );
}

function ChangeRolePanel({ members, leaderOptions, onChanged, onError }) {
  const [personId, setPersonId] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newLeaderId, setNewLeaderId] = useState('');
  const [saving, setSaving] = useState(false);

  const people = useMemo(() => sortByRoleThenName(members), [members]);

  async function changeRole(event) {
    event.preventDefault();
    if (!personId) {
      onError('Please select a person.');
      return;
    }
    if (newRole !== 'leader' && !newLeaderId) {
      onError('Please select a leader.');
      return;
    }
    setSaving(true);
    onError('');
    try {
      await api('members', {
        method: 'PATCH',
        body: JSON.stringify({
          id: personId,
          role: newRole,
          leaderId: newRole === 'leader' ? null : newLeaderId,
        }),
      });
      await onChanged('Role updated.');
      setPersonId('');
      setNewRole('member');
      setNewLeaderId('');
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel panelWide">
      <p className="eyebrow">Member Directory</p>
      <h2>Change Role</h2>
      <form className="memberForm" onSubmit={changeRole}>
        <label className="fieldLabel" htmlFor="changeRolePerson">Person</label>
        <select
          id="changeRolePerson"
          className="input"
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
        >
          <option value="">Select a person...</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>{person.name} ({roleLabel(person.role)})</option>
          ))}
        </select>

        <label className="fieldLabel" htmlFor="changeRoleNewRole">New role</label>
        <select
          id="changeRoleNewRole"
          className="input"
          value={newRole}
          onChange={(event) => setNewRole(event.target.value)}
        >
          <option value="member">Member</option>
          <option value="leader">Leader</option>
          <option value="guest">Guest</option>
        </select>

        {newRole === 'leader' ? (
          <p className="fieldHint">
            Changing to Leader clears this person's assigned leader going forward. Past attendance history stays as it was.
          </p>
        ) : (
          <LeaderSelect
            id="changeRoleLeader"
            leaderOptions={leaderOptions}
            value={newLeaderId}
            onChange={setNewLeaderId}
            excludeId={personId}
          />
        )}

        <button className="primaryButton" disabled={saving}>
          {saving ? 'Saving...' : 'Save Role Change'}
        </button>
      </form>
    </section>
  );
}

export default function MemberDirectory({ members, districtLeaders = DISTRICT_LEADERS, onChanged, onError }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');
  const [leaderId, setLeaderId] = useState('');
  const [districtLeaderId, setDistrictLeaderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const leaderOptions = useMemo(() => members.filter((member) => member.role === 'leader'), [members]);

  const filteredMembers = useMemo(() => {
    const term = search.toLowerCase();
    return sortByRoleThenName(members.filter((member) => member.name.toLowerCase().includes(term)));
  }, [members, search]);

  async function submitMember(event) {
    event.preventDefault();
    if (role !== 'leader' && !leaderId) {
      onError('Please select a leader.');
      return;
    }
    if (role === 'leader' && !districtLeaderId) {
      onError('Please select a district leader.');
      return;
    }
    setSubmitting(true);
    onError('');
    try {
      await api('members', {
        method: 'POST',
        body: JSON.stringify({
          name,
          role,
          leaderId: role === 'leader' ? null : leaderId,
          districtLeaderId: role === 'leader' ? districtLeaderId : null,
        }),
      });
      await onChanged(`${roleLabel(role)} saved. ${name}`);
      setName('');
      setRole('member');
      setLeaderId('');
      setDistrictLeaderId('');
    } catch (err) {
      onError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteMember(member) {
    if (!window.confirm(`Delete ${member.name} from the active member list?`)) return;
    setSubmitting(true);
    onError('');
    try {
      await api('members', {
        method: 'DELETE',
        body: JSON.stringify({ id: member.id }),
      });
      await onChanged(`${member.name} deleted.`);
    } catch (err) {
      onError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="memberGrid">
      <section className="panel">
        <p className="eyebrow">Member Directory</p>
        <h2>Add Member</h2>
        <form className="memberForm" onSubmit={submitMember}>
          <label className="fieldLabel" htmlFor="memberName">Full name</label>
          <input
            id="memberName"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Juan Dela Cruz"
            required
          />

          <label className="fieldLabel" htmlFor="memberRole">Role</label>
          <select id="memberRole" className="input" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="member">Member</option>
            <option value="leader">Leader</option>
            <option value="guest">Guest</option>
          </select>

          {role !== 'leader' && (
            <LeaderSelect id="memberLeader" leaderOptions={leaderOptions} value={leaderId} onChange={setLeaderId} />
          )}

          {role === 'leader' && (
            <>
              <label className="fieldLabel" htmlFor="memberDistrictLeader">District Leader</label>
              <select
                id="memberDistrictLeader"
                className="input"
                value={districtLeaderId}
                onChange={(event) => setDistrictLeaderId(event.target.value)}
                required
              >
                <option value="">Select a district leader...</option>
                {districtLeaders.map((districtLeader) => (
                  <option key={districtLeader.id} value={districtLeader.id}>{districtLeader.name}</option>
                ))}
              </select>
            </>
          )}

          <button className="primaryButton" disabled={submitting}>
            {submitting ? 'Saving...' : SAVE_LABELS[role]}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="sectionTitle">
          <div>
            <p className="eyebrow">People</p>
            <h2>Active Members</h2>
          </div>
          <span className="counter">{members.length}</span>
        </div>

        <label className="fieldLabel" htmlFor="memberSearch">Search directory</label>
        <input
          id="memberSearch"
          className="input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Type a name..."
        />

        <div className="directoryList">
          {filteredMembers.length === 0 ? <p className="emptyState">No members found.</p> : null}
          {filteredMembers.map((member) => (
            <article className="directoryItem" key={member.id}>
              <div className="nameCell">
                <strong>{member.name}</strong>
                <RoleBadge role={member.role} />
              </div>
              <button className="dangerButton" disabled={submitting} onClick={() => deleteMember(member)}>
                Delete
              </button>
            </article>
          ))}
        </div>
      </section>

      <AssignLeaderPanel
        members={members}
        leaderOptions={leaderOptions}
        onChanged={onChanged}
        onError={onError}
      />

      <AssignDistrictLeaderPanel
        members={members}
        districtLeaders={districtLeaders}
        onChanged={onChanged}
        onError={onError}
      />

      <ChangeRolePanel
        members={members}
        leaderOptions={leaderOptions}
        onChanged={onChanged}
        onError={onError}
      />
    </main>
  );
}
