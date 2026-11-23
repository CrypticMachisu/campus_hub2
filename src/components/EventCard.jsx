import { useState } from "react";
import { Link } from "react-router-dom";
import { formatEventDate } from "../utils/dateTime";
import { EVENT_IMAGE_FALLBACK } from "../utils/images";
import styles from "./EventCard.module.css";

/**
 * @typedef {Object} Event
 * @property {string} id
 * @property {string} clubId
 * @property {string} title
 * @property {string} date ISO date, YYYY-MM-DD
 * @property {string} time 24hr HH:MM
 * @property {string} location
 * @property {string} imageUrl
 */

/**
 * Clickable summary card for an event, linking to its detail page.
 * @param {{ event: Event, clubName?: string }} props
 */
export default function EventCard({ event, clubName }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = !event.imageUrl || imageFailed ? EVENT_IMAGE_FALLBACK : event.imageUrl;

  return (
    <Link to={`/events/${event.id}`} className={styles.card}>
      <img className={styles.image} src={imageSrc} alt="" onError={() => setImageFailed(true)} />
      <div className={styles.body}>
        {clubName && <span className={styles.club}>{clubName}</span>}
        <h3 className={styles.title}>{event.title}</h3>
        <p className={styles.meta}>
          {formatEventDate(event.date)} · {event.time} · {event.location}
        </p>
      </div>
    </Link>
  );
}
