import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getFamily } from "../utils/clubFamiliesStore";
import { formatEventDate } from "../utils/dateTime";
import { SkeletonGroup } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import { usePageMetadata } from "../hooks/usePageMetadata";
import styles from "./Families.module.css";

export default function FamilyProfile() {
  const { familyId, clubId } = useParams();
  const { user } = useAuth();
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  usePageMetadata({
    title: family?.name || "Club family",
    description: family?.description || "Explore a club family and its campus chapters.",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      setFamily(await getFamily(familyId));
    } catch (err) {
      setError(err.message);
    }
  }, [familyId]);

  useEffect(() => {
    setLoading(true);
    setFamily(null);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <main className={styles.page}>
        <SkeletonGroup label="Loading family…">
          <div className={styles.skeletonHero} />
          <div className={styles.skeletonCard} />
        </SkeletonGroup>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.page}>
        <ErrorState title="This family didn't load" message={error} onRetry={load} />
      </main>
    );
  }

  if (!family) {
    return (
      <main className={styles.page}>
        <div className={styles.notFound}>
          <h1>Family not found</h1>
          <p>This club family is not published, or the link is out of date.</p>
          <Link to="/families">Browse club families</Link>
        </div>
      </main>
    );
  }

  if (clubId) {
    const chapter = family.chapters.find((entry) => entry.id === clubId);
    if (!chapter) {
      return (
        <main className={styles.page}>
          <div className={styles.notFound}>
            <h1>Chapter not found</h1>
            <p>This club is not a chapter of {family.name}.</p>
            <Link to={`/families/${family.id}`}>Back to {family.name}</Link>
          </div>
        </main>
      );
    }
    return <ChapterPage family={family} chapter={chapter} user={user} />;
  }

  return (
    <main className={styles.page}>
      <Link to="/families" className={styles.backLink}>
        ← All club families
      </Link>
      <header className={styles.header}>
        <div className={styles.familyHero}>
          <FamilyMark family={family} />
          <div>
            <p className={styles.eyebrow}>Club family · home {family.homeCampusName}</p>
            <h1>{family.name}</h1>
          </div>
        </div>
        {family.description && <p className={styles.lede}>{family.description}</p>}
      </header>

      <section className={styles.section} aria-labelledby="chapters-heading">
        <div className={styles.sectionHead}>
          <h2 id="chapters-heading">Campus chapters</h2>
          <span>
            {family.chapters.length} {family.chapters.length === 1 ? "chapter" : "chapters"}
          </span>
        </div>
        {family.chapters.length === 0 ? (
          <p className={styles.empty}>This family has no published chapters yet.</p>
        ) : (
          <ul className={styles.chapterGrid}>
            {family.chapters.map((chapter) => (
              <li key={chapter.id} className={styles.chapterCard}>
                <p className={styles.cardKicker}>{chapter.campusName}</p>
                <h3>
                  <Link to={`/families/${family.id}/chapters/${chapter.id}`}>{chapter.name}</Link>
                </h3>
                <p className={styles.description}>
                  {chapter.description ||
                    `A local chapter of ${family.name}, with its own officers and campus activity.`}
                </p>
                {(chapter.meetingTime || chapter.meetingLocation) && (
                  <p className={styles.chapterMeta}>
                    {[chapter.meetingTime, chapter.meetingLocation].filter(Boolean).join(" · ")}
                  </p>
                )}
                {chapter.nextEvent && (
                  <p className={styles.chapterNextEvent}>
                    <span>Next network event</span>
                    {formatEventDate(chapter.nextEvent.date)} · {chapter.nextEvent.time} —{" "}
                    {chapter.nextEvent.title}
                  </p>
                )}
                <Link
                  to={`/families/${family.id}/chapters/${chapter.id}`}
                  className={styles.cardLink}
                  aria-label={`View ${chapter.name} at ${chapter.campusName}`}
                >
                  View chapter <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className={styles.boundaryNote}>
        <strong>Each chapter is local.</strong> The family shares identity only. Campus-only
        activity, club membership, rosters, discussions and reports stay with the chapter on its
        campus. Events, commitments and posts appear in My network only when the chapter shares
        them.
      </aside>
    </main>
  );
}

function FamilyMark({ family }) {
  if (family.logoUrl) {
    return <img className={styles.familyMark} src={family.logoUrl} alt="" />;
  }
  return (
    <span className={styles.familyMarkFallback} aria-hidden="true">
      {family.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ChapterPage({ family, chapter, user }) {
  const canOpenClub =
    Boolean(user) && (user.role === "tier1" || user.campusId === chapter.campusId);

  return (
    <main className={styles.page}>
      <Link to={`/families/${family.id}`} className={styles.backLink}>
        ← {family.name}
      </Link>
      <header className={styles.header}>
        <div className={styles.chapterIdentity}>
          <FamilyMark family={family} />
          <div>
            <p className={styles.eyebrow}>
              {family.name} · {chapter.campusName}
            </p>
            <h1>{chapter.name}</h1>
          </div>
        </div>
        <p className={styles.lede}>
          The {chapter.campusName} chapter of {family.name}. Its officers, members, events and
          moderation are managed on that campus.
        </p>
        {chapter.nextEvent && (
          <p className={styles.chapterNextEvent}>
            <span>Next network event</span>
            {formatEventDate(chapter.nextEvent.date)} · {chapter.nextEvent.time} —{" "}
            {chapter.nextEvent.title}
          </p>
        )}
      </header>

      <section className={styles.chapterPanel} aria-labelledby="chapter-links-heading">
        <h2 id="chapter-links-heading">Chapter links</h2>
        <div className={styles.linkRow}>
          <Link to={`/families/${family.id}`} className={styles.secondaryLink}>
            Back to the family
          </Link>
          {canOpenClub ? (
            <Link to={`/clubs/${chapter.id}`} className={styles.primaryLink}>
              Open the campus club page
            </Link>
          ) : (
            <p className={styles.boundaryNote}>
              The full club page is available to members of {chapter.campusName}. Join that campus
              to open its local activity.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
