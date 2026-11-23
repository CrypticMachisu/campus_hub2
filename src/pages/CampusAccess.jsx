import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCampuses } from "../utils/campusesStore";
import {
  approveCampusAffiliation,
  cancelCampusAffiliation,
  denyCampusAffiliation,
  getCampusAffiliationRequests,
  getMyCampusAffiliations,
  requestCampusAffiliation,
} from "../utils/campusAffiliationsStore";
import { usePageMetadata } from "../hooks/usePageMetadata";
import styles from "./CampusAccess.module.css";

const KIND_LABELS = {
  exchange: "Exchange",
  dual: "Dual programme",
  staff: "Staff",
  alumni: "Alumni",
  other: "Other",
};

function statusLabel(value) {
  if (value === "active") return "Active";
  if (value === "pending") return "Pending";
  if (value === "denied") return "Not approved";
  return "Revoked";
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function CampusAccess() {
  usePageMetadata({
    title: "Campus access",
    description: "Request and manage access to additional campuses.",
  });

  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedCampusId = searchParams.get("campus") || "";
  const [mine, setMine] = useState(null);
  const [campuses, setCampuses] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deciding, setDeciding] = useState(null);
  const [form, setForm] = useState({
    campusId: requestedCampusId,
    kind: "exchange",
    note: "",
  });

  const isAdmin = ["tier1", "campus_admin"].includes(user?.role);

  const load = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const [own, directory] = await Promise.all([getMyCampusAffiliations(), getCampuses()]);
      setMine(own);
      setCampuses(directory);
      if (["tier1", "campus_admin"].includes(user.role)) {
        setQueue(await getCampusAffiliationRequests({ status: "pending" }));
      } else {
        setQueue([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [authLoading, load]);
  const affiliations = mine?.affiliations || [];
  const options = useMemo(() => {
    const unavailable = new Set(
      (mine?.affiliations || [])
        .filter((a) => ["active", "pending"].includes(a.status))
        .map((a) => a.campusId)
    );
    return campuses.filter(
      (campus) => campus.id !== mine?.homeCampusId && !unavailable.has(campus.id)
    );
  }, [campuses, mine]);

  async function handleRequest(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!form.campusId) {
      setError("Choose a campus to request.");
      return;
    }
    setSubmitting(true);
    try {
      const affiliation = await requestCampusAffiliation(form);
      setNotice(`Your request for ${affiliation.campusName} is pending approval.`);
      setForm({ campusId: "", kind: "exchange", note: "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(affiliation) {
    if (!window.confirm(`Cancel your request for ${affiliation.campusName}?`)) return;
    setError("");
    setNotice("");
    setDeciding(affiliation.id);
    try {
      await cancelCampusAffiliation(affiliation.id);
      setNotice(`Your request for ${affiliation.campusName} was cancelled.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeciding(null);
    }
  }

  async function handleDecision(affiliation, approve) {
    const verb = approve ? "approve" : "deny";
    if (
      !window.confirm(
        `${approve ? "Approve" : "Deny"} ${affiliation.userName}'s request for ${affiliation.campusName}?`
      )
    ) {
      return;
    }
    setError("");
    setNotice("");
    setDeciding(affiliation.id);
    try {
      if (approve) await approveCampusAffiliation(affiliation.id);
      else await denyCampusAffiliation(affiliation.id);
      setNotice(`${affiliation.userName}'s request was ${approve ? "approved" : "denied"}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeciding(null);
    }
  }

  if (authLoading) {
    return (
      <div className={styles.page}>
        <p role="status">Loading campus access…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Campus access</p>
          <h1>One home campus. Additional campuses by approval.</h1>
        </header>
        <p className={styles.notice}>
          <Link to="/login">Log in</Link> to request access to another campus.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Campus access</p>
        <h1>One home campus. Additional campuses by approval.</h1>
        <p className={styles.lede}>
          Your home campus is <strong>{mine?.homeCampusName || user.campusName}</strong>. If you
          study, work or join a programme at another campus, request it here. A campus admin or tier
          1 admin decides the request; it is not granted automatically.
        </p>
      </header>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}{" "}
          <button type="button" className={styles.quietButton} onClick={load}>
            Try again
          </button>
        </p>
      )}

      <section className={styles.section} aria-labelledby="my-campus-heading">
        <h2 id="my-campus-heading">Your campuses</h2>
        <p className={styles.sectionLede}>
          Active affiliations are confirmed. Pending requests can be cancelled until a campus admin
          decides them. Your home campus always stays on your account.
        </p>

        {loading ? (
          <p role="status">Loading your campus affiliations…</p>
        ) : (
          <ul className={styles.affiliationList}>
            <li className={styles.affiliationCard}>
              <div>
                <h3>{mine?.homeCampusName || user.campusName}</h3>
                <p className={styles.slug}>Home campus</p>
              </div>
              <span className={`${styles.status} ${styles.active}`}>Active</span>
            </li>
            {affiliations
              .filter((affiliation) => affiliation.kind !== "home")
              .map((affiliation) => (
                <li key={affiliation.id} className={styles.affiliationCard}>
                  <div>
                    <h3>{affiliation.campusName}</h3>
                    <p className={styles.slug}>
                      {KIND_LABELS[affiliation.kind] || affiliation.kind}
                      {affiliation.requestedAt
                        ? ` · requested ${shortDate(affiliation.requestedAt)}`
                        : ""}
                    </p>
                    {affiliation.note && <p className={styles.note}>{affiliation.note}</p>}
                    {affiliation.status === "pending" && (
                      <button
                        type="button"
                        className={`${styles.button} ${styles.quietButton}`}
                        disabled={deciding === affiliation.id}
                        onClick={() => handleCancel(affiliation)}
                      >
                        {deciding === affiliation.id ? "Cancelling…" : "Cancel request"}
                      </button>
                    )}
                  </div>
                  <span
                    className={`${styles.status} ${
                      affiliation.status === "active" ? styles.active : styles.pending
                    }`}
                  >
                    {statusLabel(affiliation.status)}
                  </span>
                </li>
              ))}
            {affiliations.filter((a) => a.kind !== "home").length === 0 && (
              <li className={styles.empty}>
                No additional campuses yet. Request one below if you have a legitimate connection.
              </li>
            )}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="request-campus-heading">
        <h2 id="request-campus-heading">Request another campus</h2>
        <p className={styles.sectionLede}>
          Use the campus where your programme, exchange, employment or alumni status is based. Add a
          short note so the approver can verify it.
        </p>
        {options.length === 0 ? (
          <p className={styles.empty}>
            There is no other campus available to request right now. You already have an active or
            pending relationship with every other campus.
          </p>
        ) : (
          <form className={styles.form} onSubmit={handleRequest}>
            <div className={styles.formRow}>
              <label className={styles.field}>
                Campus
                <select
                  value={form.campusId}
                  onChange={(e) => setForm((current) => ({ ...current, campusId: e.target.value }))}
                  required
                >
                  <option value="">Choose a campus</option>
                  {options.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Relationship
                <select
                  value={form.kind}
                  onChange={(e) => setForm((current) => ({ ...current, kind: e.target.value }))}
                >
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              Note for the approver
              <textarea
                value={form.note}
                onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))}
                rows={3}
                maxLength={500}
                placeholder="e.g. Exchange student in the Faculty of Computing, January to June."
              />
              <span className={styles.hint}>
                {500 - form.note.length} characters remaining. Do not include a password or ID
                number.
              </span>
            </label>
            <div className={styles.actions}>
              <button
                type="submit"
                className={`${styles.button} ${styles.primary}`}
                disabled={submitting || !form.campusId}
              >
                {submitting ? "Sending request…" : "Send request"}
              </button>
            </div>
          </form>
        )}
      </section>

      {isAdmin && (
        <section className={styles.section} aria-labelledby="approval-heading">
          <h2 id="approval-heading">Requests to approve</h2>
          <p className={styles.sectionLede}>
            {user.role === "tier1"
              ? "Every campus's pending requests."
              : `Pending requests for ${user.campusName}. You cannot approve your own request.`}
          </p>

          {loading ? (
            <p role="status">Loading the approval queue…</p>
          ) : queue.length === 0 ? (
            <p className={styles.empty}>No pending campus affiliation requests.</p>
          ) : (
            <ul className={styles.queueList}>
              {queue.map((request) => {
                const ownRequest = request.userId === user.id;
                return (
                  <li key={request.id} className={styles.queueCard}>
                    <div className={styles.queueBody}>
                      <h3>{request.userName}</h3>
                      <p className={styles.slug}>
                        {request.userEmail} · home {request.homeCampusName}
                      </p>
                      <p className={styles.requestLine}>
                        Requests <strong>{request.campusName}</strong> ·{" "}
                        {KIND_LABELS[request.kind] || request.kind} ·{" "}
                        {shortDate(request.requestedAt)}
                      </p>
                      {request.note && <p className={styles.note}>{request.note}</p>}
                      {ownRequest && (
                        <p className={styles.ownRequest}>
                          This is your own request. Another campus admin or a platform admin must
                          decide it.
                        </p>
                      )}
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.primary}`}
                        disabled={ownRequest || deciding === request.id}
                        onClick={() => handleDecision(request, true)}
                      >
                        {deciding === request.id ? "Working…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.danger}`}
                        disabled={ownRequest || deciding === request.id}
                        onClick={() => handleDecision(request, false)}
                      >
                        Deny
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
