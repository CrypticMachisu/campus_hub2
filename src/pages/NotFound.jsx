import { Link } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata";
import styles from "./NotFound.module.css";

// Peer review (00-shared-contracts.md): "Missing Fallback Route" —
// without this, navigating to an unknown path (or a stale bookmark to
// a deleted custom event) rendered a blank white screen instead of
// something a user could recover from.
export default function NotFound() {
  usePageMetadata({
    title: "Page not found",
    description: "The page you're looking for doesn't exist or may have been removed.",
  });

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Stop press</p>
      <h1>Page not found.</h1>
      <p className={styles.body}>
        The page you're looking for doesn't exist, or it may have been removed.
      </p>
      <Link to="/" className={styles.link}>
        Back to this week
      </Link>
    </div>
  );
}
