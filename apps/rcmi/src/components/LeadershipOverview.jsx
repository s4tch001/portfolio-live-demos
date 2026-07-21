import { useMemo } from 'react';
import { DISTRICT_LEADERS } from '../lib/constants.js';
import { sortByRoleThenName } from '../lib/date.js';
import RoleBadge from './RoleBadge.jsx';

function LeaderBox({ leader, people, index }) {
  return (
    <article className="leaderOverviewBox" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="nameCell leaderOverviewHeader">
        <strong>{leader.name}</strong>
        <RoleBadge role="leader" />
      </div>
      {people.length === 0 ? (
        <p className="emptyState">No members/guests yet.</p>
      ) : (
        <ul className="leaderOverviewList">
          {people.map((person) => (
            <li key={person.id}>
              <span>{person.name}</span>
              <RoleBadge role={person.role} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function DistrictBox({ title, showBadge, leaders, membersByLeader, index }) {
  return (
    <section className="districtBox" style={{ animationDelay: `${index * 120}ms` }}>
      <div className="districtBoxHeader">
        <h2>{title}</h2>
        {showBadge && <span className="districtLeaderBadge">District Leader</span>}
      </div>
      {leaders.length === 0 ? (
        <p className="emptyState">No leaders assigned yet.</p>
      ) : (
        <div className="leaderOverviewGrid">
          {leaders.map((leader, leaderIndex) => (
            <LeaderBox
              key={leader.id}
              leader={leader}
              people={membersByLeader.get(leader.id) || []}
              index={leaderIndex}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function LeadershipOverview({ members, districtLeaders = DISTRICT_LEADERS }) {
  const { districtGroups, unassignedLeaders, membersByLeader } = useMemo(() => {
    const leaders = sortByRoleThenName(members.filter((member) => member.role === 'leader'));
    const others = sortByRoleThenName(members.filter((member) => member.role !== 'leader'));

    const byLeader = new Map();
    others.forEach((person) => {
      if (!person.leaderId) return;
      if (!byLeader.has(person.leaderId)) byLeader.set(person.leaderId, []);
      byLeader.get(person.leaderId).push(person);
    });

    const groups = districtLeaders.map((districtLeader) => ({
      ...districtLeader,
      leaders: leaders.filter((leader) => leader.districtLeaderId === districtLeader.id),
    }));

    const unassigned = leaders.filter((leader) => !leader.districtLeaderId);

    return { districtGroups: groups, unassignedLeaders: unassigned, membersByLeader: byLeader };
  }, [members, districtLeaders]);

  return (
    <main className="leadershipOverview">
      <div className="leadershipOverviewHeader">
        <p className="eyebrow">Member Directory</p>
        <h2>Leadership Overview</h2>
      </div>

      <div className="districtGrid">
        {districtGroups.map((group, index) => (
          <DistrictBox
            key={group.id}
            title={group.name}
            showBadge
            leaders={group.leaders}
            membersByLeader={membersByLeader}
            index={index}
          />
        ))}
        {unassignedLeaders.length > 0 && (
          <DistrictBox
            title="Unassigned"
            showBadge={false}
            leaders={unassignedLeaders}
            membersByLeader={membersByLeader}
            index={districtGroups.length}
          />
        )}
      </div>
    </main>
  );
}
