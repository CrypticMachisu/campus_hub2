import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useClubs } from "../context/ClubsContext";
import { useAuth } from "../context/AuthContext";
import { canManageClub, isClubMember } from "../utils/authStore";
import { getAllEvents } from "../utils/eventsStore";
import { getAnnouncements } from "../utils/dashboardStorage";
import { getClubMembers, leaveClub } from "../utils/membershipStore";
import { formatEventDate } from "../utils/dateTime";
import styles from "./ClubWorkspace.module.css";

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function eventTimestamp(event) {
  const time = /^\d{2}:\d{2}$/.test(event.time || "") ? event.time : "00:00";
  const parsed = new Date(`${event.date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/** Compact "3h ago" style stamp for announcements. */
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * The home screen for someone who belongs to a club. This is what replaces
 * the generic discovery page once you're a member: your club's updates,
 * your next events, and the people you're in it with.
 */
export default function ClubWorkspace() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { clubs, loading: clubsLoading } = useClubs();
  const { user, applyUser } = useAuth();

  const club = clubs.find((c) => c.id === clubId);
  const managesThisClub = canManageClub(user, clubId);

  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setLoading(true);

    // Each panel is independent: a roster failure shouldn't blank the events.
    Promise.allSettled([
      getAllEvents(),
      getAnnouncements(clubId),
      getClubMembers(clubId),
    ]).then(([eventsResult, announcementsResult, membersResult]) => {
      if (cancelled) return;
      if (eventsResult.status === "fulfilled") setEvents(eventsResult.value);
      if (announcementsResult.status === "fulfilled") setAnnouncements(announcementsResult.value);
      if (membersResult.status === "fulfilled") setMembers(membersResult.value);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  async function handleLeave() {
    const confirmed = window.confirm(
      `Leave ${club.name}? You'll stop seeing its member workspace until you join again.`
    );
    if (!confirmed) return;

    setLeaving(true);
    setLeaveError("");
    try {
      const updatedUser = await leaveClub(clubId);
      applyUser(updatedUser);
      // "/" resolves to another club's workspace, or the discovery page if
      // that was their last one.
      navigate("/", { replace: true });
    } catch (err) {
      setLeaveError(err.message);
      setLeaving(false);
    }
  }

  if (clubsLoading) {
    return (
      <div className={styles.page} aria-busy="true">
        <SkeletonWorkspace />
      </div>
    );
  }

  if (!club) {
    return (
      <div className={styles.page}>
        <div className={styles.missing}>
          <h1>That club isn&apos;t in your workspace</h1>
          <p>It may have been removed, or you may have left it.</p>
          <Link to="/discover" className={styles.inlineLink}>
            Find a club to join
          </Link>
        </div>
      </div>
    );
  }

  // Someone landing on a club's workspace URL directly (or after leaving)
  // gets the public club page instead of a member view they don't have.
  if (!isClubMember(user, club.id) && !managesThisClub) {
    return <Navigate to={`/clubs/${club.id}`} replace />;
  }

  const upcoming = events
    .filter((event) => event.clubId === clubId)
    .filter((event) => new Date(`${event.date}T00:00`) >= todayStart())
    .sort((a, b) => eventTimestamp(a) - eventTimestamp(b));

  const latestAnnouncements = [...announcements]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <img className={styles.logo} src={club.logoUrl} alt="" />
        <div className={styles.heading}>
          <p className={styles.eyebrow}>
            {club.category}
            {isClubMember(user, club.id) && <span className={styles.memberTag}>Member</span>}
          </p>
          <h1 className={styles.title}>{club.name}</h1>
          <p className={styles.meta}>
            {club.meetingTime} <span aria-hidden="true">/</span> {club.meetingLocation}
          </p>

          {club.tags.length > 0 && (
            <ul className={styles.tags}>
              {club.tags.map((tag) => (
                <li key={tag} className={styles.tag}>
                  #{tag}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.headerActions}>
          {managesThisClub && (
            <Link to={`/dashboard/${club.id}`} className={styles.primaryAction}>
              Manage this club
            </Link>
          )}
          <Link to={`/clubs/${club.id}`} className={styles.ghostAction}>
            Public page
          </Link>
        </div>
      </header>

      {loading ? (
        <SkeletonWorkspace />
      ) : (
        <div className={styles.layout}>
          <div className={styles.column}>
            <section className={styles.section} aria-labelledby="workspace-announcements">
              <div className={styles.sectionHead}>
                <h2 id="workspace-announcements" className={styles.sectionTitle}>
                  Noticeboard
                </h2>
                <span className={styles.sectionNote}>
                  {latestAnnouncements.length
                    ? `${announcements.length} post${announcements.length === 1 ? "" : "s"}`
                    : "All quiet"}
                </span>
              </div>

              {latestAnnouncements.length === 0 ? (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>Nothing pinned up yet</p>
                  <p className={styles.emptyBody}>
                    {managesThisClub
                      ? "Post the first update from the club dashboard — meeting changes, deadlines, anything members should see."
                      : "Club admins haven't posted an update yet. Check back after the next meeting."}
                  </p>
                  {managesThisClub && (
                    <Link to={`/dashboard/${club.id}`} className={styles.inlineLink}>
                      Post an announcement
                    </Link>
                  )}
                </div>
              ) : (
                <ul className={styles.notes}>
                  {latestAnnouncements.map((note, index) => (
                    <li
                      key={note.id}
                      className={styles.note}
                      style={{ "--note-index": index }}
                    >
                      <p className={styles.noteText}>{note.text}</p>
                      <time className={styles.noteTime} dateTime={note.createdAt}>
                        {timeAgo(note.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.section} aria-labelledby="workspace-events">
              <div className={styles.sectionHead}>
                <h2 id="workspace-events" className={styles.sectionTitle}>
                  Next up
                </h2>
                <Link to="/my-events" className={styles.sectionLink}>
                  My events
                </Link>
              </div>

              {upcoming.length === 0 ? (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>No events on the calendar</p>
                  <p className={styles.emptyBody}>
                    {managesThisClub
                      ? "Add the next meeting or event from the club dashboard."
                      : "Nothing scheduled right now. Announcements will show up here."}
                  </p>
                </div>
              ) : (
                <ul className={styles.eventList}>
                  {upcoming.slice(0, 4).map((event, index) => (
                    <li key={event.id} style={{ "--row-index": index }}>
                      <Link to={`/events/${event.id}`} className={styles.eventRow}>
                        <time className={styles.eventDate} dateTime={event.date}>
                          {formatEventDate(event.date)}
                        </time>
                        <span className={styles.eventTitle}>{event.title}</span>
                        <span className={styles.eventWhere}>{event.location}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className={styles.column}>
            <section className={styles.section} aria-labelledby="workspace-roster">
              <div className={styles.sectionHead}>
                <h2 id="workspace-roster" className={styles.sectionTitle}>
                  Members
                </h2>
                <span className={styles.sectionNote}>
                  {members.length} {members.length === 1 ? "person" : "people"}
                </span>
              </div>

              {members.length === 0 ? (
                <p className={styles.emptyBody}>The roster isn&apos;t available right now.</p>
              ) : (
                <ul className={styles.roster}>
                  {members.slice(0, 8).map((member) => (
                    <li key={member.id} className={styles.member}>
                      <span className={styles.avatar} aria-hidden="true">
                        {initials(member.name)}
                      </span>
                      <span className={styles.memberText}>
                        <span className={styles.memberName}>
                          {member.name}
                          {member.id === user.id && (
                            <span className={styles.youTag}>You</span>
                          )}
                        </span>
                        {member.email && <span className={styles.memberEmail}>{member.email}</span>}
                      </span>
                      {member.role !== "member" && (
                        <span className={styles.roleTag}>
                          {member.role === "tier1" ? "Tier 1" : "Admin"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {members.length > 8 && (
                <p className={styles.moreMembers}>
                  and {members.length - 8} more in {club.name}
                </p>
              )}
            </section>

            <section className={styles.section} aria-labelledby="workspace-membership">
              <h2 id="workspace-membership" className={styles.sectionTitle}>
                Membership
              </h2>
              <p className={styles.emptyBody}>
                You&apos;re part of this club, so updates and events appear here first.
              </p>
              {leaveError && <p className={styles.error}>{leaveError}</p>}
              <button
                type="button"
                className={styles.leaveButton}
                onClick={handleLeave}
                disabled={leaving}
              >
                {leaving ? "Leaving…" : `Leave ${club.name}`}
              </button>
              {managesThisClub && (
                <p className={styles.leaveHint}>
                  Leaving keeps your admin role. Ask a tier 1 admin to revoke that.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonWorkspace() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={styles.skeletonBar} style={{ width: "38%" }} />
      <div className={styles.skeletonGrid}>
        <div className={styles.skeletonBlock} />
        <div className={styles.skeletonBlock} />
      </div>
    </div>
  );
}
