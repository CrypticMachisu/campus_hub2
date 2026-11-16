import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useClubs } from "../context/ClubsContext";
import { formatEventDate } from "../utils/dateTime";
import {
  commitToCommitment,
  getCommitment,
  kindLabel,
  withdrawCommitment,
} from "../utils/commitmentsStore";
import { SkeletonGroup } from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import CommentSection from "../components/CommentSection";
import styles from "./CommitmentDetail.module.css";

/** Builds and downloads a one-commitment .ics file (no dependency needed). */
function downloadCommitmentIcs(commitment, clubName) {
  const start = new Date(`${commitment.date}T${commitment.time || "00:00"}:00`);
  if (Number.isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const stamp = (date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (value = "") =>
    value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

  const description = [
    commitment.description,
    commitment.hostName ? `Host: ${commitment.hostName}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kesho//Commitments//EN",
    "BEGIN:VEVENT",
    `UID:${commitment.id}@kesho`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(commitment.title)}`,
    `LOCATION:${escape(
      `${commitment.location}${commitment.county ? `, ${commitment.county}` : ""}`
    )}`,
    `DESCRIPTION:${escape(description)}${clubName ? `\\nHosted by ${escape(clubName)}` : ""}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${commitment.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * The commitment notice: where, when, who is hosting, and how many seats are
 * left. Sign-up is the same idempotent call the club page uses, so a reader can
 * commit (or join the waitlist) without going back.
 */
export default function CommitmentDetail() {
  const { commitmentId } = useParams();
  const { user } = useAuth();
  const { clubs } = useClubs();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error | missing
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");

    getCommitment(commitmentId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
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
  }, [commitmentId, reloadKey]);

  async function handleJoin() {
    if (!user) {
      navigate("/login");
      return;
    }
    if (busy) return;

    setBusy(true);
    setNotice("");
    try {
      if (data.signup) {
        const result = await withdrawCommitment(commitmentId);
        setData((current) => ({
          ...current,
          signup: null,
          commitment: { ...current.commitment, signupCount: result.signupCount },
        }));
        setNotice("You've withdrawn. The seat is open for the next person.");
      } else {
        const result = await commitToCommitment(commitmentId);
        setData((current) => ({
          ...current,
          signup: result.signup,
          commitment: { ...current.commitment, signupCount: result.signupCount },
        }));
        setNotice(
          result.signup.waitlisted
            ? `You're on the waitlist at position ${result.signup.position}. You'll move up if someone withdraws.`
            : `You're going. ${data.commitment.title} is now in your commitments.`
        );
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className={styles.page}>
        <SkeletonGroup label="Loading commitment…">
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
        <p className={styles.eyebrow}>Kesho · Notice</p>
        <h1 className={styles.title}>Commitment not found.</h1>
        <p className={styles.prose}>
          This activity may have been removed, or the link is out of date. The club page lists what
          is still on.
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
          title="This commitment didn't load"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </div>
    );
  }

  const { commitment, signup } = data;
  const club = clubs.find((candidate) => candidate.id === commitment.clubId);
  const capacity = commitment.capacity;
  const going =
    capacity == null ? commitment.signupCount : Math.min(commitment.signupCount, capacity);
  const waiting = capacity == null ? 0 : Math.max(0, commitment.signupCount - capacity);
  const full = capacity != null && going >= capacity;
  const joinedLabel = signup?.waitlisted
    ? `You're #${signup.position} on the waitlist`
    : "You're going";

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/discover">This week</Link>
        <span aria-hidden="true"> / </span>
        {club ? <Link to={`/clubs/${club.id}`}>{club.name}</Link> : <span>Club</span>}
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Commitment</span>
      </nav>

      <article className={styles.notice}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>
            {kindLabel(commitment.kind)}
            {club ? ` · ${club.name}` : ""}
            {commitment.county ? ` · ${commitment.county}` : ""}
          </p>
          <h1 className={styles.title}>{commitment.title}</h1>
          <p className={styles.byline}>
            {formatEventDate(commitment.date)} · {commitment.time} · {commitment.location}
          </p>
        </header>

        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <h2 className={styles.sectionTitle}>Where and when</h2>
            <dl className={styles.facts}>
              <div>
                <dt>Date</dt>
                <dd>{formatEventDate(commitment.date)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{commitment.time}</dd>
              </div>
              <div>
                <dt>Place</dt>
                <dd>
                  {commitment.location}
                  {commitment.county ? `, ${commitment.county}` : ""}
                </dd>
              </div>
              <div>
                <dt>Host</dt>
                <dd>{commitment.hostName || club?.name || "The club"}</dd>
              </div>
            </dl>

            <h2 className={styles.sectionTitle}>What happens</h2>
            <p className={styles.prose}>
              {commitment.description ||
                "The host hasn't written the run of the day yet. Join and you'll be counted; the club will share details before the date."}
            </p>

            <h2 className={styles.sectionTitle}>Who's going</h2>
            <p className={styles.prose}>
              {going} {going === 1 ? "person has" : "people have"} committed
              {capacity != null
                ? `, out of ${capacity} ${capacity === 1 ? "place" : "places"}`
                : ""}
              .
              {waiting > 0
                ? ` ${waiting} ${waiting === 1 ? "person is" : "people are"} waiting for a seat.`
                : ""}
            </p>
          </div>

          <aside className={styles.stub} aria-label="Commitment ticket">
            <p className={styles.stubLabel}>Commitment</p>
            <p className={styles.stubCount}>
              <b>{going}</b>
              {capacity != null ? <span> / {capacity} places</span> : <span> committed</span>}
            </p>

            {capacity != null && (
              <div
                className={styles.meter}
                role="img"
                aria-label={`${going} of ${capacity} places taken`}
              >
                <span
                  style={{ width: `${Math.min(100, Math.round((going / capacity) * 100))}%` }}
                />
              </div>
            )}

            {waiting > 0 && (
              <p className={styles.waitNote}>
                {waiting} on the waitlist. Seats pass to the next person in order when someone
                withdraws.
              </p>
            )}

            <p className="visually-hidden" role="status">
              {notice}
            </p>

            {signup ? (
              <>
                <p className={signup.waitlisted ? styles.waitingBadge : styles.goingBadge}>
                  {joinedLabel}
                  {!signup.waitlisted ? ". It's in your commitments." : "."}
                </p>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={handleJoin}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Withdraw"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleJoin}
                disabled={busy}
              >
                {busy ? "Saving…" : full ? "Join the waitlist" : "Commit to this"}
              </button>
            )}

            {!user && (
              <p className={styles.signInHint}>
                <Link to="/login">Sign in</Link> to commit; browsing stays open.
              </p>
            )}

            <button
              type="button"
              className={styles.calendarButton}
              onClick={() => downloadCommitmentIcs(commitment, club?.name)}
            >
              Add to calendar
            </button>

            {notice && <p className={styles.noticeLine}>{notice}</p>}

            <p className={styles.finePrint}>
              No payment. If the seats fill, the waitlist is first come, first served, and your
              position is always shown.
            </p>
          </aside>
        </div>
      </article>

      <section className={styles.discussion} aria-label="Commitment discussion">
        <CommentSection targetType="commitment" targetId={commitment.id} />
      </section>
    </div>
  );
}
