import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canManageClub } from "../utils/authStore";
import {
  COMMITMENT_KINDS,
  commitToCommitment,
  createCommitment,
  deleteCommitment,
  getCommitmentRoster,
  getCommitments,
  kindLabel,
  withdrawCommitment,
} from "../utils/commitmentsStore";
import styles from "./CommitmentsSection.module.css";

function dateStamp(isoDate) {
  if (!isoDate) return { day: "—", month: "" };
  const [, month, day] = isoDate.split("-").map(Number);
  const date = new Date(2000, month - 1, day);
  return {
    day: String(day).padStart(2, "0"),
    month: date.toLocaleDateString("en-GB", { month: "short" }),
  };
}

const EMPTY_FORM = {
  kind: "activity",
  title: "",
  description: "",
  date: "",
  time: "09:00",
  location: "",
  county: "",
  capacity: "",
  hostName: "",
};

/**
 * A club's commitments: dated activities with a host and an optional cap.
 * Signing up is public (any signed-in reader), and the seat count is honest —
 * past the cap the button becomes "Join the waitlist". Managers can publish
 * and remove activities without leaving the page.
 */
export default function CommitmentsSection({ clubId, heading = "Commitments" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const managesClub = canManageClub(user, clubId);

  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingId, setPendingId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [rosters, setRosters] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [formStatus, setFormStatus] = useState("idle"); // idle | saving | error
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    setStatus("loading");
    setError("");
    getCommitments({ clubId })
      .then((list) => {
        setRows(list);
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

  async function toggleSignup(row) {
    if (!user) {
      navigate("/login");
      return;
    }
    if (pendingId) return;

    setPendingId(row.id);
    setNotice("");
    try {
      if (row.joined) {
        const result = await withdrawCommitment(row.id);
        setRows((current) =>
          current.map((entry) =>
            entry.id === row.id
              ? { ...entry, joined: false, signupCount: result.signupCount, position: null }
              : entry
          )
        );
        setNotice(`You've withdrawn from ${row.title}.`);
      } else {
        const result = await commitToCommitment(row.id);
        setRows((current) =>
          current.map((entry) =>
            entry.id === row.id
              ? {
                  ...entry,
                  joined: true,
                  signupCount: result.signupCount,
                  position: result.signup.position,
                  waitlisted: result.signup.waitlisted,
                }
              : entry
          )
        );
        setNotice(
          result.signup.waitlisted
            ? `You're on the waitlist for ${row.title}${result.signup.position ? ` at position ${result.signup.position}` : ""}.`
            : `You're going to ${row.title}. See you there.`
        );
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setPendingId(null);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    setFormStatus("saving");
    setFormError("");
    try {
      const created = await createCommitment({
        clubId,
        ...form,
        capacity: form.capacity === "" ? null : Number(form.capacity),
      });
      setRows((current) =>
        [...current, created].sort((a, b) =>
          `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
        )
      );
      setForm(EMPTY_FORM);
      setShowForm(false);
      setFormStatus("idle");
      setNotice(`${created.title} is now on the club's commitments.`);
    } catch (err) {
      setFormError(err.message);
      setFormStatus("error");
    }
  }

  async function toggleRoster(row) {
    if (rosters[row.id]?.data) {
      setRosters((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      return;
    }

    setRosters((current) => ({ ...current, [row.id]: { loading: true } }));
    try {
      const result = await getCommitmentRoster(row.id);
      setRosters((current) => ({ ...current, [row.id]: { data: result } }));
    } catch (err) {
      setRosters((current) => ({ ...current, [row.id]: { error: err.message } }));
    }
  }

  async function handleDelete(row) {
    try {
      await deleteCommitment(row.id);
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setConfirmingId(null);
      setNotice(`${row.title} was removed.`);
    } catch (err) {
      setNotice(err.message);
    }
  }

  return (
    <section className={styles.section} aria-labelledby={`commitments-${clubId}`}>
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Show up</p>
          <h2 id={`commitments-${clubId}`} className={styles.title}>
            {heading}
          </h2>
        </div>
        {managesClub && (
          <button
            type="button"
            className={styles.ghostButton}
            aria-expanded={showForm}
            onClick={() => setShowForm((open) => !open)}
          >
            {showForm ? "Close" : "Add a commitment"}
          </button>
        )}
      </div>

      <p className={styles.lede}>
        Dated work with a host and a real capacity. Join one and it appears in your commitments,
        with a waitlist position if the seats are gone.
      </p>

      <p className="visually-hidden" role="status">
        {notice}
      </p>

      {showForm && managesClub && (
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.formRow}>
            <label className={styles.field}>
              <span>Type</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {COMMITMENT_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Title</span>
              <input
                required
                maxLength={150}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
          </div>

          <div className={styles.formRow}>
            <label className={styles.field}>
              <span>Date</span>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Time</span>
              <input
                required
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Spaces</span>
              <input
                type="number"
                min="1"
                max="10000"
                placeholder="No limit"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </label>
          </div>

          <div className={styles.formRow}>
            <label className={styles.field}>
              <span>Where</span>
              <input
                required
                maxLength={150}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>County</span>
              <input
                maxLength={80}
                value={form.county}
                onChange={(e) => setForm({ ...form, county: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Host</span>
              <input
                maxLength={120}
                placeholder="Who is hosting?"
                value={form.hostName}
                onChange={(e) => setForm({ ...form, hostName: e.target.value })}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>What happens</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          {formError && <p className={styles.error}>{formError}</p>}
          <button type="submit" className={styles.primaryButton} disabled={formStatus === "saving"}>
            {formStatus === "saving" ? "Publishing…" : "Publish commitment"}
          </button>
        </form>
      )}

      {status === "loading" && (
        <p className={styles.empty} aria-busy="true">
          Loading commitments…
        </p>
      )}

      {status === "error" && (
        <div className={styles.empty}>
          <p>Commitments didn&apos;t load: {error}</p>
          <button type="button" className={styles.ghostButton} onClick={load}>
            Try again
          </button>
        </div>
      )}

      {status === "ok" && rows.length === 0 && (
        <p className={styles.empty}>
          No commitments are dated yet. Check back after the next club meeting.
        </p>
      )}

      {status === "ok" && rows.length > 0 && (
        <ol className={styles.list}>
          {rows.map((row) => {
            const stamp = dateStamp(row.date);
            const going =
              row.capacity == null ? row.signupCount : Math.min(row.signupCount, row.capacity);
            const waiting = row.capacity == null ? 0 : Math.max(0, row.signupCount - row.capacity);
            const full = row.capacity != null && going >= row.capacity;
            const pending = pendingId === row.id;

            return (
              <li key={row.id} className={styles.row}>
                <div className={styles.stamp} aria-hidden="true">
                  <span>{stamp.month}</span>
                  <b>{stamp.day}</b>
                </div>

                <div className={styles.body}>
                  <p className={styles.kicker}>
                    {kindLabel(row.kind)}
                    {row.county ? ` · ${row.county}` : ""}
                  </p>
                  <h3 className={styles.rowTitle}>
                    <Link to={`/commitments/${row.id}`}>{row.title}</Link>
                  </h3>
                  <p className={styles.meta}>
                    <time dateTime={`${row.date}T${row.time}`}>
                      {stamp.month} {stamp.day} · {row.time}
                    </time>{" "}
                    · {row.location}
                    {row.hostName ? ` · Host: ${row.hostName}` : ""}
                  </p>
                  <p className={styles.spots}>
                    {row.capacity != null
                      ? `${going} of ${row.capacity} going`
                      : `${row.signupCount} going · no limit`}
                    {waiting > 0 ? ` · ${waiting} on the waitlist` : ""}
                    {row.joined && row.waitlisted ? ` · you're #${row.position} waiting` : ""}
                  </p>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={row.joined ? styles.joinedButton : styles.primaryButton}
                    onClick={() => toggleSignup(row)}
                    disabled={pending}
                    aria-label={row.joined ? `Withdraw from ${row.title}` : `Join ${row.title}`}
                  >
                    {pending
                      ? "Saving…"
                      : row.joined
                        ? row.waitlisted
                          ? "On the waitlist"
                          : "You're going"
                        : full
                          ? "Join the waitlist"
                          : "Join"}
                  </button>{" "}
                  <Link to={`/commitments/${row.id}`} className={styles.noticeLink}>
                    Read the notice
                  </Link>
                  {managesClub && (
                    <button
                      type="button"
                      className={styles.rosterButton}
                      onClick={() => toggleRoster(row)}
                      aria-expanded={Boolean(rosters[row.id]?.data)}
                    >
                      {rosters[row.id]?.data ? "Hide roster" : "Roster"}
                    </button>
                  )}
                  {managesClub &&
                    (confirmingId === row.id ? (
                      <span className={styles.confirm}>
                        Remove?
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => handleDelete(row)}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => setConfirmingId(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => setConfirmingId(row.id)}
                      >
                        Remove
                      </button>
                    ))}
                </div>

                {managesClub && rosters[row.id] && (
                  <div className={styles.roster}>
                    {rosters[row.id].loading && <p>Loading the roster…</p>}
                    {rosters[row.id].error && (
                      <p className={styles.error}>
                        Roster didn&apos;t load: {rosters[row.id].error}
                      </p>
                    )}
                    {rosters[row.id].data && (
                      <>
                        <p className={styles.rosterHead}>
                          Going {rosters[row.id].data.summary.going}
                          {rosters[row.id].data.summary.capacity != null
                            ? ` of ${rosters[row.id].data.summary.capacity}`
                            : ""}
                          {" · "}
                          Waitlist {rosters[row.id].data.summary.waitlisted}
                        </p>
                        {rosters[row.id].data.roster.length === 0 ? (
                          <p>No one has committed yet.</p>
                        ) : (
                          <ol className={styles.rosterList}>
                            {rosters[row.id].data.roster.map((person) => (
                              <li key={person.id}>
                                <span className={styles.pos}>{person.position}</span>
                                <span className={styles.person}>
                                  <b>{person.name}</b>
                                  <span>{person.email}</span>
                                </span>
                                <span className={styles.personState}>
                                  {person.waitlisted ? "Waitlist" : "Going"}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
