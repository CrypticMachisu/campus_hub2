import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentUser } from "../utils/authStore";
import { getComments, saveComment } from "../utils/commentsStore";
import styles from "./CommentSection.module.css";

function formatTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  // Peer review: "Explicit Timestamp Formatting" — use Intl.DateTimeFormat
  // directly rather than the looser toLocaleDateString shorthand, so the
  // format is explicit and consistent regardless of locale defaults.
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

/**
 * Comment thread for either an event or a club.
 * @param {{ targetType: "event"|"club", targetId: string }} props
 */
export default function CommentSection({ targetType, targetId }) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState("");
  const user = getCurrentUser();

  function refresh() {
    setComments(getComments(targetType, targetId));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !user) return;

    saveComment({
      targetType,
      targetId,
      userId: user.id,
      userName: user.name,
      text,
    });
    setDraft("");
    refresh();
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>Comments</h3>

      {comments.length === 0 ? (
        <p className={styles.empty}>No comments yet — be the first to say something.</p>
      ) : (
        <ul className={styles.list}>
          {comments.map((c) => (
            <li key={c.id} className={styles.comment}>
              <div className={styles.commentHeader}>
                <span className={styles.author}>{c.userName}</span>
                <span className={styles.timestamp}>{formatTimestamp(c.createdAt)}</span>
              </div>
              <p className={styles.text}>{c.text}</p>
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            type="text"
            className={styles.input}
            placeholder="Add a comment…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className={styles.postButton}>
            Post
          </button>
        </form>
      ) : (
        <p className={styles.loginPrompt}>
          <Link to="/login" className={styles.loginLink}>
            Log in
          </Link>{" "}
          to comment.
        </p>
      )}
    </section>
  );
}
