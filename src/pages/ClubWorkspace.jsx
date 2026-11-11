import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useClubs } from "../context/ClubsContext";
import { useAuth } from "../context/AuthContext";
import { canManageClub, isClubMember } from "../utils/authStore";
import { getAllEvents } from "../utils/eventsStore";
import { getAnnouncements } from "../utils/dashboardStorage";
import { getClubMembers, leaveClub } from "../utils/membershipStore";
import { getComments } from "../utils/commentsStore";
import { getSignups, saveSignup, deleteSignup } from "../utils/storage";
import { getClubPlaybook } from "../utils/clubPlaybook";
import NextClubEvent from "../components/NextClubEvent";
import AgroOpportunities from "../components/AgroOpportunities";
import ClubFocusPanel from "../components/ClubFocusPanel";
import ClubAgenda from "../components/ClubAgenda";
import CommentSection from "../components/CommentSection";
import ErrorState from "../components/ErrorState";
import styles from "./ClubWorkspace.module.css";

/** Compact "3h ago" stamp for the activity feed. */
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

function eventStart(event) {
  return new Date(`${event.date}T${event.time || "00:00"}`).getTime();
}

/**
 * The home screen for someone who belongs to a club: the next event with a
 * one-tap RSVP, the club agenda (including history), a merged activity feed,
 * and the club's discussion — all on one page so the workspace is useful on
 * its own rather than a brochure about the club.
 */
