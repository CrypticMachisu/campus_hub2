import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPost } from "../utils/postsStore";
import { useAuth } from "../context/AuthContext";
import CommentSection from "../components/CommentSection";
import PostPhotos from "../components/PostPhotos";
import ReportButton from "../components/ReportButton";
import ErrorState from "../components/ErrorState";
import { SkeletonGroup } from "../components/Skeleton";
import styles from "./PostDetail.module.css";

function formatPostTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * A post's permanent address: the dispatch, its club, and the shared comment
 * thread. Public while published; managers can still open a hidden post, which
 * is where the "hidden" state is explained.
 */
export default function PostDetail() {
  const { postId } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error | missing
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");

    getPost(postId)
      .then((result) => {
        if (cancelled) return;
        setPost(result);
        setStatus("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        if (/not found/i.test(err.message)) {
          setStatus("missing");
        } else {
          setError(err.message);
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [postId, reloadKey]);

  if (status === "loading") {
    return (
      <div className={styles.page}>
        <SkeletonGroup label="Loading post…">
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </SkeletonGroup>
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className={styles.page}>
        <p className={styles.eyebrow}>Kesho · Dispatch</p>
        <h1 className={styles.title}>Post not found.</h1>
        <p className={styles.prose}>
          This update may have been removed, or the link is out of date. The club page lists what is
          still public.
        </p>
        <Link to="/discover" className={styles.backLink}>
          Back to this week
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.page}>
        <ErrorState
          title="This post didn't load"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  const published = post.status === "published";

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to={`/clubs/${post.clubId}`}>{post.clubName}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Dispatch</span>
      </nav>

      <article className={styles.post}>
        <header>
          <p className={styles.eyebrow}>{post.clubName} · Dispatch</p>
          <h1 className={styles.title}>From {post.clubName}</h1>
          <p className={styles.byline}>
            By {post.authorName} ·{" "}
            <time dateTime={post.createdAt}>{formatPostTime(post.createdAt)}</time>
            {post.pinned && <span className={styles.pinnedBadge}>Pinned</span>}
          </p>
        </header>

        {!published && (
          <p className={styles.statusNote}>
            This post is <b>{post.status}</b>. Only managers of {post.clubName} can see it. Restore
            it from the club desk to make it public again.
          </p>
        )}

        <p className={styles.body}>{post.body}</p>
        <PostPhotos
          media={post.media}
          label={`Photos with this update from ${post.clubName}`}
          showReport={Boolean(user) && !post.canManage && post.authorId !== user.id}
        />

        <footer className={styles.foot}>
          <span className={styles.commentCount}>
            {post.commentCount === 1 ? "1 comment" : `${post.commentCount} comments`}
          </span>
          {user && !post.canManage && <ReportButton targetType="post" targetId={post.id} />}
        </footer>
      </article>

      {published ? (
        <section className={styles.discussion} aria-label="Post discussion">
          <CommentSection targetType="post" targetId={post.id} />
        </section>
      ) : (
        <p className={styles.hiddenNote}>
          Comments are hidden with the post. A manager can restore the post to reopen the thread.
        </p>
      )}
    </div>
  );
}
