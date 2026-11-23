import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useClubs } from "../context/ClubsContext";
import { useAuth } from "../context/AuthContext";
import { canManageClub, isClubMember } from "../utils/authStore";
import { getAllEvents } from "../utils/eventsStore";
import { getAnnouncements } from "../utils/dashboardStorage";
import { getClubMembers, leaveClub } from "../utils/membershipStore";
import { getComments } from "../utils/commentsStore";
import {
  getWorkspacePins,
  pinWorkspaceItem,
  unpinWorkspaceItem,
} from "../utils/workspacePinsStore";
import { getSignups, saveSignup, deleteSignup } from "../utils/storage";
import { getClubPlaybook } from "../utils/clubPlaybook";
import NextClubEvent from "../components/NextClubEvent";
import ClubFocusPanel from "../components/ClubFocusPanel";
import CommitmentsSection from "../components/CommitmentsSection";
import ClubAgenda from "../components/ClubAgenda";
import CommentSection from "../components/CommentSection";
import ErrorState from "../components/ErrorState";
import { Skeleton, SkeletonGroup } from "../components/Skeleton";
import { useFlipLayout } from "../motion/useFlipLayout";
import { usePageMetadata } from "../hooks/usePageMetadata";
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

function pinKey(itemType, itemId) {
  return `${itemType}:${itemId}`;
}

const DEFAULT_PLATE_COUNTS = { feed: 3, roster: 5 };

