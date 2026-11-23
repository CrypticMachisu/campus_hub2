import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useClubs } from "../context/ClubsContext";
import { getAllEvents } from "../utils/eventsStore";
import { getSignups, deleteSignup } from "../utils/storage";
import { getMyCommitments, withdrawCommitment } from "../utils/commitmentsStore";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../utils/notificationsStore";
import { formatEventDate, getEventTimestamp } from "../utils/dateTime";
import { SkeletonGroup, CardStackSkeleton } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import { usePageMetadata } from "../hooks/usePageMetadata";
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
  usePageMetadata({
    title: "My commitments",
    description: "Events you've RSVP'd to and activities you've joined, in one list.",
  });

  const { user } = useAuth();
  const { clubs } = useClubs();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelling, setCancelling] = useState(() => new Set());
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

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
        // Event signups cascade with their event; commitment signups come
        // back attached to the commitment, so both lists render directly.
        const [events, signups, commitments, notices] = await Promise.all([
          getAllEvents(),
          getSignups(),
          getMyCommitments(),
          // Notices are secondary: a notice outage must not hide the tickets.
          getNotifications().catch(() => ({ notifications: [], unreadCount: 0 })),
        ]);
        if (cancelled) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const eventItems = signups
          .map((signup) => {
            const event = events.find((candidate) => candidate.id === signup.eventId);
            return event ? { ...event, type: "event", signup } : null;
          })
          .filter(Boolean);

        const commitmentItems = commitments.map((commitment) => ({
          ...commitment,
          type: "commitment",
        }));

        const joined = [...eventItems, ...commitmentItems]
          .filter((item) => new Date(`${item.date}T00:00:00`) >= today)
          .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));

        setItems(joined);
        setNotifications(notices.notifications || []);
        setUnreadCount(notices.unreadCount || 0);
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

  async function handleRead(notificationId) {
    try {
      const result = await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((notice) =>
          notice.id === notificationId
            ? { ...notice, readAt: notice.readAt || new Date().toISOString() }
            : notice
        )
      );
      setUnreadCount(result.unreadCount);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReadAll() {
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notice) => ({ ...notice, readAt: notice.readAt || readAt }))
      );
      setUnreadCount(0);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCancel(item) {
    const previous = items;
    setNotice("");
    setError("");
    setItems((current) => current.filter((event) => event.id !== item.id));
    setCancelling((current) => new Set(current).add(item.id));

    try {
      if (item.type === "commitment") {
        await withdrawCommitment(item.id);
        setNotice(`Withdrew from ${item.title}. Your place is open for the next person.`);
      } else {
        await deleteSignup(item.signup.id);
        setNotice(`Cancelled your RSVP for ${item.title}.`);
      }
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
          <p className={styles.eyebrow}>Commitments</p>
          <h1>My commitments.</h1>
        </header>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Log in to see your commitments</p>
          <p className={styles.emptyBody}>
            Your commitments are tied to your Kesho account, so they follow you between devices.
          </p>
          <Link to="/login" className={styles.emptyLink}>
            Log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Commitments</p>
        <h1>My commitments.</h1>
        <p className={styles.subtitle}>
          {items.length > 0
            ? `${items.length} upcoming ${items.length === 1 ? "commitment" : "commitments"}`
            : "Everything you've committed to, in one place"}
        </p>
      </header>

      {notifications.length > 0 && (
        <section className={styles.notices} aria-labelledby="notices-heading">
          <div className={styles.noticesHead}>
            <div>
              <p className={styles.eyebrow}>Changes</p>
              <h2 id="notices-heading" className={styles.noticesTitle}>
                Notifications
              </h2>
            </div>
            {unreadCount > 0 && (
              <div className={styles.noticesTools}>
                <span className={styles.unreadCount}>{unreadCount} unread</span>
                <button type="button" className={styles.readAllButton} onClick={handleReadAll}>
                  Mark all as read
                </button>
              </div>
            )}
          </div>

          <ul className={styles.noticesList}>
            {notifications.map((item) => (
              <li
                key={item.id}
                className={
                  item.readAt ? styles.noticeItem : `${styles.noticeItem} ${styles.unread}`
                }
              >
                <div className={styles.noticeCopy}>
                  <p className={styles.noticeTitle}>
                    {!item.readAt && <span className={styles.unreadTag}>New</span>}
                    {item.title}
                  </p>
                  {item.body && <p className={styles.noticeBody}>{item.body}</p>}
                  <p className={styles.noticeMeta}>
                    <time dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString()}
                    </time>
                    {item.link && (
                      <>
                        {" · "}
                        <Link to={item.link} className={styles.noticeLink}>
                          View
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                {!item.readAt && (
                  <button
                    type="button"
                    className={styles.readButton}
                    onClick={() => handleRead(item.id)}
                    aria-label={`Mark "${item.title}" as read`}
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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
        <SkeletonGroup label="Loading your commitments…">
          <CardStackSkeleton count={3} />
        </SkeletonGroup>
      ) : error && items.length === 0 ? (
        <ErrorState
          title="Your commitments didn't load"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing committed yet</p>
          <p className={styles.emptyBody}>
            Commit to an activity or RSVP to something in this week&apos;s edition and it will
            appear here.
          </p>
          <Link to="/discover" className={styles.emptyLink}>
            Browse this week
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
                key={`${item.type}-${item.id}`}
                className={waitlisted ? `${styles.ticket} ${styles.waitlisted}` : styles.ticket}
              >
                <div className={styles.dateBlock} aria-hidden="true">
                  <span className={styles.dateDay}>{day}</span>
                  <span className={styles.dateMonth}>{month}</span>
                </div>

                <div className={styles.ticketBody}>
                  <div className={styles.ticketTop}>
                    <span className={styles.status}>
                      {waitlisted ? "Waitlist" : item.type === "commitment" ? "Committed" : "Going"}
                    </span>
                    {club && <span className={styles.club}>{club.name}</span>}
                  </div>

                  <h2 className={styles.title}>
                    <Link
                      to={
                        item.type === "commitment"
                          ? `/commitments/${item.id}`
                          : `/events/${item.id}`
                      }
                    >
                      {item.title}
                    </Link>
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
                  <Link
                    to={
                      item.type === "commitment" ? `/commitments/${item.id}` : `/events/${item.id}`
                    }
                    className={styles.viewLink}
                  >
                    {item.type === "commitment" ? "View commitment" : "View event"}
                  </Link>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={() => handleCancel(item)}
                    disabled={isCancelling}
                  >
                    {isCancelling
                      ? "Cancelling…"
                      : waitlisted
                        ? "Leave waitlist"
                        : item.type === "commitment"
                          ? "Withdraw"
                          : "Cancel RSVP"}
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
