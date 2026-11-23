import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getFamilies } from "../utils/clubFamiliesStore";
import { SkeletonGroup } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import { usePageMetadata } from "../hooks/usePageMetadata";
import styles from "./Families.module.css";

export default function Families() {
  usePageMetadata({
    title: "Club families",
    description: "Clubs with chapters across more than one campus.",
  });

  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setFamilies(await getFamilies());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Club families</p>
        <h1>One club. More than one campus.</h1>
        <p className={styles.lede}>
          A family shares its name and identity across campus chapters. Each chapter keeps its own
          officers, members, events and moderation.
        </p>
      </header>

      {loading ? (
        <SkeletonGroup label="Loading club families…" className={styles.grid}>
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </SkeletonGroup>
      ) : error ? (
        <ErrorState title="Club families didn't load" message={error} onRetry={load} />
      ) : families.length === 0 ? (
        <p className={styles.empty}>No club families are published yet.</p>
      ) : (
        <ul className={styles.grid}>
          {families.map((family) => (
            <li key={family.id} className={styles.card}>
              <div className={styles.cardIdentity}>
                <FamilyMark family={family} />
                <div>
                  <p className={styles.cardKicker}>{family.homeCampusName}</p>
                  <h2>
                    <Link to={`/families/${family.id}`}>{family.name}</Link>
                  </h2>
                </div>
              </div>
              {family.description && <p className={styles.description}>{family.description}</p>}
              <p className={styles.chapterCount}>
                {family.chapters.length}{" "}
                {family.chapters.length === 1 ? "campus chapter" : "campus chapters"}
              </p>
              <ul className={styles.campusChips} aria-label={`Chapters of ${family.name}`}>
                {family.chapters.map((chapter) => (
                  <li key={chapter.id}>{chapter.campusName}</li>
                ))}
              </ul>
              <Link to={`/families/${family.id}`} className={styles.cardLink}>
                Read the family <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
