import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getMyCampusAffiliations } from "../utils/campusAffiliationsStore";
import { CATEGORIES, getAllClubs } from "../utils/clubsStore";
import { getAllEvents } from "../utils/eventsStore";
import { formatEventDate } from "../utils/dateTime";
import ClubCard from "../components/ClubCard";
import { SkeletonGroup } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import styles from "./Network.module.css";

const KIND_LABELS = {
  home: "Home campus",
  exchange: "Exchange",
  dual: "Dual affiliation",
  staff: "Staff",
  alumni: "Alumni",
  other: "Affiliated",
};

export default function Network() {
  const { user, loading: authLoading } = useAuth();
  const [affiliations, setAffiliations] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await getMyCampusAffiliations();
      setAffiliations(data.affiliations || []);
      const additional = (data.affiliations || []).filter(
        (affiliation) =>
          affiliation.status === "active" && affiliation.campusId !== data.homeCampusId
      );
      if (additional.length === 0) {
        setClubs([]);
        setEvents([]);
        return;
      }
      const [clubRows, eventRows] = await Promise.all([
        getAllClubs({ scope: "network" }),
        getAllEvents({ scope: "network" }),
      ]);
      setClubs(clubRows);
      setEvents(eventRows);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [authLoading, load, user]);

  const homeCampusId = user?.campusId;
  const activeAffiliations = useMemo(
    () =>
      affiliations.filter(
        (affiliation) => affiliation.status === "active" && affiliation.campusId !== homeCampusId
      ),
    [affiliations, homeCampusId]
  );
  const pendingAffiliations = affiliations.filter(
    (affiliation) => affiliation.status === "pending"
  );
  const campusMeta = useMemo(() => {
    const meta = new Map(
      activeAffiliations.map((affiliation) => [
        affiliation.campusId,
        { name: affiliation.campusName, kind: affiliation.kind },
      ])
    );
    meta.set(homeCampusId, {
      name: user?.campusName || "Home campus",
      kind: "home",
    });
    return meta;
  }, [activeAffiliations, homeCampusId, user?.campusName]);

  const visibleClubs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return clubs.filter((club) => {
      if (category !== "All" && club.category !== category) return false;
      if (!needle) return true;
      return [club.name, club.description, club.category, ...(club.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [clubs, category, search]);

  const networkEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          Date.parse(`${a.date}T${a.time || "00:00"}`) -
          Date.parse(`${b.date}T${b.time || "00:00"}`)
      ),
    [events]
  );

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const club of visibleClubs) {
      if (!groups.has(club.campusId)) groups.set(club.campusId, []);
      groups.get(club.campusId).push(club);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      String(campusMeta.get(a)?.name || "").localeCompare(String(campusMeta.get(b)?.name || ""))
    );
  }, [campusMeta, visibleClubs]);

  if (authLoading) {
    return (
      <main className={styles.page}>
        <p role="status">Loading your network…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>My network</p>
          <h1>Sign in to see your network.</h1>
          <p className={styles.lede}>
            Network discovery is built from approved campus affiliations.{" "}
            <Link to="/login">Sign in</Link> to continue.
          </p>
        </header>
      </main>
    );
  }

  if (user.role === "tier1") {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>My network</p>
          <h1>Network discovery is for members.</h1>
          <p className={styles.lede}>
            Tier 1 already has the campus edition switcher. <Link to="/">Return to this week</Link>{" "}
            to browse any campus.
          </p>
        </header>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>My network</p>
        <h1>Clubs across your campuses.</h1>
        <p className={styles.lede}>
          This directory follows your approved affiliations. It shares club identity and events
          explicitly published to the network; posts, commitments and membership stay with each
          campus chapter.
        </p>
      </header>

      {loading ? (
        <SkeletonGroup label="Loading your network…" className={styles.grid}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </SkeletonGroup>
      ) : error ? (
        <ErrorState title="Your network didn't load" message={error} onRetry={load} />
      ) : activeAffiliations.length === 0 ? (
        <section className={styles.empty} aria-labelledby="network-empty-heading">
          <h2 id="network-empty-heading">Your network starts with an approved campus.</h2>
          <p>
            You are currently scoped to {user?.campusName || "your home campus"}. Request another
            campus to see its clubs here.
          </p>
          {pendingAffiliations.length > 0 && (
            <p className={styles.pending}>
              {pendingAffiliations.length}{" "}
              {pendingAffiliations.length === 1 ? "request is" : "requests are"} waiting for review.
            </p>
          )}
          <Link to="/campus-access" className={styles.primaryLink}>
            Manage campus access
          </Link>
        </section>
      ) : (
        <>
          <section className={styles.campusStrip} aria-label="Campuses in your network">
            {[homeCampusId, ...activeAffiliations.map((affiliation) => affiliation.campusId)].map(
              (campusId) => {
                const campus = campusMeta.get(campusId);
                if (!campus) return null;
                return (
                  <div key={campusId} className={styles.campusChip}>
                    <span>{campus.name}</span>
                    <small>{KIND_LABELS[campus.kind] || "Affiliated"}</small>
                  </div>
                );
              }
            )}
          </section>

          {networkEvents.length > 0 && (
            <section className={styles.eventsSection} aria-labelledby="network-events-heading">
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.sectionKicker}>Opted into the network</p>
                  <h2 id="network-events-heading">Network events</h2>
                </div>
                <span>{networkEvents.length} upcoming</span>
              </div>
              <ul className={styles.eventList}>
                {networkEvents.map((event) => {
                  const host = clubs.find((club) => club.id === event.clubId);
                  return (
                    <li key={event.id} className={styles.eventCard}>
                      <p className={styles.eventDate}>
                        {formatEventDate(event.date)} · <span className="mono">{event.time}</span>
                      </p>
                      <h3>{event.title}</h3>
                      <p className={styles.eventMeta}>
                        {host?.name || "Club event"}
                        {host?.campusName ? ` · ${host.campusName}` : ""}
                        {event.location ? ` · ${event.location}` : ""}
                      </p>
                      <p className={styles.eventNote}>
                        Network-visible. RSVP and discussion stay on the host campus.
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className={styles.filters} aria-label="Filter network clubs">
            <label className={styles.searchField}>
              Search network clubs
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search clubs, categories, tags…"
              />
            </label>
            <label className={styles.categoryField}>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="All">All categories</option>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {grouped.length === 0 ? (
            <p className={styles.noResults}>No clubs match those filters.</p>
          ) : (
            grouped.map(([campusId, campusClubs]) => {
              const campus = campusMeta.get(campusId);
              return (
                <section key={campusId} className={styles.campusSection}>
                  <div className={styles.sectionHead}>
                    <div>
                      <p className={styles.sectionKicker}>
                        {KIND_LABELS[campus?.kind] || "Affiliated"}
                      </p>
                      <h2>{campus?.name || "Campus"}</h2>
                    </div>
                    <span>
                      {campusClubs.length} {campusClubs.length === 1 ? "club" : "clubs"}
                    </span>
                  </div>
                  <div className={styles.grid}>
                    {campusClubs.map((club) => (
                      <ClubCard key={club.id} club={club} />
                    ))}
                  </div>
                </section>
              );
            })
          )}

          <aside className={styles.boundaryNote}>
            <strong>Read-only network view.</strong> Opening a club shows its identity and campus.
            Only events deliberately marked “My club network” travel here; posts, commitments and
            membership remain on the host campus.
          </aside>
        </>
      )}
    </main>
  );
}
