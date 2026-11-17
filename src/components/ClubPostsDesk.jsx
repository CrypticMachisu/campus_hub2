import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createPost, getManagedPosts, setPostStatus, updatePost } from "../utils/postsStore";
import { getReports, resolveReport } from "../utils/reportsStore";
import styles from "./ClubPostsDesk.module.css";

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(status) {
  return { published: "Published", hidden: "Hidden", removed: "Removed" }[status] || status;
}

/**
 * Officer desk for the club's posts and the report queue.
 * Publishing and editing stay inline; hiding is reversible, removing is not
 * (the row and its thread stay for the record, but the public page closes).
 */
export default function ClubPostsDesk({ clubId }) {
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [nextPosts, nextReports] = await Promise.all([
        getManagedPosts(clubId),
        getReports(clubId),
      ]);
      setPosts(nextPosts);
      setReports(nextReports);
      setStatus("ok");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePublish(e) {
    e.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const created = await createPost(clubId, draft);
      setPosts((current) => [created, ...current]);
      setDraft("");
      setNotice("Post published on the club page.");
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
    try {
      const updated = await updatePost(post.id, editDraft);
      setPosts((current) => current.map((entry) => (entry.id === post.id ? updated : entry)));
      setEditingId(null);
      setNotice("Post updated.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(post, nextStatus) {
    if (
      nextStatus === "removed" &&
      !window.confirm(
        "Remove this post? It closes the public thread and cannot be made public again by restoring; hide instead if this is temporary."
      )
    ) {
      return;
    }
    setBusyId(post.id);
    setNotice("");
    try {
      const updated = await setPostStatus(post.id, nextStatus);
      setPosts((current) => current.map((entry) => (entry.id === post.id ? updated : entry)));
      setNotice(
        nextStatus === "hidden"
          ? "Post hidden from the club page."
          : nextStatus === "removed"
            ? "Post removed. The thread is closed."
            : "Post is public again."
      );
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(report, action) {
    if (
      action === "remove" &&
      !window.confirm(
        report.targetType === "comment"
          ? "Remove this comment and close every report on it?"
          : "Remove this post and close every report on it?"
      )
    ) {
      return;
    }
    setBusyId(`report-${report.id}`);
    setNotice("");
    try {
      await resolveReport(report.id, action);
      setReports((current) =>
        current.filter(
          (entry) => !(entry.targetType === report.targetType && entry.targetId === report.targetId)
        )
      );
      if (report.targetType === "post" && action !== "dismiss") {
        setPosts((current) =>
          current.map((entry) =>
            entry.id === report.targetId
              ? { ...entry, status: action === "hide" ? "hidden" : "removed" }
              : entry
          )
        );
      }
      setNotice(
        action === "dismiss"
          ? "Report dismissed."
          : action === "hide"
            ? "Post hidden and its reports closed."
            : "Content removed and its reports closed."
      );
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <p className="visually-hidden" role="status">
        {notice}
      </p>

      <form className={styles.composer} onSubmit={handlePublish}>
        <label className={styles.composerLabel}>
          <span>New post</span>
          <textarea
            required
            rows={3}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What should the club know?"
          />
        </label>
        <div className={styles.composerFoot}>
          <span className={styles.count}>{draft.trim().length}/2000</span>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? "Publishing…" : "Publish post"}
          </button>
        </div>
      </form>

      {status === "loading" && <p className={styles.empty}>Loading posts…</p>}

      {status === "error" && (
        <div className={styles.empty}>
          <p>Posts didn&apos;t load: {error}</p>
          <button type="button" className={styles.ghostButton} onClick={load}>
            Try again
          </button>
        </div>
      )}

      {status === "ok" && posts.length === 0 && (
        <p className={styles.empty}>No posts yet. The first one appears on the club page.</p>
      )}

      {status === "ok" && posts.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Post</th>
              <th scope="col">Comments</th>
              <th scope="col">Reports</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const editing = editingId === post.id;
              const busy = busyId === post.id;
              return (
                <tr key={post.id}>
                  <td className={styles.dateCell}>
                    <time dateTime={post.createdAt}>{shortDate(post.createdAt)}</time>
                  </td>
                  <td className={styles.bodyCell}>
                    {editing ? (
                      <div className={styles.editBox}>
                        <label>
                          <span className="visually-hidden">Edit post text</span>
                          <textarea
                            rows={3}
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
                      <p className={styles.excerpt}>{post.body}</p>
                    )}
                    <Link to={`/posts/${post.id}`} className={styles.permalink}>
                      Open post
                    </Link>
                  </td>
                  <td>{post.commentCount}</td>
                  <td>{post.openReportCount || 0}</td>
                  <td>
                    <span className={`${styles.status} ${styles[post.status]}`}>
                      {statusLabel(post.status)}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => startEdit(post)}
                        disabled={busy || editing}
                      >
                        Edit
                      </button>
                      {post.status !== "published" && (
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => changeStatus(post, "published")}
                          disabled={busy}
                        >
                          Restore
                        </button>
                      )}
                      {post.status === "published" && (
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => changeStatus(post, "hidden")}
                          disabled={busy}
                        >
                          Hide
                        </button>
                      )}
                      {post.status !== "removed" && (
                        <button
                          type="button"
                          className={`${styles.textButton} ${styles.danger}`}
                          onClick={() => changeStatus(post, "removed")}
                          disabled={busy}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className={styles.reportBlock}>
        <h3>Open reports {reports.length > 0 ? `(${reports.length})` : ""}</h3>
        {reports.length === 0 ? (
          <p className={styles.empty}>No open reports.</p>
        ) : (
          <ul className={styles.reportList}>
            {reports.map((report) => (
              <li key={report.id} className={styles.report}>
                <div className={styles.reportHead}>
                  <span className={styles.reportKind}>{report.targetType}</span>
                  <span className={styles.reportReason}>{report.reasonLabel}</span>
                  <span className={styles.reportCount}>
                    {report.reportCount} {report.reportCount === 1 ? "report" : "reports"}
                  </span>
                </div>
                <p className={styles.reportText}>{report.targetText}</p>
                {report.note && <p className={styles.reportNote}>“{report.note}”</p>}
                <div className={styles.reportActions}>
                  {report.targetType === "post" && (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => resolve(report, "hide")}
                      disabled={busyId === `report-${report.id}`}
                    >
                      Hide post
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.textButton} ${styles.danger}`}
                    onClick={() => resolve(report, "remove")}
                    disabled={busyId === `report-${report.id}`}
                  >
                    Remove {report.targetType}
                  </button>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => resolve(report, "dismiss")}
                    disabled={busyId === `report-${report.id}`}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
