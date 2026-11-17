import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canManageClub } from "../utils/authStore";
import { createPost, getClubPosts, setPostStatus, updatePost } from "../utils/postsStore";
import ReportButton from "./ReportButton";
import styles from "./ClubFeed.module.css";

function formatPostTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * A club's posts: dated dispatches from its officers, newest first.
 * Managers publish and edit inline; members read and can comment at the
 * permalink. No infinite scroll — one deliberate "Earlier updates" click.
 */
export default function ClubFeed({ clubId }) {
  const { user } = useAuth();
  const managesClub = canManageClub(user, clubId);

  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setStatus("loading");
    setError("");
    getClubPosts(clubId)
      .then((data) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        setStatus("ok");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const data = await getClubPosts(clubId, { before: nextCursor });
      setPosts((current) => [...current, ...data.posts]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handlePublish(e) {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const created = await createPost(clubId, draft);
      setPosts((current) => [created, ...current]);
      setDraft("");
      setComposerOpen(false);
      setNotice("Post published to the club page.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(post) {
    setEditingId(post.id);
    setEditDraft(post.body);
    setNotice("");
  }

  async function saveEdit(post) {
    setBusyId(post.id);
    setNotice("");
    try {
      const updated = await updatePost(post.id, editDraft);
      setPosts((current) => current.map((entry) => (entry.id === post.id ? updated : entry)));
      setEditingId(null);
      setEditDraft("");
      setNotice("Post updated.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function hidePost(post) {
    if (!window.confirm("Hide this post from the club page? You can restore it from the desk.")) {
      return;
    }
    setBusyId(post.id);
    setNotice("");
    try {
      await setPostStatus(post.id, "hidden");
      setPosts((current) => current.filter((entry) => entry.id !== post.id));
      setNotice("Post hidden. It stays in the desk so you can restore it.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="feed" className={styles.section} aria-labelledby={`feed-${clubId}`}>
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Dispatch</p>
          <h2 id={`feed-${clubId}`} className={styles.title}>
            From the club
          </h2>
        </div>
        {managesClub && (
          <button
            type="button"
            className={styles.ghostButton}
            aria-expanded={composerOpen}
            onClick={() => setComposerOpen((open) => !open)}
          >
            {composerOpen ? "Close" : "Post an update"}
          </button>
        )}
      </div>

      <p className={styles.lede}>
        Notes from the people running this club. Comments stay with the post, so a conversation has
        a place to live after the meeting ends.
      </p>

      <p className="visually-hidden" role="status">
        {notice}
      </p>

      {composerOpen && managesClub && (
        <form className={styles.composer} onSubmit={handlePublish}>
          <label className={styles.composerLabel}>
            <span>Update</span>
            <textarea
              required
              rows={4}
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What should the club know?"
            />
          </label>
          <div className={styles.composerFoot}>
            <span className={styles.count}>{draft.trim().length}/2000</span>
            <button type="submit" className={styles.primaryButton} disabled={saving}>
              {saving ? "Publishing…" : "Publish"}
            </button>
          </div>
        </form>
      )}

      {status === "loading" && (
        <p className={styles.empty} aria-busy="true">
          Loading updates…
        </p>
      )}

      {status === "error" && (
        <div className={styles.empty}>
          <p>Club updates didn&apos;t load: {error}</p>
          <button type="button" className={styles.ghostButton} onClick={load}>
            Try again
          </button>
        </div>
      )}

      {status === "ok" && posts.length === 0 && (
        <p className={styles.empty}>No updates from this club yet.</p>
      )}

      {status === "ok" && posts.length > 0 && (
        <ol className={styles.list}>
          {posts.map((post) => {
            const editing = editingId === post.id;
            const busy = busyId === post.id;
            return (
              <li key={post.id} className={styles.post}>
                <article aria-labelledby={`post-${post.id}`}>
                  <header className={styles.meta}>
                    <h3 id={`post-${post.id}`} className={styles.author}>
                      {post.authorName}
                    </h3>
                    <time dateTime={post.createdAt}>{formatPostTime(post.createdAt)}</time>
                  </header>

                  {editing ? (
                    <div className={styles.editBox}>
                      <label>
                        <span className="visually-hidden">Edit post text</span>
                        <textarea
                          rows={4}
                          maxLength={2000}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                        />
                      </label>
                      <div className={styles.editActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => saveEdit(post)}
                          disabled={busy}
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.body}>{post.body}</p>
                  )}

                  <footer className={styles.foot}>
                    <Link to={`/posts/${post.id}`} className={styles.commentLink}>
                      {post.commentCount === 1 ? "1 comment" : `${post.commentCount} comments`}
                    </Link>

                    {managesClub ? (
                      <span className={styles.managerActions}>
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => startEdit(post)}
                          disabled={busy || editing}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => hidePost(post)}
                          disabled={busy}
                        >
                          Hide
                        </button>
                      </span>
                    ) : (
                      <ReportButton targetType="post" targetId={post.id} />
                    )}
                  </footer>
                </article>
              </li>
            );
          })}
        </ol>
      )}

      {status === "ok" && nextCursor && (
        <button
          type="button"
          className={styles.ghostButton}
          onClick={handleMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : "Earlier updates"}
        </button>
      )}

      {error && status === "ok" && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
