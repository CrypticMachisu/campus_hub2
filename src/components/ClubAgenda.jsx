import { useMemo, useState } from "react";
import { formatEventDate } from "../utils/dateTime";
import CommentSection from "./CommentSection";
import styles from "./ClubAgenda.module.css";

function startOf(event) {
  return new Date(`${event.date}T${event.time || "00:00"}`).getTime();
}

/** First pair of RSVP'd events that overlap (same day, within 2 hours). */
function findClash(goingEvents) {
  for (let i = 0; i < goingEvents.length; i += 1) {
    for (let j = i + 1; j < goingEvents.length; j += 1) {
      const a = goingEvents[i];
      const b = goingEvents[j];
      if (a.date !== b.date) continue;
      if (Math.abs(startOf(a) - startOf(b)) <= 2 * 60 * 60 * 1000) {
        return { a, b };
      }
    }
  }
  return null;
}

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "going", label: "Going" },
  { id: "past", label: "Past" },
];

/**
 * The club's events, split into what's coming, what you've said yes to, and
 * what already happened — with an inline discussion thread per event so
 * members can ask questions without leaving their workspace.
 */
export default function ClubAgenda({ events, signupFor, pendingIds, onToggle }) {
  const [tab, setTab] = useState("upcoming");
  const [openThreadId, setOpenThreadId] = useState(null);

  const { upcoming, going, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...events].sort((a, b) => startOf(a) - startOf(b));
    const upcomingEvents = sorted.filter((event) => startOf(event) >= now);
    return {
      upcoming: upcomingEvents,
      going: upcomingEvents.filter((event) => Boolean(signupFor(event.id))),
      past: sorted.filter((event) => startOf(event) < now).reverse(),
    };
  }, [events, signupFor]);

  const clash = useMemo(() => findClash(going), [going]);

  const visible = tab === "upcoming" ? upcoming : tab === "going" ? going : past;

  return (
    <section className={styles.section} aria-labelledby="agenda-title">
      <div className={styles.head}>
        <h2 id="agenda-title" className={styles.title}>
          Agenda
        </h2>
        <div className={styles.tabs} role="tablist" aria-label="Filter events">
          {TABS.map((entry) => {
            const count =
              entry.id === "upcoming"
                ? upcoming.length
                : entry.id === "going"
                  ? going.length
                  : past.length;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                id={`agenda-tab-${entry.id}`}
                aria-selected={tab === entry.id}
                aria-controls="agenda-panel"
                className={tab === entry.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
                <span className={styles.tabCount}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "going" && clash && (
        <p className={styles.clash} role="status">
          Your RSVPs overlap: <strong>{clash.a.title}</strong> and <strong>{clash.b.title}</strong>{" "}
          are both on {formatEventDate(clash.a.date)}.
        </p>
      )}

      <div id="agenda-panel" role="tabpanel" aria-labelledby={`agenda-tab-${tab}`}>
        {visible.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>
              {tab === "upcoming"
                ? "No upcoming events"
                : tab === "going"
                  ? "You haven't RSVP'd to anything yet"
                  : "No past events yet"}
            </p>
            <p className={styles.emptyBody}>
              {tab === "upcoming"
                ? "This club hasn't scheduled anything new. Announcements will show up in the feed."
                : tab === "going"
                  ? "Tap RSVP on an upcoming event and it will appear here, with a calendar download."
                  : "Once events happen they move here, along with whether you were signed up."}
            </p>
          </div>
        ) : (
          <ul className={styles.list}>
            {visible.map((event) => {
              const signup = signupFor(event.id);
              const isUpcoming = startOf(event) >= Date.now();
              const pending = pendingIds.has(event.id);
              const threadOpen = openThreadId === event.id;

              return (
                <li key={event.id} className={styles.item}>
                  <div className={styles.row}>
                    <time className={styles.date} dateTime={event.date}>
                      {formatEventDate(event.date)}
                    </time>

                    <span className={styles.main}>
                      <span className={styles.eventTitle}>{event.title}</span>
                      <span className={styles.eventMeta}>
                        {event.time}
                        {event.location ? ` · ${event.location}` : ""}
                      </span>
                    </span>

                    <span className={styles.rowActions}>
                      {isUpcoming ? (
                        <button
                          type="button"
                          className={signup ? styles.goingButton : styles.rsvpButton}
                          onClick={() => onToggle(event)}
                          disabled={pending}
                          aria-pressed={Boolean(signup)}
                        >
                          {pending ? "Saving…" : signup ? "Going" : "RSVP"}
                        </button>
                      ) : (
                        <span className={styles.pastStatus}>
                          {signup ? "You were going" : "Ended"}
                        </span>
                      )}

                      <button
                        type="button"
                        className={styles.threadButton}
                        aria-expanded={threadOpen}
                        onClick={() => setOpenThreadId(threadOpen ? null : event.id)}
                      >
                        {threadOpen ? "Hide" : "Discuss"}
                      </button>
                    </span>
                  </div>

                  {threadOpen && <CommentSection compact targetType="event" targetId={event.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
