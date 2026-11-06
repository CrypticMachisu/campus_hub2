import { Link } from "react-router-dom";
import { formatEventDate } from "../utils/dateTime";
import { downloadEventIcs } from "../utils/calendar";
import styles from "./NextClubEvent.module.css";

/** "Today", "Tomorrow", "in 4 days", "in 3 weeks". */
function countdownLabel(date) {
  const start = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((start - today) / 86_400_000);

  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 14) return "next week";
  return `in ${Math.round(days / 7)} weeks`;
}

function dateParts(date) {
  const parsed = new Date(`${date}T00:00:00`);
  return {
    day: parsed.getDate(),
    month: parsed.toLocaleString(undefined, { month: "short" }),
  };
}

/**
 * The one thing a member is most likely to act on: the club's next event.
 * RSVP is the primary action and is optimistic — the parent owns the state
 * so the agenda and this card always agree.
 */
export default function NextClubEvent({ event, clubName, going, pending, onToggle }) {
  if (!event) {
    return (
      <section className={styles.card} aria-label="Next event">
        <div className={styles.empty}>
          <p className={styles.eyebrow}>Next up</p>
          <p className={styles.emptyTitle}>Nothing on the calendar yet</p>
          <p className={styles.emptyBody}>
            When an event is added it lands here, with a one-tap RSVP.
          </p>
        </div>
      </section>
    );
  }

  const { day, month } = dateParts(event.date);

  return (
    <section className={styles.card} aria-labelledby="next-event-title">
      <div className={styles.dateBlock} aria-hidden="true">
        <span className={styles.month}>{month}</span>
        <span className={styles.day}>{day}</span>
      </div>

      <div className={styles.body}>
        <p className={styles.eyebrow}>
          Next up{" "}
          <span className={styles.dot} aria-hidden="true">
            ·
          </span>{" "}
          <span className={styles.countdown}>{countdownLabel(event.date)}</span>
        </p>

        <h2 id="next-event-title" className={styles.title}>
          {event.title}
        </h2>

        <p className={styles.meta}>
          {formatEventDate(event.date)} · {event.time}
          {event.location ? ` · ${event.location}` : ""}
        </p>

        {going && (
          <p className={styles.goingFlag}>
            <span className={styles.goingDot} aria-hidden="true" />
            You&apos;re going
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={going ? styles.secondaryButton : styles.primaryButton}
            onClick={() => onToggle(event)}
            disabled={pending}
            aria-pressed={going}
          >
            {pending ? "Saving…" : going ? "Can't make it" : "I'm going"}
          </button>

          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => downloadEventIcs(event, clubName)}
          >
            Add to calendar
          </button>

          <Link to={`/events/${event.id}`} className={styles.detailLink}>
            Details
          </Link>
        </div>
      </div>
    </section>
  );
}
