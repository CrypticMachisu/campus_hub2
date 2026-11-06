import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useClubs } from "../context/ClubsContext";
import { getAllEvents } from "../utils/eventsStore";
import { getSignups, deleteSignup } from "../utils/storage";
import { formatEventDate, getEventTimestamp } from "../utils/dateTime";
import { SkeletonGroup, CardStackSkeleton } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import styles from "./MyEvents.module.css";

/** Big calendar-page look: day number over a short month. */
function dateParts(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "–", month: "" };
  return {
    day: date.getDate(),
    month: date.toLocaleString(undefined, { month: "short" }),
  };
}

/**
 * The signed-in user's upcoming RSVPs, shown as a stack of ticket stubs.
 * Waitlisted signups stay on the list (they're still commitments) but are
 * visibly stamped so nobody turns up expecting a seat.
 */
export default function MyEvents() {
  const { user } = useAuth();
  const { clubs } = useClubs();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelling, setCancelling] = useState(() => new Set());

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        // Signups cascade with their event, so every signup has an event.
        const [events, signups] = await Promise.all([getAllEvents(), getSignups()]);
        if (cancelled) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const joined = signups
          .map((signup) => {
            const event = events.find((candidate) => candidate.id === signup.eventId);
            return event ? { ...event, signup } : null;
          })
          .filter(Boolean)
          .filter((item) => new Date(`${item.date}T00:00:00`) >= today)
          .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));

        setItems(joined);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [user, reloadKey]);

  async function handleCancel(item) {
    const previous = items;
    setNotice("");
    setError("");
    setItems((current) => current.filter((event) => event.id !== item.id));
    setCancelling((current) => new Set(current).add(item.id));

    try {
      await deleteSignup(item.signup.id);
      setNotice(`Cancelled your RSVP for ${item.title}.`);
    } catch (err) {
      // Put the ticket back where it was rather than lying about the cancel.
      setItems(previous);
      setError(err.message);
    } finally {
      setCancelling((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  if (!user) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Your calendar</p>
          <h1>My Events</h1>
        </header>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Log in to see your events</p>
          <p className={styles.emptyBody}>
            Your RSVPs are tied to your CampusHub account, so they follow you between devices.
          </p>
          <Link to="/login" className={styles.emptyLink}>
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Your calendar</p>
        <h1>My Events</h1>
        <p className={styles.subtitle}>
          {items.length > 0
            ? `${items.length} upcoming ${items.length === 1 ? "event" : "events"}`
            : "Everything you've RSVP'd to, in one place"}
        </p>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {error && items.length > 0 && (
        <div className={styles.errorBar} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Refresh
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonGroup label="Loading your events…">
          <CardStackSkeleton count={3} />
        </SkeletonGroup>
      ) : error && items.length === 0 ? (
        <ErrorState
          title="Your events didn't load"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No events on your calendar</p>
          <p className={styles.emptyBody}>
            RSVP to something on the discovery feed and it will appear here.
          </p>
          <Link to="/discover" className={styles.emptyLink}>
            Browse events
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const { day, month } = dateParts(item.date);
            const waitlisted = Boolean(item.signup?.waitlisted);
            const club = clubs.find((candidate) => candidate.id === item.clubId);
            const isCancelling = cancelling.has(item.id);

            return (
              <li
                key={item.id}
                className={waitlisted ? `${styles.ticket} ${styles.waitlisted}` : styles.ticket}
              >
                <div className={styles.dateBlock} aria-hidden="true">
                  <span className={styles.dateDay}>{day}</span>
                  <span className={styles.dateMonth}>{month}</span>
                </div>

                <div className={styles.ticketBody}>
                  <div className={styles.ticketTop}>
                    <span className={styles.status}>{waitlisted ? "Waitlist" : "Going"}</span>
                    {club && <span className={styles.club}>{club.name}</span>}
                  </div>

                  <h2 className={styles.title}>
                    <Link to={`/events/${item.id}`}>{item.title}</Link>
                  </h2>

                  <p className={styles.meta}>
                    <span>{formatEventDate(item.date)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="mono">{item.time}</span>
                    {item.location && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{item.location}</span>
                      </>
                    )}
                  </p>

                  {waitlisted && (
                    <p className={styles.waitlistNote}>
                      You&apos;re on the waitlist
                      {item.signup.position ? ` at position ${item.signup.position}` : ""}.
                      We&apos;ll promote you if a seat opens.
                    </p>
                  )}
                </div>

                <div className={styles.actions}>
                  <Link to={`/events/${item.id}`} className={styles.viewLink}>
                    View event
                  </Link>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={() => handleCancel(item)}
                    disabled={isCancelling}
                  >
                    {isCancelling ? "Cancelling…" : waitlisted ? "Leave waitlist" : "Cancel RSVP"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
