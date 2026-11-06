import styles from "./Skeleton.module.css";

/**
 * Shared skeleton loaders.
 *
 * Every "Loading…" text placeholder on a data-heavy surface is now backed
 * by one of these shape-matched presets, so each grid/list reserves its
 * real height instead of collapsing and reflowing when data arrives.
 *
 * All blocks shimmer with the design tokens and are inert for assistive
 * tech: the visuals are aria-hidden and a sr-only "Loading…" label (plus
 * role="status") announces the state once. The global
 * prefers-reduced-motion rule in theme.css freezes the shimmer into a
 * static block, so the skeletons degrade gracefully.
 */

/** Single shimmering block. Shaped with inline width/height in px or rem. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = "var(--radius)",
  className,
  style,
}) {
  return (
    <span
      className={[styles.block, className].filter(Boolean).join(" ")}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

/**
 * Wraps a group of skeleton shapes in a status live region and hides the
 * shapes from screen readers, since the sr-only label says it all.
 */
export function SkeletonGroup({ children, label = "Loading…", className }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className={styles.srOnly}>{label}</span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card-shape presets                                                  */
/* ------------------------------------------------------------------ */

/** Home feed, Browse Clubs: mirrors ClubCard's logo/badge/title/blurb. */
export function ClubSkeletonCard() {
  return (
    <span className={[styles.cardFrame, styles.clubCard].join(" ")} aria-hidden="true">
      <Skeleton width={64} height={64} />
      <span className={styles.stack}>
        <Skeleton width="34%" height={18} radius={999} />
        <Skeleton width="70%" height={20} />
        <Skeleton height={14} />
        <Skeleton width="85%" height={14} />
      </span>
    </span>
  );
}

/** Home feed, Browse Events: mirrors EventCard's thumb + club/title/meta. */
export function EventSkeletonCard() {
  return (
    <span className={[styles.cardFrame, styles.eventCard].join(" ")} aria-hidden="true">
      <Skeleton width={96} height={72} />
      <span className={styles.stack}>
        <Skeleton width="32%" height={12} />
        <Skeleton width="75%" height={18} />
        <Skeleton height={14} />
      </span>
    </span>
  );
}

/** Partner panels (farmers / produce listings). */
export function PartnerSkeletonCard() {
  return (
    <span className={[styles.cardFrame, styles.partnerCard].join(" ")} aria-hidden="true">
      <Skeleton width="65%" height={18} />
      <Skeleton height={14} />
      <Skeleton width="50%" height={14} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* List-row and page presets                                           */
/* ------------------------------------------------------------------ */

/** The Dashboard's event-row silhouette: title left, meta right. */
export function SkeletonListRow() {
  return (
    <li className={styles.listRow} aria-hidden="true">
      <Skeleton width="45%" height={16} />
      <Skeleton width="22%" height={14} />
    </li>
  );
}

/** Stacked plain cards (My Events, Dashboard gate). */
export function CardStackSkeleton({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.cardFrame} aria-hidden="true">
          <Skeleton width="55%" height={20} />
          <Skeleton height={14} />
          <Skeleton width="70%" height={14} />
        </span>
      ))}
    </>
  );
}

/** ClubProfile: circular logo + name block, then the events grid. */
export function ClubProfileSkeleton() {
  return (
    <span className={styles.clubProfile} aria-hidden="true">
      <span className={styles.profileHeader}>
        <Skeleton width={80} height={80} radius="50%" />
        <span className={styles.stack}>
          <Skeleton width="30%" height={16} />
          <Skeleton width="55%" height={26} />
        </span>
      </span>
      <Skeleton height={16} />
      <Skeleton width="90%" height={16} />
      <span className={styles.profileGrid}>
        <EventSkeletonCard />
        <EventSkeletonCard />
      </span>
    </span>
  );
}

/** EventDetail: banner image, title, meta lines. */
export function EventDetailSkeleton() {
  return (
    <span className={styles.eventDetail} aria-hidden="true">
      <Skeleton height={200} radius="var(--radius-lg)" />
      <Skeleton width="60%" height={28} />
      <Skeleton height={14} />
      <Skeleton width="85%" height={14} />
      <Skeleton width="40%" height={14} />
    </span>
  );
}