export default function ClubWorkspace() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { clubs, loading: clubsLoading, error: clubsError, refresh: refreshClubs } = useClubs();
  const { user, applyUser } = useAuth();

  const club = clubs.find((c) => c.id === clubId);
  const managesThisClub = canManageClub(user, clubId);

  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [members, setMembers] = useState([]);
  const [signups, setSignups] = useState([]);
  const [clubComments, setClubComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [statusNote, setStatusNote] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState(false);

  const discussionRef = useRef(null);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setLoading(true);

    // Independent panels: a roster or discussion failure shouldn't blank
    // the agenda, so failures are tolerated per-panel.
    Promise.allSettled([
      getAllEvents(),
      getAnnouncements(clubId),
      getClubMembers(clubId),
      getSignups(),
      getComments("club", clubId),
    ]).then(([eventsRes, announcementsRes, membersRes, signupsRes, commentsRes]) => {
      if (cancelled) return;
      if (eventsRes.status === "fulfilled") setEvents(eventsRes.value);
      if (announcementsRes.status === "fulfilled") setAnnouncements(announcementsRes.value);
      if (membersRes.status === "fulfilled") setMembers(membersRes.value);
      if (signupsRes.status === "fulfilled") setSignups(signupsRes.value);
      if (commentsRes.status === "fulfilled") setClubComments(commentsRes.value);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const signupByEvent = useMemo(
    () => new Map(signups.map((signup) => [signup.eventId, signup])),
    [signups]
  );
  const signupFor = useCallback((eventId) => signupByEvent.get(eventId), [signupByEvent]);

  const clubEvents = useMemo(
    () =>
      events
        .filter((event) => event.clubId === clubId)
        .sort((a, b) => eventStart(a) - eventStart(b)),
    [events, clubId]
  );

  const nextEvent = useMemo(
    () => clubEvents.find((event) => eventStart(event) >= Date.now()) || null,
    [clubEvents]
  );
  const nextSignup = nextEvent
    ? signupByEvent.get(nextEvent.id)
    : null; /** Keep an event's tally in step with the optimistic signup list. */
  function bumpSignupCount(eventId, delta) {
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? { ...event, signupCount: Math.max(0, (event.signupCount ?? 0) + delta) }
          : event
      )
    );
  }

  /**
   * Optimistic RSVP: flip the button and the tally immediately, roll both back
   * if the API refuses. Keeps the hero and the agenda reading the same state,
   * including whether a signup landed on the waitlist.
   */
  async function toggleRsvp(event) {
    if (pendingIds.has(event.id)) return;
    const existing = signupByEvent.get(event.id);
    setPendingIds((current) => new Set(current).add(event.id));

    if (existing) {
      setSignups((current) => current.filter((signup) => signup.eventId !== event.id));
      bumpSignupCount(event.id, -1);
      try {
        await deleteSignup(existing.id);
        setStatusNote(
          existing.waitlisted
            ? `You've left the waitlist for ${event.title}.`
            : `Cancelled your RSVP for ${event.title}.`
        );
      } catch (err) {
        setSignups((current) => [...current, existing]);
        bumpSignupCount(event.id, 1);
        setStatusNote(err.message);
      }
    } else {
      // The server waitlists signups past capacity in arrival order; mirror it
      // so the button doesn't flip again once the POST comes back.
      const willWaitlist = event.capacity != null && (event.signupCount ?? 0) + 1 > event.capacity;
      const placeholder = {
        id: `pending-${event.id}`,
        eventId: event.id,
        waitlisted: willWaitlist,
      };
      setSignups((current) => [...current, placeholder]);
      bumpSignupCount(event.id, 1);
      try {
        const saved = await saveSignup({ eventId: event.id });
        setSignups((current) =>
          current.map((signup) =>
            signup.eventId === event.id
              ? { ...saved, waitlisted: signup.waitlisted, position: signup.position }
              : signup
          )
        );
        setStatusNote(
          willWaitlist
            ? `You're on the waitlist for ${event.title}.`
            : `You're going to ${event.title}.`
        );
      } catch (err) {
        setSignups((current) => current.filter((signup) => signup.eventId !== event.id));
        bumpSignupCount(event.id, -1);
        setStatusNote(err.message);
      }
    }

    setPendingIds((current) => {
      const next = new Set(current);
      next.delete(event.id);
      return next;
    });
  }

  function focusDiscussion() {
    const node = discussionRef.current;
    if (!node) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    node.querySelector("input")?.focus({ preventScroll: true });
  }

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

  if (clubsError && clubs.length === 0) {
    return (
      <div className={styles.page}>
        <ErrorState
          title="Your workspace didn't load"
          message={clubsError}
          onRetry={refreshClubs}
        />
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

  // Category default + this club's admin overrides. Drives the hero's RSVP
  // verb, its "what to bring" line, and the focus panel below.
  const playbook = getClubPlaybook(club);

  const feed = [
    ...announcements.map((note) => ({
      key: `announcement-${note.id}`,
      kind: "Announcement",
      text: note.text,
      at: note.createdAt,
    })),
    // Replies stay in the thread they belong to; the feed shows top-level
    // posts only, otherwise every answer would look like a new announcement.
    ...clubComments
      .filter((comment) => !comment.parentId)
      .map((comment) => ({
        key: `comment-${comment.id}`,
        kind: "Discussion",
        text: comment.text,
        author: comment.userName,
        at: comment.createdAt,
      })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 6);

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

      <p className="visually-hidden" role="status">
        {statusNote}
      </p>

      {loading ? (
        <SkeletonWorkspace />
      ) : (
        <>
          <div className={styles.quickActions}>
            <button type="button" className={styles.quickAction} onClick={focusDiscussion}>
              Ask the club
            </button>
            <Link to="/my-events" className={styles.quickAction}>
              My events
            </Link>
            {managesThisClub ? (
              <Link to={`/dashboard/${club.id}`} className={styles.quickAction}>
                Post an update
              </Link>
            ) : (
              <Link to={`/clubs/${club.id}`} className={styles.quickAction}>
                Club page &amp; comments
              </Link>
            )}
          </div>

          <NextClubEvent
            event={nextEvent}
            clubName={club.name}
            going={Boolean(nextSignup)}
            waitlisted={Boolean(nextSignup?.waitlisted)}
            pending={Boolean(nextEvent && pendingIds.has(nextEvent.id))}
            onToggle={toggleRsvp}
            playbook={playbook}
          />

          <div className={styles.layout}>
            <div className={styles.column}>
              <ClubFocusPanel playbook={playbook} clubName={club.name} />

              <ClubAgenda
                events={clubEvents}
                signupFor={signupFor}
                pendingIds={pendingIds}
                onToggle={toggleRsvp}
              />
              {clubId === "club-07" && <AgroOpportunities />}

              <section className={styles.section} aria-labelledby="workspace-feed">
                <div className={styles.sectionHead}>
                  <h2 id="workspace-feed" className={styles.sectionTitle}>
                    Club feed
                  </h2>
                  <span className={styles.sectionNote}>
                    {feed.length ? "Newest first" : "Nothing yet"}
                  </span>
                </div>

                {feed.length === 0 ? (
                  <div className={styles.empty}>
                    <p className={styles.emptyTitle}>No activity yet</p>
                    <p className={styles.emptyBody}>
                      Announcements and discussion will appear here as the club posts them.
                    </p>
                  </div>
                ) : (
                  <ul className={styles.feed}>
                    {feed.map((item, index) => (
                      <li
                        key={item.key}
                        className={styles.feedItem}
                        style={{ "--feed-index": index }}
                      >
                        <p className={styles.feedKind}>
                          {item.kind}
                          {item.author ? ` · ${item.author}` : ""}
                        </p>
                        <p className={styles.feedText}>{item.text}</p>
                        <time className={styles.feedTime} dateTime={item.at}>
                          {timeAgo(item.at)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className={styles.column}>
              <section
                className={styles.section}
                aria-labelledby="workspace-discussion"
                ref={discussionRef}
              >
                <div className={styles.sectionHead}>
                  <h2 id="workspace-discussion" className={styles.sectionTitle}>
                    Club discussion
                  </h2>
                </div>
                <CommentSection targetType="club" targetId={club.id} compact showHeading={false} />
              </section>

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
                            {member.id === user.id && <span className={styles.youTag}>You</span>}
                          </span>
                          {member.email && (
                            <span className={styles.memberEmail}>{member.email}</span>
                          )}
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
        </>
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
