import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getComments,
  saveComment,
  toggleReaction,
  setCommentPinned,
  deleteComment,
} from "../utils/commentsStore";
import styles from "./CommentSection.module.css";

const REACTION_CHOICES = ["👍", "❤️", "🎉", "😂"];

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

  // Explicit formatting (not toLocaleDateString) so every locale renders the
  // same shape for older comments.
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

/**
 * Comment thread for an event or a club: one level of replies, emoji reactions,
 * pinned answers, and delete for the author or a club admin.
 */
export default function CommentSection({
  targetType,
  targetId,
  compact = false,
  showHeading = true,
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyPosting, setReplyPosting] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setComments(await getComments(targetType, targetId));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);

  async function submit(text, parentId = null) {
    const trimmed = text.trim();
    if (!trimmed || !user) return false;

    setError("");
    try {
      await saveComment({ targetType, targetId, text: trimmed, parentId });
      await refresh();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setPosting(true);
    const posted = await submit(draft);
    setPosting(false);
    if (posted) setDraft("");
  }

  async function handleReplySubmit(e) {
    e.preventDefault();
    setReplyPosting(true);
    const posted = await submit(replyDraft, replyTo);
    setReplyPosting(false);
    if (posted) {
      setReplyDraft("");
      setReplyTo(null);
    }
  }

  /** Optimistic reaction: flip the chip now, trust the server's tally after. */
  async function react(comment, emoji) {
    if (!user) return;

    const previous = comment.reactions;
    const next = previous.map((reaction) => ({ ...reaction }));
    const index = next.findIndex((reaction) => reaction.emoji === emoji);

    if (index >= 0) {
      const current = next[index];
      next[index] = {
        ...current,
        count: current.count + (current.mine ? -1 : 1),
        mine: !current.mine,
      };
      if (next[index].count <= 0) next.splice(index, 1);
    } else {
      next.push({ emoji, count: 1, mine: true });
    }

    setComments((list) =>
      list.map((entry) => (entry.id === comment.id ? { ...entry, reactions: next } : entry))
    );

    try {
      const actual = await toggleReaction(comment.id, emoji);
      setComments((list) =>
        list.map((entry) => (entry.id === comment.id ? { ...entry, reactions: actual } : entry))
      );
    } catch (err) {
      setComments((list) =>
        list.map((entry) => (entry.id === comment.id ? { ...entry, reactions: previous } : entry))
      );
      setError(err.message);
    }
  }

  async function togglePin(comment) {
    setError("");
    try {
      const updated = await setCommentPinned(comment.id, !comment.pinned);
      setComments((list) =>
        list.map((entry) =>
          entry.id === comment.id ? { ...entry, pinned: updated.pinned } : entry
        )
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(comment) {
    const confirmed = window.confirm(
      comment.parentId ? "Delete this reply?" : "Delete this comment? Any replies to it go too."
    );
    if (!confirmed) return;

    setError("");
    try {
      await deleteComment(comment.id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  const topLevel = comments
    .filter((comment) => !comment.parentId)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || byTime(a, b));

  function renderComment(comment, isReply = false) {
    const replies = isReply
      ? []
      : comments.filter((entry) => entry.parentId === comment.id).sort(byTime);
    const canDelete = user && (comment.canModerate || comment.userId === user.id);

    return (
      <li
        key={comment.id}
        className={isReply ? `${styles.comment} ${styles.replyComment}` : styles.comment}
      >
        <div className={styles.commentHeader}>
          <span className={styles.author}>
            {comment.userName}
            {comment.pinned && <span className={styles.pinnedBadge}>Pinned</span>}
          </span>
          <span className={styles.timestamp}>{formatTimestamp(comment.createdAt)}</span>
        </div>

        <p className={styles.text}>{comment.text}</p>

        <div className={styles.actions}>
          {user &&
            REACTION_CHOICES.map((emoji) => {
              const reaction = comment.reactions?.find((entry) => entry.emoji === emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  className={
                    reaction?.mine ? `${styles.reaction} ${styles.reactionMine}` : styles.reaction
                  }
                  onClick={() => react(comment, emoji)}
                  aria-pressed={Boolean(reaction?.mine)}
                  aria-label={`React ${emoji}${reaction ? `, ${reaction.count} so far` : ""}`}
                >
                  <span aria-hidden="true">{emoji}</span>
                  {reaction ? <span>{reaction.count}</span> : null}
                </button>
              );
            })}

          {user && !isReply && comment.reactions?.length === 0 && (
            <span className={styles.hint}>React or reply</span>
          )}

          {user && !isReply && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => {
                setReplyTo(replyTo === comment.id ? null : comment.id);
                setReplyDraft("");
              }}
              aria-expanded={replyTo === comment.id}
            >
              {replyTo === comment.id ? "Cancel" : "Reply"}
            </button>
          )}

          {comment.canModerate && !isReply && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => togglePin(comment)}
            >
              {comment.pinned ? "Unpin" : "Pin"}
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.deleteAction}`}
              onClick={() => remove(comment)}
            >
              Delete
            </button>
          )}
        </div>

        {replies.length > 0 && (
          <ul className={`${styles.list} ${styles.replies}`}>
            {replies.map((reply) => renderComment(reply, true))}
          </ul>
        )}

        {replyTo === comment.id && (
          <form className={styles.form} onSubmit={handleReplySubmit}>
            <input
              type="text"
              className={styles.input}
              aria-label={`Reply to ${comment.userName}`}
              placeholder={`Reply to ${comment.userName}…`}
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              disabled={replyPosting}
              autoFocus
            />
            <button type="submit" className={styles.postButton} disabled={replyPosting}>
              {replyPosting ? "Posting…" : "Reply"}
            </button>
          </form>
        )}
      </li>
    );
  }

  return (
    <section className={compact ? `${styles.section} ${styles.compact}` : styles.section}>
      {showHeading && <h3 className={styles.heading}>{compact ? "Discussion" : "Comments"}</h3>}

      {comments.length === 0 ? (
        <p className={styles.empty}>No comments yet — be the first to say something.</p>
      ) : (
        <ul className={styles.list}>{topLevel.map((comment) => renderComment(comment))}</ul>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {user ? (
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            type="text"
            className={styles.input}
            aria-label="Add a comment"
            placeholder="Add a comment…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={posting}
            maxLength={1000}
          />
          <button type="submit" className={styles.postButton} disabled={posting}>
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
