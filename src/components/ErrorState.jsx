import styles from "./ErrorState.module.css";

/**
 * A dashed paper note instead of a red alert box, so a failed request still
 * looks like CampusHub. `role="alert"` makes screen readers announce it when
 * it replaces a loading skeleton.
 */
export default function ErrorState({
  title = "Can't load this right now",
  message,
  onRetry,
  retryLabel = "Try again",
}) {
  return (
    <div className={styles.wrap} role="alert">
      <p className={styles.title}>{title}</p>
      {message && <p className={styles.body}>{message}</p>}
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