function clampPlateCount(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function readPlateCounts(storageKey) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    return {
      feed: clampPlateCount(saved.feed, 1, 6, DEFAULT_PLATE_COUNTS.feed),
      roster: clampPlateCount(saved.roster, 1, 8, DEFAULT_PLATE_COUNTS.roster),
    };
  } catch {
    return DEFAULT_PLATE_COUNTS;
  }
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

  usePageMetadata({
    title: club ? `${club.name} workspace` : "Club workspace",
    description: club
      ? `Your member workspace for ${club.name}: events, commitments, and club updates.`
      : "Your Kesho club workspace.",
  });

  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [members, setMembers] = useState([]);
  const [signups, setSignups] = useState([]);
  const [clubComments, setClubComments] = useState([]);
  const [loadState, setLoadState] = useState({
    events: true,
    announcements: true,
    members: true,
    signups: true,
    comments: true,
    pins: true,
  });
  const [workspacePins, setWorkspacePins] = useState([]);
  const [pinPending, setPinPending] = useState("");
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [statusNote, setStatusNote] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState(false);

  const plateStorageKey = `campushub_workspace_plate_counts:${user?.id || "guest"}:${clubId || "none"}`;
  const [plateCounts, setPlateCounts] = useState(() => readPlateCounts(plateStorageKey));

  const discussionRef = useRef(null);
  const feedListRef = useRef(null);
  const captureFeedFlip = useFlipLayout(feedListRef, { selector: "[data-feed-item]" });

  useEffect(() => {
    setPlateCounts(readPlateCounts(plateStorageKey));
  }, [plateStorageKey]);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setEvents([]);
    setAnnouncements([]);
    setMembers([]);
    setSignups([]);
    setClubComments([]);
    setWorkspacePins([]);
    setLoadState({
      events: true,
      announcements: true,
      members: true,
      signups: true,
      comments: true,
      pins: true,
    });

    // Independent panels: each plate lands on its own response. A roster or
    // discussion failure never blanks the next event or the feed.
    const tasks = [
      ["events", getAllEvents(), setEvents],
      ["announcements", getAnnouncements(clubId), setAnnouncements],
      ["members", getClubMembers(clubId), setMembers],
      ["signups", getSignups(), setSignups],
      ["comments", getComments("club", clubId), setClubComments],
      ["pins", getWorkspacePins(clubId), setWorkspacePins],
    ];

    tasks.forEach(([panel, request, apply]) => {
      request
        .then((value) => {
          if (cancelled) return;
          apply(value);
          setLoadState((current) => ({ ...current, [panel]: false }));
        })
        .catch(() => {
          if (cancelled) return;
          setLoadState((current) => ({ ...current, [panel]: false }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  // Once the real feed and roster arrive, remember how many rows each plate
  // needed. The next visit starts a skeleton at that size, so the page settles
  // by roughly the same amount regardless of the club's list lengths.
  useEffect(() => {
    if (loadState.announcements || loadState.comments || loadState.members) return;
    const feedCount = clampPlateCount(
      Math.min(
        6,
        announcements.length + clubComments.filter((comment) => !comment.parentId).length
      ),
      1,
      6,
      DEFAULT_PLATE_COUNTS.feed
    );
    const rosterCount = clampPlateCount(
      Math.min(8, members.length),
      1,
      8,
      DEFAULT_PLATE_COUNTS.roster
    );
    const next = { feed: feedCount, roster: rosterCount };

    setPlateCounts((current) =>
      current.feed === next.feed && current.roster === next.roster ? current : next
    );
    try {
      window.localStorage.setItem(plateStorageKey, JSON.stringify(next));
    } catch {
      // The counts are a loading nicety; a private-mode failure is harmless.
    }
  }, [
    loadState.announcements,
    loadState.comments,
    loadState.members,
    announcements,
    clubComments,
    members,
    plateStorageKey,
  ]);

  const pinnedRank = useMemo(
    () => new Map(workspacePins.map((pin, index) => [pinKey(pin.itemType, pin.itemId), index])),
    [workspacePins]
  );
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
  const nextReady = !loadState.events && !loadState.signups;
  const agendaReady = !loadState.events;
  const feedReady = !loadState.announcements && !loadState.comments && !loadState.pins;
  const rosterReady = !loadState.members;

  const feed = [
    ...announcements.map((note) => ({
      key: `announcement-${note.id}`,
      source: "announcement",
      sourceId: note.id,
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
        source: "comment",
        sourceId: comment.id,
        kind: "Discussion",
        text: comment.text,
        author: comment.userName,
        at: comment.createdAt,
      })),
  ]
    .sort((a, b) => {
      const aPin = pinKey(a.source, a.sourceId);
      const bPin = pinKey(b.source, b.sourceId);
      const aPinned = pinnedRank.has(aPin);
      const bPinned = pinnedRank.has(bPin);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && bPinned) return pinnedRank.get(aPin) - pinnedRank.get(bPin);
      return new Date(b.at) - new Date(a.at);
    })
    .slice(0, 6);
  const pinnedFeedCount = feed.filter((item) =>
    pinnedRank.has(pinKey(item.source, item.sourceId))
  ).length;

  async function toggleFeedPin(item) {
    if (!managesThisClub || pinPending) return;
    const itemPinKey = pinKey(item.source, item.sourceId);
    const wasPinned = pinnedRank.has(itemPinKey);
    const previous = workspacePins;
    const next = wasPinned
      ? previous.filter((pin) => pinKey(pin.itemType, pin.itemId) !== itemPinKey)
      : [
          { itemType: item.source, itemId: item.sourceId },
          ...previous.filter((pin) => pinKey(pin.itemType, pin.itemId) !== itemPinKey),
        ];
    const label = `${item.kind}${item.author ? ` from ${item.author}` : ""}`;

    captureFeedFlip();
    setWorkspacePins(next);
    setPinPending(itemPinKey);
    setStatusNote(
      wasPinned ? `${label} unpinned for the club.` : `${label} pinned for the club. Saving...`
    );

    try {
      if (wasPinned) {
        await unpinWorkspaceItem({
          clubId,
          itemType: item.source,
          itemId: item.sourceId,
        });
      } else {
        await pinWorkspaceItem({
          clubId,
          itemType: item.source,
          itemId: item.sourceId,
        });
      }
      setStatusNote(
        wasPinned
          ? `${label} unpinned. The club feed order is updated.`
          : `${label} pinned for everyone in the club.`
      );
    } catch (err) {
      captureFeedFlip();
      setWorkspacePins(previous);
      setStatusNote(`Pin failed: ${err.message} The previous order was restored.`);
    } finally {
      setPinPending("");
    }
  }

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

      <div className={styles.quickActions}>
        <button type="button" className={styles.quickAction} onClick={focusDiscussion}>
          Ask the club
        </button>
        <Link to="/my-events" className={styles.quickAction}>
          My commitments
        </Link>
        {managesThisClub ? (
          <Link to={`/dashboard/${club.id}`} className={styles.quickAction}>
            Write a post
          </Link>
        ) : (
          <Link to={`/clubs/${club.id}`} className={styles.quickAction}>
            Club page &amp; comments
          </Link>
        )}
      </div>

      {nextReady ? (
        <div data-workspace-plate="next" aria-busy="false">
          <NextClubEvent
            event={nextEvent}
            clubName={club.name}
            going={Boolean(nextSignup)}
            waitlisted={Boolean(nextSignup?.waitlisted)}
            pending={Boolean(nextEvent && pendingIds.has(nextEvent.id))}
            onToggle={toggleRsvp}
            playbook={playbook}
          />
        </div>
      ) : (
        <NextEventPlate />
      )}

      <div className={styles.layout}>
        <div className={styles.column}>
          <ClubFocusPanel playbook={playbook} clubName={club.name} />
          {/* Dated work a member can commit to, for every club. */}
          <CommitmentsSection
            clubId={club.id}
            heading="Upcoming commitments"
            canPublishToNetwork={Boolean(club.familyId)}
          />
          {agendaReady ? (
            <ClubAgenda
              events={clubEvents}
              signupFor={signupFor}
              pendingIds={pendingIds}
              onToggle={toggleRsvp}
            />
          ) : (
            <AgendaPlate />
          )}{" "}
          <section
            className={styles.section}
            aria-labelledby="workspace-feed"
            aria-busy={!feedReady}
            data-workspace-plate="feed"
          >
            <div className={styles.sectionHead}>
              <h2 id="workspace-feed" className={styles.sectionTitle}>
                Club feed
              </h2>
              <span className={styles.sectionNote}>
                {!feedReady
                  ? "Loading"
                  : feed.length
                    ? `${feed.length} items${pinnedFeedCount ? ` · ${pinnedFeedCount} pinned` : ""}`
                    : "Nothing yet"}
              </span>
            </div>{" "}
            {!feedReady ? (
              <FeedPlate count={plateCounts.feed} />
            ) : feed.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>No activity yet</p>
                <p className={styles.emptyBody}>
                  Announcements and discussion will appear here as the club posts them.
                </p>
              </div>
            ) : (
              <ul className={styles.feed} ref={feedListRef}>
                {" "}
                {feed.map((item, index) => {
                  const itemPinKey = pinKey(item.source, item.sourceId);
                  const pinned = pinnedRank.has(itemPinKey);
                  const itemLabel = `${item.kind}${item.author ? ` from ${item.author}` : ""}`;
                  const saving = pinPending === itemPinKey;
                  return (
                    <li
                      key={item.key}
                      data-feed-item={item.key}
                      className={`${styles.feedItem}${pinned ? ` ${styles.feedItemPinned}` : ""}`}
                      style={{ "--feed-index": index }}
                    >
                      <div className={styles.feedTop}>
                        <p className={styles.feedKind}>
                          {item.kind}
                          {item.author ? ` · ${item.author}` : ""}{" "}
                          {pinned && <span className={styles.pinnedBadge}>Pinned</span>}
                        </p>
                        {managesThisClub && (
                          <button
                            type="button"
                            className={styles.pinButton}
                            aria-pressed={pinned}
                            disabled={saving || Boolean(pinPending)}
                            aria-label={
                              pinned
                                ? `Unpin ${itemLabel} for the club`
                                : `Pin ${itemLabel} for the club`
                            }
                            title={pinned ? "Pinned for the club" : "Pin for the whole club"}
                            onClick={() => toggleFeedPin(item)}
                          >
                            {saving ? "Saving…" : pinned ? "Unpin" : "Pin"}
                          </button>
                        )}
                      </div>
                      <p className={styles.feedText}>{item.text}</p>
                      <time className={styles.feedTime} dateTime={item.at}>
                        {timeAgo(item.at)}
                      </time>
                    </li>
                  );
                })}
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
          </section>{" "}
          <section
            className={styles.section}
            aria-labelledby="workspace-roster"
            aria-busy={!rosterReady}
            data-workspace-plate="roster"
          >
            <div className={styles.sectionHead}>
              <h2 id="workspace-roster" className={styles.sectionTitle}>
                Members
              </h2>
              <span className={styles.sectionNote}>
                {!rosterReady
                  ? "Loading"
                  : `${members.length} ${members.length === 1 ? "person" : "people"}`}
              </span>
            </div>{" "}
            {!rosterReady ? (
              <RosterPlate count={plateCounts.roster} />
            ) : members.length === 0 ? (
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
                      {member.email && <span className={styles.memberEmail}>{member.email}</span>}
                    </span>
                    {member.role !== "member" && (
                      <span className={styles.roleTag}>
                        {member.role === "tier1"
                          ? "Platform admin"
                          : member.role === "campus_admin"
                            ? "Campus admin"
                            : "Club admin"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {rosterReady && members.length > 8 && (
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
                Leaving keeps your admin role. Ask a platform admin to revoke that.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function NextEventPlate() {
  return (
    <section
      className={styles.nextPlate}
      aria-busy="true"
      aria-label="Next event"
      data-workspace-plate="next"
    >
      <SkeletonGroup label="Loading the next event" className={styles.nextPlateGroup}>
        <div className={styles.nextSkeletonCard} aria-hidden="true">
          <Skeleton width={74} height={92} />
          <div className={styles.nextSkeletonBody}>
            <Skeleton width="31%" height={10} />
            <Skeleton width="72%" height={28} />
            <Skeleton width="54%" height={13} />
            <div className={styles.nextSkeletonActions}>
              <Skeleton width={122} height={42} />
              <Skeleton width={132} height={42} />
            </div>
          </div>
        </div>
      </SkeletonGroup>
    </section>
  );
}

function FeedPlate({ count = DEFAULT_PLATE_COUNTS.feed }) {
  return (
    <SkeletonGroup label="Loading the club feed" className={styles.feedPlate}>
      <ul className={styles.feedSkeleton} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className={styles.feedSkeletonItem}>
            <Skeleton width="24%" height={10} />
            <Skeleton width={index === 1 ? "82%" : "92%"} height={14} />
            <Skeleton width={index === 1 ? "58%" : "66%"} height={14} />
            <Skeleton width="16%" height={9} />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

function RosterPlate({ count = DEFAULT_PLATE_COUNTS.roster }) {
  return (
    <SkeletonGroup label="Loading the member roster" className={styles.rosterPlate}>
      <div className={styles.rosterSkeleton} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className={styles.rosterSkeletonRow}>
            <Skeleton width={30} height={30} radius="50%" />
            <div className={styles.rosterSkeletonCopy}>
              <Skeleton width={index % 2 ? "62%" : "74%"} height={12} />
              <Skeleton width="82%" height={9} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

function AgendaPlate() {
  return (
    <section
      className={styles.agendaPlate}
      aria-busy="true"
      aria-label="Agenda"
      data-workspace-plate="agenda"
    >
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle} aria-hidden="true">
          Agenda
        </span>
        <span className={styles.sectionNote}>Loading</span>
      </div>
      <SkeletonGroup label="Loading the agenda" className={styles.agendaSkeleton}>
        <div aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className={styles.agendaSkeletonRow}>
              <Skeleton width={86} height={14} />
              <Skeleton width={index === 1 ? "48%" : "58%"} height={16} />
              <Skeleton width={92} height={32} />
            </div>
          ))}
        </div>
      </SkeletonGroup>
    </section>
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
