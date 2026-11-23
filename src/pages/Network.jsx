import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getMyCampusAffiliations } from "../utils/campusAffiliationsStore";
import { CATEGORIES, getAllClubs } from "../utils/clubsStore";
import { getAllEvents } from "../utils/eventsStore";
import { getNetworkCommitments } from "../utils/commitmentsStore";
import { getNetworkPosts } from "../utils/postsStore";
import { formatEventDate } from "../utils/dateTime";
import ClubCard from "../components/ClubCard";
import { SkeletonGroup } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import { useUrlState } from "../hooks/useUrlState";
import { usePageMetadata } from "../hooks/usePageMetadata";
import { useFlipLayout } from "../motion/useFlipLayout";
import { usePageMotion } from "../motion/usePageMotion";
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
  usePageMetadata({
    title: "My network",
    description: "Clubs, events, commitments, and posts shared across your campuses.",
  });

  const pageRef = useRef(null);
  const resultsRef = useRef(null);
  const { user, loading: authLoading } = useAuth();
  const [affiliations, setAffiliations] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [commitments, setCommitments] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useUrlState("q", "");
  const [categoryParam, setCategory] = useUrlState("category", "All");
  const category = CATEGORIES.includes(categoryParam) ? categoryParam : "All";
  const [familyFilter, setFamilyFilter] = useUrlState("family", "all");
  const [chaptersParam, setChaptersOnly] = useUrlState("chapters", "0");
  const chaptersOnly = chaptersParam === "1";

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
        setCommitments([]);
        setPosts([]);
        return;
      }
      const [clubRows, eventRows, commitmentRows, postResult] = await Promise.all([
        getAllClubs({ scope: "network" }),
        getAllEvents({ scope: "network" }),
        getNetworkCommitments(),
        getNetworkPosts(),
      ]);
      setClubs(clubRows);
      setEvents(eventRows);
      setCommitments(commitmentRows);
      setPosts(postResult.posts || []);
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

  const familyOptions = useMemo(() => {
    const options = new Map();
    for (const club of clubs) {
      if (club.familyId) options.set(club.familyId, club.familyName || "Club family");
    }
    return [...options.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  }, [clubs]);

  const visibleClubs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return clubs.filter((club) => {
      if (category !== "All" && club.category !== category) return false;
      if (familyFilter !== "all" && club.familyId !== familyFilter) return false;
      if (chaptersOnly && !club.familyId) return false;
      if (!needle) return true;
      return [club.name, club.description, club.category, ...(club.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [clubs, category, search, familyFilter, chaptersOnly]);

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

  usePageMotion(pageRef, { ready: !authLoading && !loading });
  const captureClubFlip = useFlipLayout(pageRef, { stageRef: resultsRef });

  function handleFamilyFilter(value) {
    captureClubFlip();
    setFamilyFilter(value, { replace: false });
  }

  function handleChaptersOnly(value) {
    captureClubFlip();
    setChaptersOnly(value ? "1" : "0", { replace: false });
  }

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
          <h1>Log in to see your network.</h1>
          <p className={styles.lede}>
            Network discovery is built from approved campus affiliations.{" "}
            <Link to="/login">Log in</Link> to continue.
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
            Platform admins already have the campus edition switcher.{" "}
            <Link to="/">Return to this week</Link> to browse any campus.
          </p>
        </header>
      </main>
    );
  }

  return (
    <main className={styles.page} ref={pageRef}>
      <header className={styles.header} data-motion="header">
        <p className={styles.eyebrow}>My network</p>
        <h1>Clubs across your campuses.</h1>
        <p className={styles.lede}>
          Clubs across the campuses you can access. This directory shows the events, commitments and
          posts they share with your network. Club membership, rosters and discussions stay with
          each campus chapter.
        </p>
        {activeAffiliations.length > 0 && (
          <div className={styles.scopeNotice} role="status">
            <span className={styles.scopeBadge}>Viewing</span>
            <strong>My network</strong>
            <span className={styles.scopeList}>
              {[
                user?.campusName || "Home campus",
                ...activeAffiliations.map((affiliation) => affiliation.campusName),
              ].join(" · ")}
            </span>
          </div>
        )}
        {pendingAffiliations.length > 0 && (
          <p className={styles.pending}>
            {pendingAffiliations.length}{" "}
            {pendingAffiliations.length === 1 ? "request is" : "requests are"} still waiting for
            review. <Link to="/campus-access">Manage campus access</Link>
          </p>
        )}
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
            You are currently seeing {user?.campusName || "your home campus"}. Request another
            campus to see its clubs here.
          </p>
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

          {posts.length > 0 && (
            <section className={styles.postsSection} aria-labelledby="network-posts-heading">
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.sectionKicker}>Opted into the network</p>
                  <h2 id="network-posts-heading">Network posts</h2>
                </div>
                <span>{posts.length} published</span>
              </div>
              <ul className={styles.postList}>
                {posts.map((post) => {
                  const host = clubs.find((club) => club.id === post.clubId);
                  return (
                    <li key={post.id} className={styles.postCard}>
                      <p className={styles.postMeta}>
                        {host?.name || post.clubName}
                        {host?.campusName ? ` · ${host.campusName}` : ""}
                        {post.authorName ? ` · ${post.authorName}` : ""}
                      </p>
                      <p className={styles.postBody}>{post.body}</p>
                      <p className={styles.eventNote}>
                        Shared with your network. Comments stay on the host campus.
                      </p>
                      <Link
                        to={`/posts/${post.id}?scope=network`}
                        className={styles.postLink}
                        aria-label={`Read the post from ${host?.name || post.clubName}`}
                      >
                        Read the post <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {commitments.length > 0 && (
            <section
              className={styles.commitmentsSection}
              aria-labelledby="network-commitments-heading"
            >
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.sectionKicker}>Opted into the network</p>
                  <h2 id="network-commitments-heading">Network commitments</h2>
                </div>
                <span>{commitments.length} upcoming</span>
              </div>
              <ul className={styles.eventList}>
                {commitments.map((commitment) => (
                  <li key={commitment.id} className={styles.eventCard}>
                    <div className={styles.eventWhen}>
                      <span>{formatEventDate(commitment.date)}</span>
                      <b>{commitment.time}</b>
                    </div>
                    <div className={styles.eventBody}>
                      <p className={styles.eventClub}>
                        {commitment.clubName || "Club"}
                        {commitment.campusName ? ` · ${commitment.campusName}` : ""}
                      </p>
                      <h3>
                        <Link to={`/commitments/${commitment.id}?scope=network`}>
                          {commitment.title}
                        </Link>
                      </h3>
                      <p className={styles.eventMeta}>
                        {commitment.kindLabel} · {commitment.location}
                        {commitment.hostName ? ` · Host: ${commitment.hostName}` : ""}
                      </p>
                      <p className={styles.eventNote}>
                        {commitment.capacity == null
                          ? `${commitment.signupCount} committed`
                          : `${Math.min(commitment.signupCount, commitment.capacity)} of ${commitment.capacity} places`}
                        {" · Open to commit; the roster stays with the host campus."}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
                      <h3>
                        <Link to={`/events/${event.id}?scope=network`}>{event.title}</Link>
                      </h3>
                      <p className={styles.eventMeta}>
                        {host?.name || "Club event"}
                        {host?.campusName ? ` · ${host.campusName}` : ""}
                        {event.location ? ` · ${event.location}` : ""}
                      </p>
                      <p className={styles.eventNote}>
                        Shared with your network. RSVP on the event page; discussion stays on the
                        host campus.
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
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value, { replace: false })}
              >
                <option value="All">All categories</option>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.categoryField}>
              Family
              <select
                value={familyFilter}
                onChange={(event) => handleFamilyFilter(event.target.value)}
              >
                <option value="all">All families</option>
                {familyOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.chaptersOnly}>
              <input
                type="checkbox"
                checked={chaptersOnly}
                onChange={(event) => handleChaptersOnly(event.target.checked)}
              />
              Chapters only
            </label>
          </section>

          <div className={styles.resultsStage} ref={resultsRef}>
            {visibleClubs.length === 0 && (
              <p className={styles.emptyFilter}>
                No network clubs match those filters. Clear the search or family filter.
              </p>
            )}

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
          </div>

          <aside className={styles.boundaryNote}>
            <strong>What travels.</strong> Network events, commitments and posts appear here when a
            club shares them. Club membership, rosters and discussions stay with the host campus.
          </aside>
        </>
      )}
    </main>
  );
}
