import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useClubs } from "../context/ClubsContext";
import { getAllEvents } from "../utils/eventsStore";
import { getClub } from "../utils/clubsStore";
import { CROSS_UNIVERSITY_ENABLED } from "../utils/features";
import EventCard from "../components/EventCard";
import CommentSection from "../components/CommentSection";
import { useAuth } from "../context/AuthContext";
import { canManageClub, isClubMember } from "../utils/authStore";
import { joinClub } from "../utils/membershipStore";
import { requestClubAdmin } from "../utils/adminStore";
import { SkeletonGroup, ClubProfileSkeleton } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import AgriClubSpotlight, { AGRI_CLUB_ID } from "../components/AgriClubSpotlight";
import CommitmentsSection from "../components/CommitmentsSection";
import ClubFeed from "../components/ClubFeed";
import styles from "./ClubProfile.module.css";

export default function ClubProfile() {
  const { clubId } = useParams();
  const { clubs, loading: clubsLoading, error: clubsError, refresh: refreshClubs } = useClubs();
  const club = clubs.find((c) => c.id === clubId);
  const { user } = useAuth();

  const [remoteClub, setRemoteClub] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const profileClub = club || remoteClub;
  const isRemote = Boolean(
    profileClub && user && profileClub.campusId !== user.campusId && user.role !== "tier1"
  );

  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState("");
  const [eventsReloadKey, setEventsReloadKey] = useState(0);

  // A club opened from My network is not in the local club context. Fetch its
  // identity through the network scope; the server still decides eligibility.
  useEffect(() => {
    if (club || clubsLoading || !CROSS_UNIVERSITY_ENABLED || !user) return;
    let cancelled = false;
    setRemoteClub(null);
    setRemoteLoading(true);
    getClub(clubId, { scope: "network" })
      .then((result) => {
        if (!cancelled) setRemoteClub(result);
      })
      .catch(() => {
        if (!cancelled) setRemoteClub(null);
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [club, clubId, clubsLoading, user]);

  useEffect(() => {
    let cancelled = false;
    setEventsError("");
    if (isRemote) {
      setEvents([]);
      return;
    }
    getAllEvents()
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch((error) => {
        // The club header can still render when events fail, so handle this
        // here rather than leaving the promise rejection unhandled.
        if (!cancelled) setEventsError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [eventsReloadKey, isRemote]);

  if (clubsLoading || remoteLoading) {
    return (
      <div className={styles.page}>
        <SkeletonGroup label="Loading club…">
          <ClubProfileSkeleton />
        </SkeletonGroup>
      </div>
    );
  }

  if (clubsError && clubs.length === 0) {
    return (
      <div className={styles.page}>
        <ErrorState title="This club didn't load" message={clubsError} onRetry={refreshClubs} />
      </div>
    );
  }

  // Global consistency layout check
  if (!profileClub) {
    return (
      <div className={styles.notFoundPage}>
        <h2>Club Not Found</h2>
        <p>
          The club profile you are trying to visit does not exist, or it is outside your approved
          network.
        </p>
        <Link to={CROSS_UNIVERSITY_ENABLED && user ? "/network" : "/"} className={styles.backLink}>
          {CROSS_UNIVERSITY_ENABLED && user ? "Back to My network" : "Back to this week"}
        </Link>
      </div>
    );
  }

  // Filter and sort events cleanly via custom dynamic timestamps parsing
  const clubEvents = events
    .filter((e) => e.clubId === profileClub.id)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return (
    <div className={styles.page}>
      {isRemote && (
        <Link to="/network" className={styles.backToNetwork}>
          ← My network
        </Link>
      )}

      {/* Structural Profile Banner Header */}
      <header className={styles.clubHeader}>
        <div className={styles.headerMain}>
          <img src={profileClub.logoUrl} alt={`${profileClub.name} logo`} className={styles.logo} />
          <div>
            <span className={styles.categoryBadge}>{profileClub.category}</span>
            <h1>{profileClub.name}</h1>
            {isRemote && <p className={styles.remoteCampus}>{profileClub.campusName}</p>}
          </div>
        </div>
        <p className={styles.description}>{profileClub.description}</p>

        <div className={styles.metaInfo}>
          <p>
            <strong>Meeting Interval:</strong> {profileClub.meetingTime}
          </p>
          <p>
            <strong>Location Spot:</strong> {profileClub.meetingLocation}
          </p>
        </div>

        <div className={styles.tagList}>
          {profileClub.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              #{tag}
            </span>
          ))}
        </div>
      </header>

      {isRemote && (
        <p className={styles.remoteNote}>
          <strong>Read-only network view.</strong> Network-published events appear in My network.
          Posts, commitments and membership stay on {profileClub.campusName}.
        </p>
      )}

      {!isRemote && user && !["tier1", "campus_admin"].includes(user.role) && (
        <MembershipBar club={profileClub} />
      )}

      {!isRemote && user && profileClub && !canManageClub(user, profileClub.id) && (
        <AdminRequestButton clubId={profileClub.id} />
      )}

      {/* Agri club only: the club's own recruitment block */}
      {!isRemote && profileClub.id === AGRI_CLUB_ID && <AgriClubSpotlight />}

      {/* Target Club Scheduled Events Segment */}

      <section id="events" className={styles.eventsSection}>
        <h2>{isRemote ? "Campus activity" : "Next on the programme"}</h2>
        {isRemote ? (
          <div className={styles.emptyEventsBox}>
            <p>
              Network-published events are listed in My network. Campus-only events, posts,
              commitments and membership remain on {profileClub.campusName}.
            </p>
          </div>
        ) : eventsError ? (
          <ErrorState
            title="Events didn't load"
            message={eventsError}
            onRetry={() => setEventsReloadKey((key) => key + 1)}
          />
        ) : clubEvents.length > 0 ? (
          <div className={styles.eventsGrid}>
            {clubEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyEventsBox}>
            <p>No upcoming events are currently planned for this club.</p>
          </div>
        )}
      </section>

      {/* Every club's dated activities — the Agri-only panel is gone. */}
      {!isRemote && <CommitmentsSection clubId={profileClub.id} />}

      {/* The club's own dispatches, with comments at each permalink. */}
      {!isRemote && <ClubFeed clubId={profileClub.id} />}

      {!isRemote && (
        <>
          {/* Rule 2: Explicit semantic hr element divider separator */}
          <hr className={styles.sectionDivider} />

          {/* Rule 2: Contoured, distinct background tint wrapper isolating conversation tree */}
          <section className={styles.commentsWrapper}>
            <h2>Club discussion</h2>
            <CommentSection targetType="club" targetId={profileClub.id} />
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Join/"you're in" strip on the public club page.
 * Joining is what moves a user from the generic discovery UI into the
 * member workspace, so the confirmation links there directly.
 */
function MembershipBar({ club }) {
  const { user, applyUser } = useAuth();
  const [status, setStatus] = useState("idle"); // idle | joining | error
  const [error, setError] = useState("");

  if (isClubMember(user, club.id)) {
    return (
      <p className={styles.memberNote}>
        You&apos;re a member of this club.{" "}
        <Link to={`/workspace/${club.id}`} className={styles.memberLink}>
          Open your club workspace
        </Link>
      </p>
    );
  }

  async function handleJoin() {
    setStatus("joining");
    setError("");
    try {
      const updatedUser = await joinClub(club.id);
      applyUser(updatedUser);
      setStatus("idle");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  return (
    <div className={styles.membershipBar}>
      <button
        type="button"
        className={styles.joinButton}
        onClick={handleJoin}
        disabled={status === "joining"}
      >
        {status === "joining" ? "Joining…" : `Join ${club.name}`}
      </button>
      <p className={styles.joinHint}>Joining swaps this discovery feed for your club workspace.</p>
      {status === "error" && <p className={styles.error}>{error}</p>}
    </div>
  );
}

// Lets a logged-in user who doesn't already manage this club ask a
// tier1 admin for admin access to it.
function AdminRequestButton({ clubId }) {
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  async function handleRequest() {
    setStatus("sending");
    try {
      await requestClubAdmin(clubId);
      setStatus("sent");
      setMessage("Request sent — a tier 1 admin will review it.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message);
    }
  }

  if (status === "sent") {
    return <p className={styles.adminRequestNote}>{message}</p>;
  }

  return (
    <div className={styles.adminRequestBox}>
      <button
        type="button"
        className={styles.adminRequestButton}
        onClick={handleRequest}
        disabled={status === "sending"}
      >
        {status === "sending" ? "Sending…" : "Request admin access for this club"}
      </button>
      {status === "error" && <p className={styles.error}>{message}</p>}
    </div>
  );
}
