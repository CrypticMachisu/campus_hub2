import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getAllEvents } from "../utils/eventsStore";
import { useAuth } from "../context/AuthContext";
import { useClubs } from "../context/ClubsContext";
import { getSignups, saveSignup, deleteSignup } from "../utils/storage";
import { formatEventDate, isPastEvent } from "../utils/dateTime";
import CommentSection from "../components/CommentSection";
import ErrorState from "../components/ErrorState";
import { SkeletonGroup, EventDetailSkeleton } from "../components/Skeleton";
import styles from "./EventDetail.module.css";

/** Builds and downloads a one-event .ics file (no dependency needed). */
function downloadIcs(event, clubName) {
  const start = new Date(`${event.date}T${event.time || "00:00"}:00`);
  if (Number.isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (value = "") =>
    value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CampusHub//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@campushub`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(event.location)}`,
    `DESCRIPTION:${escape(event.description)}${clubName ? `\\nHosted by ${escape(clubName)}` : ""}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function EventDetail() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const { clubs } = useClubs();

  const [event, setEvent] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  const [signup, setSignup] = useState(null);
  const [signupLoading, setSignupLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPageLoading(true);
    setLoadError("");
    setImageFailed(false);

    getAllEvents()
      .then((events) => {
        if (!cancelled) setEvent(events.find((candidate) => candidate.id === eventId) || null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey]);

  useEffect(() => {
    if (!user || !event) {
      setSignup(null);
      setSignupLoading(false);
      return;
    }

    let cancelled = false;
    setSignupLoading(true);

    getSignups()
      .then((mine) => {
        if (!cancelled) {
          setSignup(mine.find((candidate) => candidate.eventId === event.id) || null);
        }
      })
      // A failed check must not imply "not signed up": leave the button as-is
      // and let the (idempotent) POST resolve any mismatch.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSignupLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, event]);

  const club = event ? clubs.find((candidate) => candidate.id === event.clubId) : null;
  const past = event ? isPastEvent(event) : false;
  const capacity = event?.capacity ?? null;
  const taken = event?.signupCount ?? 0;
  const full = capacity != null && taken >= capacity;
  const waitlisted = Boolean(signup?.waitlisted);
  const fillPercent = capacity ? Math.min(100, Math.round((taken / capacity) * 100)) : 0;

  async function handleToggleSignup() {
    if (!user || !event || busy) return;

    setBusy(true);
    setActionError("");
    setNotice("");

    try {
      if (signup) {
        await deleteSignup(signup.id);
        setSignup(null);
        setEvent((current) =>
          current
            ? { ...current, signupCount: Math.max(0, (current.signupCount ?? 0) - 1) }
            : current
        );
        setNotice(waitlisted ? "You've left the waitlist." : "Your RSVP was cancelled.");
      } else {
        const saved = await saveSignup({ eventId: event.id });

        // POST returns only the row; fetch the computed waitlist position.
        let next = saved;
        try {
          const mine = await getSignups();
          next = mine.find((candidate) => candidate.eventId === event.id) || saved;
        } catch {
          // Keep the saved row; the waitlist note is nice-to-have.
        }

        setSignup(next);
        setEvent((current) =>
          current ? { ...current, signupCount: (current.signupCount ?? 0) + 1 } : current
        );
        setNotice(
          next.waitlisted
            ? `You're on the waitlist${next.position ? ` at position ${next.position}` : ""}.`
            : "You're going — see you there."
        );
      }
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function primaryLabel() {
    if (past) return "This event has passed";
    if (signupLoading) return "Checking your RSVP…";
    if (signup) return waitlisted ? "Leave waitlist" : "Cancel my RSVP";
    return full ? "Join the waitlist" : "I'm going";
  }

  return (
    <div className={styles.page}>
      <Link to="/discover" className={styles.back}>
        ← Discovery
      </Link>

      {pageLoading ? (
        <SkeletonGroup label="Loading event…">
          <EventDetailSkeleton />
        </SkeletonGroup>
      ) : loadError ? (
        <ErrorState
          title="This event didn't load"
          message={loadError}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : !event ? (
        <div className={styles.missing}>
          <h1>Event not found</h1>
          <p>It may have been removed, or the link may be out of date.</p>
          <Link to="/discover" className={styles.missingLink}>
            Back to discovery
          </Link>
        </div>
      ) : (
        <>
          <article className={styles.poster}>
            <div className={styles.imageWrap}>
              {event.imageUrl && !imageFailed ? (
                <img
                  className={styles.image}
                  src={event.imageUrl}
                  alt=""
                  loading="eager"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className={styles.imageFallback} aria-hidden="true">
                  <span>{event.category}</span>
                </div>
              )}
              <span className={styles.category}>{event.category}</span>
            </div>

            <div className={styles.posterBody}>
              <p className={styles.eyebrow}>
                {club ? (
                  <Link to={`/clubs/${club.id}`} className={styles.clubLink}>
                    {club.name}
                  </Link>
                ) : (
                  "Campus event"
                )}
              </p>

              <h1>{event.title}</h1>

              <p className={styles.metaLine}>
                <span className={styles.metaDate}>{formatEventDate(event.date)}</span>
                <span aria-hidden="true">·</span>
                <span className="mono">{event.time}</span>
                {event.location && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{event.location}</span>
                  </>
                )}
              </p>

              {event.bringNote && (
                <p className={styles.bringNote}>
                  <span>Bring</span> {event.bringNote}
                </p>
              )}
            </div>
          </article>

          <div className={styles.layout}>
            <aside className={styles.rsvp} aria-labelledby="rsvp-title">
              <p className={styles.rsvpEyebrow}>
                {past ? "Closed" : full ? "At capacity" : "RSVP"}
              </p>
              <h2 id="rsvp-title" className={styles.rsvpTitle}>
                {signup
                  ? waitlisted
                    ? "You're on the waitlist"
                    : "You're going"
                  : past
                    ? "This event has ended"
                    : full
                      ? "Waitlist only"
                      : "Save your spot"}
              </h2>

              {capacity != null ? (
                <>
                  <p className={styles.capacity}>
                    <strong>{Math.min(taken, capacity)}</strong> of {capacity} spots taken
                  </p>
                  <div
                    className={styles.meter}
                    role="img"
                    aria-label={`${fillPercent}% of spots taken`}
                  >
                    <span style={{ width: `${fillPercent}%` }} />
                  </div>
                </>
              ) : (
                <p className={styles.capacity}>
                  <strong>{taken}</strong> {taken === 1 ? "person is" : "people are"} going
                </p>
              )}

              {signup && !past && (
                <p className={styles.rsvpStatus}>
                  {waitlisted
                    ? `Waitlist${signup.position ? ` · position ${signup.position}` : ""}`
                    : "Confirmed · see you there"}
                </p>
              )}

              {!user ? (
                <Link to="/login" className={styles.primaryAction}>
                  Log in to RSVP
                </Link>
              ) : (
                <button
                  type="button"
                  className={signup ? styles.cancelAction : styles.primaryAction}
                  onClick={handleToggleSignup}
                  disabled={past || busy || signupLoading}
                >
                  {busy ? "Updating…" : primaryLabel()}
                </button>
              )}

              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => downloadIcs(event, club?.name)}
              >
                Add to calendar
              </button>

              {notice && (
                <p className={styles.notice} role="status">
                  {notice}
                </p>
              )}
              {actionError && (
                <p className={styles.actionError} role="alert">
                  {actionError}
                </p>
              )}
            </aside>

            <div className={styles.main}>
              <section className={styles.section} aria-labelledby="about-title">
                <h2 id="about-title">About this event</h2>
                <p className={styles.description}>
                  {event.description || "The host hasn't added a description yet."}
                </p>
              </section>

              <section className={styles.section} aria-labelledby="discussion-title">
                <h2 id="discussion-title">Questions &amp; discussion</h2>
                <CommentSection targetType="event" targetId={event.id} showHeading={false} />
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
