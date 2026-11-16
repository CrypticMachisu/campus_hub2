import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CATEGORIES } from "../utils/clubsStore";
import { useClubs } from "../context/ClubsContext";
import { useAuth } from "../context/AuthContext";
import { clubsForUser } from "../utils/authStore";
import { getAllEvents } from "../utils/eventsStore";
import { getSignups } from "../utils/storage";
import { getMyCommitments } from "../utils/commitmentsStore";
import { isPastEvent } from "../utils/dateTime";
import { SkeletonGroup, ClubSkeletonCard, EventSkeletonCard } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import styles from "./Home.module.css";

/**
 * Custom hook to debounce fast-changing state values.
 * Prevents unnecessary re-filtering on rapid keystrokes.
 */
function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/** Local wall-clock date as YYYY-MM-DD (never convert through UTC). */
function localIsoDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Sat 22 Nov" from an event's YYYY-MM-DD, without timezone drift. */
function shortDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function dayStamp(isoDate) {
  if (!isoDate) return { day: "—", month: "" };
  const [, month, day] = isoDate.split("-").map(Number);
  const date = new Date(2000, month - 1, day);
  return {
    day: String(day).padStart(2, "0"),
    month: date.toLocaleDateString("en-GB", { month: "short" }),
  };
}

export default function Home() {
  const { clubs, loading: clubsLoading, error: clubsError, refresh: refreshClubs } = useClubs();
  const { user } = useAuth();
  const hasNoClub =
    Boolean(user) && user.role !== "tier1" && clubsForUser(user, clubs).length === 0;
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [eventsReloadKey, setEventsReloadKey] = useState(0);

  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("clubs");
  const [wirePaused, setWirePaused] = useState(false);
  const [leadImageFailed, setLeadImageFailed] = useState(false);
  const [mySignups, setMySignups] = useState([]);
  const [myCommitments, setMyCommitments] = useState([]);

  // Rule 2: 300ms input debouncing execution
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);
    setEventsError("");
    getAllEvents()
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch((err) => {
        if (!cancelled) setEventsError(err.message);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventsReloadKey]);

  // The reader's signed-up events, for the commitments rail. A failure here
  // leaves the rail empty rather than failing the edition.
  useEffect(() => {
    if (!user) {
      setMySignups([]);
      return;
    }
    let cancelled = false;
    getSignups()
      .then((rows) => {
        if (!cancelled) setMySignups(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Commitment signups join the same rail. Kept separate so a commitments
  // outage can't empty the event commitments beside it.
  useEffect(() => {
    if (!user) {
      setMyCommitments([]);
      return;
    }
    let cancelled = false;
    getMyCommitments()
      .then((rows) => {
        if (!cancelled) setMyCommitments(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const searchLower = debouncedSearch.toLowerCase();

  // Filter Clubs: Matches category, name, tags, and expanded description parameter
  const filteredClubs = clubs.filter((club) => {
    const matchesCategory = category === "All" || club.category === category;

    const matchesSearch =
      club.name.toLowerCase().includes(searchLower) ||
      club.description.toLowerCase().includes(searchLower) || // Rule 2: Expanded search
      club.tags.some((tag) => tag.toLowerCase().includes(searchLower));

    return matchesCategory && matchesSearch;
  });

  // Upcoming events, earliest first. Timestamp parsing keeps the sort stable
  // even when a custom event has no explicit time.
  const upcomingEvents = events
    .filter((event) => !isPastEvent(event))
    .sort(
      (a, b) =>
        Date.parse(`${a.date}T${a.time || "00:00"}`) - Date.parse(`${b.date}T${b.time || "00:00"}`)
    );

  const filteredEvents = upcomingEvents.filter((event) => {
    const matchesCategory = category === "All" || event.category === category;
    const matchesSearch =
      event.title.toLowerCase().includes(searchLower) ||
      event.description?.toLowerCase().includes(searchLower) ||
      event.tags?.some((tag) => tag.toLowerCase().includes(searchLower));

    return matchesCategory && matchesSearch;
  });

  const lead = upcomingEvents[0] || null;
  const leadClub = lead ? clubs.find((club) => club.id === lead.clubId) : null;
  const leadStamp = lead ? dayStamp(lead.date) : null;

  // This week's remaining dates, used by the rail and the "nothing on" note.
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = localIsoDate(weekEnd);
  const todayIso = localIsoDate(new Date());
  const thisWeek = upcomingEvents.filter(
    (event) => event.date >= todayIso && event.date <= weekEndIso
  );

  const wireItems = upcomingEvents.slice(0, 6);
  const bulletins = filteredEvents.length > 0 ? filteredEvents : [];
  const loading = clubsLoading || eventsLoading;

  const commitments = [
    ...mySignups
      .map((signup) => upcomingEvents.find((event) => event.id === signup.eventId))
      .filter(Boolean)
      .map((event) => ({ ...event, type: "event" })),
    ...myCommitments
      .filter((commitment) => commitment.date >= todayIso)
      .map((commitment) => ({ ...commitment, type: "commitment" })),
  ]
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .slice(0, 3);

  const clubName = (clubId) => clubs.find((club) => club.id === clubId)?.name || "Campus event";

  function handleCategory(next) {
    setCategory(next);
  }

  function showFeed(next) {
    setViewMode(next);
  }

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <p className={`eyebrow ${styles.kicker}`}>
          Nairobi · Main campus · {shortDate(todayIso)} · Standalone edition
        </p>
        <h1 className={styles.pageTitle}>This week.</h1>
        <p className={styles.deck}>
          What is happening on campus, edited down to what you can actually show up for. Pick
          something, and it becomes a commitment rather than a bookmark.
        </p>
      </header>

      {hasNoClub && (
        <div className={styles.dispatch} role="status">
          <p className={styles.dispatchTitle}>You&apos;re not in a club yet</p>
          <p className={styles.dispatchBody}>
            Open any club below and join it — Kesho will then show that club&apos;s workspace
            instead of this edition.
          </p>
        </div>
      )}

      {loading ? (
        <div className={styles.loading} aria-busy="true">
          <span className="visually-hidden">Loading this week&apos;s edition…</span>
          <div className={styles.skeletonLead} />
          <div className={styles.skeletonRule} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      ) : eventsError && events.length === 0 ? (
        <div className={styles.errorWrap}>
          <ErrorState
            title="The edition didn't load"
            message={eventsError}
            onRetry={() => setEventsReloadKey((key) => key + 1)}
          />
        </div>
      ) : lead ? (
        <section className={styles.lead} aria-labelledby="lead-title">
          <div className={styles.leadCopy}>
            <p className={styles.dateline}>
              {leadClub?.name || "Campus"} · {shortDate(lead.date)} · {lead.time}
            </p>
            <h2 id="lead-title" className={styles.headline}>
              {lead.title}
            </h2>
            <p className={styles.standfirst}>
              {lead.description || "The host hasn't added a description yet."}
            </p>
            <p className={styles.byline}>
              {lead.location}
              {lead.bringNote ? ` · Bring ${lead.bringNote}` : ""}
            </p>

            <div className={styles.leadActions}>
              <Link to={`/events/${lead.id}`} className={styles.primaryAction}>
                Read the notice
              </Link>
              <button
                type="button"
                className={styles.ghostAction}
                onClick={() => showFeed("events")}
              >
                See all events
              </button>
            </div>

            <dl className={styles.facts}>
              <div>
                <dt>Date</dt>
                <dd>
                  {leadStamp.day}
                  <small>{leadStamp.month}</small>
                </dd>
              </div>
              <div>
                <dt>Starts</dt>
                <dd>
                  {lead.time}
                  <small>{lead.location ? "Campus time" : ""}</small>
                </dd>
              </div>
              <div>
                <dt>Going</dt>
                <dd>
                  {lead.capacity != null ? `${lead.signupCount ?? 0}/${lead.capacity}` : "—"}
                  <small>{lead.capacity != null ? "spots taken" : "no limit set"}</small>
                </dd>
              </div>
              <div>
                <dt>Host</dt>
                <dd className={styles.hostName}>{leadClub?.name || "Campus"}</dd>
              </div>
            </dl>
          </div>

          <figure className={styles.leadArt}>
            {lead.imageUrl && !leadImageFailed ? (
              <img
                src={lead.imageUrl}
                alt=""
                className={styles.leadImage}
                onError={() => setLeadImageFailed(true)}
              />
            ) : (
              <div className={styles.leadImageFallback} aria-hidden="true">
                <span>Photograph</span>
              </div>
            )}
            <span className={styles.stamp} aria-hidden="true">
              {leadStamp.day}
              <small>{leadStamp.month}</small>
            </span>
            <figcaption>
              {lead.location} · {shortDate(lead.date)}, {lead.time}
            </figcaption>
          </figure>
        </section>
      ) : (
        <section className={styles.quietWeek} aria-labelledby="quiet-title">
          <p className="eyebrow">The edition</p>
          <h2 id="quiet-title" className={styles.headline}>
            Nothing on this week.
          </h2>
          <p className={styles.standfirst}>
            No upcoming events are listed yet. Browse the clubs and join one — their next event will
            appear here.
          </p>
          <button type="button" className={styles.primaryAction} onClick={() => showFeed("clubs")}>
            Browse the clubs
          </button>
        </section>
      )}

      {wireItems.length > 0 && (
        <div className={`${styles.wire} ${wirePaused ? styles.wirePaused : ""}`}>
          <span className={styles.wireLabel}>Wire</span>
          <div className={styles.wireTrack}>
            {wireItems.map((event) => (
              <span key={event.id} className={styles.wireItem}>
                {shortDate(event.date)} · {event.time} — {event.title}
                <span className={styles.wireWhere}> · {clubName(event.clubId)}</span>
              </span>
            ))}
            {wireItems.map((event) => (
              <span key={`dup-${event.id}`} className={styles.wireItem} aria-hidden="true">
                {shortDate(event.date)} · {event.time} — {event.title}
                <span className={styles.wireWhere}> · {clubName(event.clubId)}</span>
              </span>
            ))}
          </div>
          <button
            type="button"
            className={styles.wireToggle}
            aria-pressed={wirePaused}
            onClick={() => setWirePaused((paused) => !paused)}
          >
            {wirePaused ? "Play wire" : "Pause wire"}
          </button>
        </div>
      )}

      <section className={styles.controls} aria-label="Search and filter the edition">
        <div className={styles.searchWrap}>
          <label htmlFor="edition-search" className="visually-hidden">
            Search clubs and events
          </label>
          <input
            id="edition-search"
            type="search"
            placeholder="Search clubs, events, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup} role="group" aria-label="Filter by category">
          <button
            type="button"
            onClick={() => handleCategory("All")}
            aria-pressed={category === "All"}
            className={category === "All" ? styles.filterActive : styles.filterBtn}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategory(cat)}
              aria-pressed={category === cat}
              className={category === cat ? styles.filterActive : styles.filterBtn}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className={styles.viewToggle} role="group" aria-label="What to browse">
          <button
            type="button"
            onClick={() => showFeed("clubs")}
            aria-pressed={viewMode === "clubs"}
            className={viewMode === "clubs" ? styles.toggleActive : styles.toggleBtn}
          >
            Clubs
          </button>
          <button
            type="button"
            onClick={() => showFeed("events")}
            aria-pressed={viewMode === "events"}
            className={viewMode === "events" ? styles.toggleActive : styles.toggleBtn}
          >
            Events
          </button>
        </div>
      </section>

      <div className={styles.columns} id="feed">
        <section className={styles.feed} aria-labelledby="feed-title">
          <div className={styles.feedHead}>
            <h2 id="feed-title">{viewMode === "clubs" ? "The clubs" : "This week"}</h2>
            <span className={styles.feedCount}>
              {viewMode === "clubs" ? filteredClubs.length : bulletins.length}{" "}
              {viewMode === "clubs" ? "listed" : "on"}
            </span>
          </div>

          {viewMode === "clubs" ? (
            clubsLoading ? (
              <SkeletonGroup label="Loading clubs…" className={styles.skeletonGrid}>
                {Array.from({ length: 4 }, (_, i) => (
                  <ClubSkeletonCard key={i} />
                ))}
              </SkeletonGroup>
            ) : clubsError && clubs.length === 0 ? (
              <ErrorState title="Clubs didn't load" message={clubsError} onRetry={refreshClubs} />
            ) : filteredClubs.length > 0 ? (
              <ol className={styles.clubList}>
                {filteredClubs.map((club, index) => (
                  <li key={club.id}>
                    <Link to={`/clubs/${club.id}`} className={styles.clubRow}>
                      <span className={styles.rowNum}>{String(index + 1).padStart(2, "0")}</span>
                      <span className={styles.rowBody}>
                        <span className={styles.rowTitle}>{club.name}</span>
                        <span className={styles.rowMeta}>
                          {club.category} · {club.meetingTime} · {club.meetingLocation}
                        </span>
                        <span className={styles.rowDeck}>{club.description}</span>
                      </span>
                      <span className={styles.rowArrow} aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={styles.emptyState}>
                <h3>No clubs match that.</h3>
                <p>
                  Nothing matches “{debouncedSearch}” in{" "}
                  {category === "All" ? "any category" : category}. Try a broader search.
                </p>
              </div>
            )
          ) : eventsLoading ? (
            <SkeletonGroup label="Loading events…" className={styles.skeletonGrid}>
              {Array.from({ length: 4 }, (_, i) => (
                <EventSkeletonCard key={i} />
              ))}
            </SkeletonGroup>
          ) : bulletins.length > 0 ? (
            <ol className={styles.bulletinList}>
              {bulletins.map((event, index) => (
                <li key={event.id}>
                  <Link to={`/events/${event.id}`} className={styles.bulletinRow}>
                    <span className={styles.rowNum}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowTitle}>{event.title}</span>
                      <span className={styles.rowMeta}>
                        <time dateTime={`${event.date}T${event.time}`}>
                          {shortDate(event.date)} · {event.time}
                        </time>{" "}
                        · {clubName(event.clubId)} · {event.location}
                      </span>
                    </span>
                    <span className={styles.rowSpots}>
                      {event.capacity != null
                        ? `${event.signupCount ?? 0}/${event.capacity}`
                        : "Open"}
                    </span>
                    <span className={styles.rowArrow} aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.emptyState}>
              <h3>Nothing matches that.</h3>
              <p>No events match “{debouncedSearch}”. Clear the search or pick another category.</p>
            </div>
          )}
        </section>

        <aside className={styles.rail} aria-label="On campus and your commitments">
          <section>
            <h2 className={styles.railHead}>
              <span>On campus</span>
              <span>{thisWeek.length} this week</span>
            </h2>
            {thisWeek.length > 0 ? (
              <ol className={styles.agenda}>
                {thisWeek.slice(0, 5).map((event) => (
                  <li key={event.id}>
                    <time dateTime={`${event.date}T${event.time}`}>{shortDate(event.date)}</time>
                    <span>
                      <b>{event.title}</b>
                      <span className={styles.agendaMeta}>
                        {event.time} · {event.location}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.railEmpty}>
                No events dated in the next seven days. The full list is under Events.
              </p>
            )}
          </section>

          <section>
            <h2 className={styles.railHead}>
              <span>Your commitments</span>
              <span>{commitments.length}</span>
            </h2>
            {user ? (
              commitments.length > 0 ? (
                <ul className={styles.commitList}>
                  {commitments.map((event) => (
                    <li key={`${event.type}-${event.id}`}>
                      <span className={styles.check} aria-hidden="true">
                        ✓
                      </span>
                      <span>
                        <Link
                          to={
                            event.type === "commitment"
                              ? `/commitments/${event.id}`
                              : `/events/${event.id}`
                          }
                          className={styles.commitTitle}
                        >
                          {event.title}
                        </Link>
                        <span className={styles.commitMeta}>
                          <time dateTime={`${event.date}T${event.time}`}>
                            {shortDate(event.date)} · {event.time}
                          </time>{" "}
                          · {event.location}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.railEmpty}>
                  Nothing yet. Join a club commitment or open an event and choose “I&apos;m going”
                  to put it here.
                </p>
              )
            ) : (
              <p className={styles.railEmpty}>
                <Link to="/login" className={styles.inlineLink}>
                  Log in
                </Link>{" "}
                to keep your commitments in one place.
              </p>
            )}
          </section>

          <section className={styles.dispatchBlock}>
            <p className={styles.dispatchKicker}>The desk</p>
            <p>Officer? Capacity and the waitlist live on your club page, under Commitments.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
