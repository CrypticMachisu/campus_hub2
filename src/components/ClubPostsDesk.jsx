import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createPost,
  discardPendingPhoto,
  getManagedPosts,
  removePostPhoto,
  requestPhotoUpload,
  setPostPinned,
  setPostStatus,
  updatePost,
  updatePostPhoto,
  uploadPhoto,
} from "../utils/postsStore";
import {
  createPhotoDraft,
  MAX_POST_PHOTOS,
  photoFileError,
  revokePhotoDraft,
} from "../utils/photoFiles";
import { getReports, resolveReport } from "../utils/reportsStore";
import PostPhotoAltEditor from "./PostPhotoAltEditor";
import PostPhotoPicker from "./PostPhotoPicker";
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
export default function ClubPostsDesk({ clubId, canPublishToNetwork = false }) {
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [audience, setAudience] = useState("campus");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [pinningId, setPinningId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState("");
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [savingLabel, setSavingLabel] = useState("");
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => {
        revokePhotoDraft(photo);
        if (photo.mediaId) discardPendingPhoto(photo.mediaId).catch(() => {});
      });
    },
    []
  );

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [managed, nextReports] = await Promise.all([
        getManagedPosts(clubId),
        getReports(clubId),
      ]);
      setPosts(managed.posts);
      setMediaEnabled(Boolean(managed.mediaEnabled));
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

  function resetPhotos() {
    photos.forEach(revokePhotoDraft);
    setPhotos([]);
    setPhotoError("");
  }

  async function addPhotos(event) {
    const files = [...event.target.files];
    event.target.value = "";
    setPhotoError("");
    const room = MAX_POST_PHOTOS - photos.length;
    if (files.length > room) {
      setPhotoError(`A post can have at most ${MAX_POST_PHOTOS} photos.`);
    }

    let next = [...photos];
    for (const file of files.slice(0, Math.max(room, 0))) {
      const message = photoFileError(file);
      if (message) {
        setPhotoError(message);
        continue;
      }
      try {
        next = [...next, await createPhotoDraft(file)];
      } catch {
        setPhotoError("That photo couldn't be opened. Try another file.");
      }
    }
    setPhotos(next);
  }

  function changePhoto(key, patch) {
    setPhotos((current) =>
      current.map((photo) => (photo.key === key ? { ...photo, ...patch } : photo))
    );
  }

  function removePhoto(key) {
    const photo = photos.find((entry) => entry.key === key);
    if (photo?.mediaId) discardPendingPhoto(photo.mediaId).catch(() => {});
    if (photo) revokePhotoDraft(photo);
    setPhotos((current) => current.filter((entry) => entry.key !== key));
    setPhotoError("");
  }

  async function handlePublish(e) {
    e.preventDefault();
    const missing = photos.find((photo) => !photo.decorative && !photo.altText.trim());
    if (missing) {
      setPhotoError("Describe every photo, or mark it as decorative.");
      return;
    }

    setSaving(true);
    setNotice("");
    try {
      let ready = photos;
      const mediaIds = [];
      for (const [index, photo] of ready.entries()) {
        if (!photo.mediaId) {
          setSavingLabel(
            ready.length > 1
              ? `Uploading photo ${index + 1} of ${ready.length}…`
              : "Uploading photo…"
          );
          let reservation = null;
          try {
            reservation = await requestPhotoUpload(clubId, photo);
            await uploadPhoto(reservation.upload, photo.file);
          } catch (err) {
            if (reservation?.media?.id) {
              discardPendingPhoto(reservation.media.id).catch(() => {});
            }
            throw err;
          }
          const withId = { ...photo, mediaId: reservation.media.id };
          ready = ready.map((entry) => (entry.key === photo.key ? withId : entry));
          setPhotos(ready);
          mediaIds.push(withId.mediaId);
        } else {
          mediaIds.push(photo.mediaId);
        }
      }

      setSavingLabel("Publishing…");
      const created = await createPost(clubId, draft, mediaIds, { audience });
      setPosts((current) => [created, ...current]);
      setDraft("");
      setAudience("campus");
      resetPhotos();
      setNotice(
        mediaIds.length
          ? "Post and photos published on the club page."
          : "Post published on the club page."
      );
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSaving(false);
      setSavingLabel("");
    }
  }

  async function removeExistingPhoto(post, media) {
    if (!window.confirm("Remove this photo from the post?")) return;
    setBusyId(post.id);
    setNotice("");
    try {
      await removePostPhoto(post.id, media.id);
      setPosts((current) =>
        current.map((entry) =>
          entry.id === post.id
            ? {
                ...entry,
                media: (entry.media || []).filter((photo) => photo.id !== media.id),
                photoCount: Math.max(0, entry.photoCount - 1),
              }
            : entry
        )
      );
      setReports((current) =>
        current.filter((entry) => !(entry.targetType === "media" && entry.targetId === media.id))
      );
      setNotice("Photo removed. The post stays published.");
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function savePhotoDescription(post, media, values) {
    setBusyId(post.id);
    setNotice("");
    try {
      const updated = await updatePostPhoto(post.id, media.id, values);
      setPosts((current) =>
        current.map((entry) =>
          entry.id === post.id
            ? {
                ...entry,
                media: (entry.media || []).map((photo) =>
                  photo.id === media.id
                    ? {
                        ...photo,
                        ...updated,
                        url: updated.url || photo.url,
                        thumbnailUrl: updated.thumbnailUrl || photo.thumbnailUrl,
                      }
                    : photo
                ),
              }
            : entry
        )
      );
      setNotice("Photo description updated.");
    } catch (err) {
      setNotice(err.message);
      throw err;
    } finally {
      setBusyId(null);
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
        "Remove this post? It closes the public thread and its open reports. You can restore it from this desk if you change your mind."
      )
    ) {
      return;
    }
    setBusyId(post.id);
    setNotice("");
    try {
      const updated = await setPostStatus(post.id, nextStatus);
      setPosts((current) => current.map((entry) => (entry.id === post.id ? updated : entry)));
      if (nextStatus !== "published") {
        const mediaIds = new Set((post.media || []).map((photo) => photo.id));
        setReports((current) =>
          current.filter(
            (entry) =>
              !(entry.targetType === "post" && entry.targetId === post.id) &&
              !(entry.targetType === "media" && mediaIds.has(entry.targetId))
          )
        );
      }
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

  async function togglePin(post) {
    setPinningId(post.id);
    setNotice("");
    try {
      const updated = await setPostPinned(post.id, !post.pinned);
      setPosts((current) =>
        current.map((entry) => {
          if (entry.id === updated.id) return updated;
          return updated.pinned ? { ...entry, pinned: false } : entry;
        })
      );
      setNotice(
        updated.pinned
          ? "Pinned as the club's standing notice."
          : "Post unpinned. It is back in date order."
      );
    } catch (err) {
      setNotice(err.message);
    } finally {
      setPinningId(null);
    }
  }

  async function resolve(report, action) {
    if (
      action === "remove" &&
      !window.confirm(
        report.targetType === "comment"
          ? "Remove this comment and close every report on it?"
          : report.targetType === "media"
            ? "Remove this photo and close every report on it?"
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
        const mediaIds = new Set(
          (posts.find((entry) => entry.id === report.targetId)?.media || []).map(
            (photo) => photo.id
          )
        );
        setPosts((current) =>
          current.map((entry) =>
            entry.id === report.targetId
              ? {
                  ...entry,
                  status: action === "hide" ? "hidden" : "removed",
                  openReportCount: 0,
                  pinned: action === "hide" ? entry.pinned : false,
                }
              : entry
          )
        );
        setReports((current) =>
          current.filter(
            (entry) =>
              !(entry.targetType === "post" && entry.targetId === report.targetId) &&
              !(entry.targetType === "media" && mediaIds.has(entry.targetId))
          )
        );
      } else if (report.targetType === "media" && action !== "dismiss") {
        setPosts((current) =>
          current.map((entry) => ({
            ...entry,
            media: (entry.media || []).filter((photo) => photo.id !== report.targetId),
            photoCount: Math.max(0, entry.photoCount - 1),
          }))
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
        {mediaEnabled && (
          <PostPhotoPicker
            photos={photos}
            onAdd={addPhotos}
            onRemove={removePhoto}
            onChange={changePhoto}
            disabled={saving}
            error={photoError}
          />
        )}
        {canPublishToNetwork && (
          <label className={styles.composerLabel}>
            <span>Audience</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="campus">This campus only</option>
              <option value="network">My club network</option>
            </select>
          </label>
        )}
        <div className={styles.composerFoot}>
          <span className={styles.count}>
            {draft.trim().length}/2000
            {savingLabel ? ` · ${savingLabel}` : ""}
          </span>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? savingLabel || "Publishing…" : "Publish post"}
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
                        {post.media?.length > 0 && (
                          <div className={styles.editPhotos}>
                            <span className={styles.count}>Photos on this post</span>
                            <ul className={styles.editPhotoList}>
                              {post.media.map((media, index) => (
                                <li key={media.id}>
                                  <img src={media.thumbnailUrl || media.url} alt="" />
                                  <PostPhotoAltEditor
                                    media={media}
                                    photoNumber={index + 1}
                                    onSave={(values) => savePhotoDescription(post, media, values)}
                                    disabled={busy}
                                  />
                                  <button
                                    type="button"
                                    className={styles.textButton}
                                    onClick={() => removeExistingPhoto(post, media)}
                                    disabled={busy}
                                  >
                                    Remove photo {index + 1}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
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
                    {post.photoCount > 0 && (
                      <span className={styles.photoCount}>
                        {post.photoCount} {post.photoCount === 1 ? "photo" : "photos"}
                      </span>
                    )}
                  </td>
                  <td>{post.commentCount}</td>
                  <td>{post.openReportCount || 0}</td>
                  <td>
                    <span className={`${styles.status} ${styles[post.status]}`}>
                      {statusLabel(post.status)}
                    </span>
                    {post.pinned && <span className={styles.pinnedBadge}>Pinned</span>}
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
                      {post.pinned ? (
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => togglePin(post)}
                          disabled={busy || pinningId === post.id}
                        >
                          Unpin
                        </button>
                      ) : (
                        post.status === "published" && (
                          <button
                            type="button"
                            className={styles.textButton}
                            onClick={() => togglePin(post)}
                            disabled={busy || pinningId === post.id}
                          >
                            Pin
                          </button>
                        )
                      )}
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
                  <span className={styles.reportKind}>
                    {report.targetType === "media" ? "photo" : report.targetType}
                  </span>
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
                    Remove {report.targetType === "media" ? "photo" : report.targetType}
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
