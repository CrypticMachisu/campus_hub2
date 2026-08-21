import { useParams, Link } from "react-router-dom";
import { clubs } from "../data/mockData";
import { getAllEvents } from "../utils/eventsStore";
import EventCard from "../components/EventCard";
import CommentSection from "../components/CommentSection";
import styles from "./ClubProfile.module.css";

export default function ClubProfile() {
  const { clubId } = useParams();
  const club = clubs.find((c) => c.id === clubId);

  // Global consistency layout check
  if (!club) {
    return (
      <div className={styles.notFoundPage}>
        <h2>Club Not Found</h2>
        <p>The club profile you are trying to visit does not exist.</p>
        <Link to="/" className={styles.backLink}>Return to Feed Discovery</Link>
      </div>
    );
  }

  // Filter and sort events cleanly via custom dynamic timestamps parsing
  const clubEvents = getAllEvents()
    .filter((e) => e.clubId === club.id)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return (
    <div className={styles.page}>
      {/* Structural Profile Banner Header */}
      <header className={styles.clubHeader}>
        <div className={styles.headerMain}>
        <img src={club.logoUrl} alt={`${club.name} logo`} className={styles.logo} />
          <div>
            <span className={styles.categoryBadge}>{club.category}</span>
            <h1>{club.name}</h1>
          </div>
        </div>
        <p className={styles.description}>{club.description}</p>
        
        <div className={styles.metaInfo}>
          <p><strong>Meeting Interval:</strong> {club.meetingTime}</p>
          <p><strong>Location Spot:</strong> {club.meetingLocation}</p>
        </div>

        <div className={styles.tagList}>
          {club.tags.map((tag) => (
            <span key={tag} className={styles.tag}>#{tag}</span>
          ))}
        </div>
      </header>

      {/* Target Club Scheduled Events Segment */}
      <section className={styles.eventsSection}>
        <h2>Upcoming Events</h2>
        {clubEvents.length > 0 ? (
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

      {/* Rule 2: Explicit semantic hr element divider separator */}
      <hr className={styles.sectionDivider} />

      {/* Rule 2: Contoured, distinct background tint wrapper isolating conversation tree */}
      <section className={styles.commentsWrapper}>
        <h2>Club Discussion</h2>
        <CommentSection targetType="club" targetId={club.id} />
      </section>
    </div>
  );
}
