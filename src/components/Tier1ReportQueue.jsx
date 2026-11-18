import { useCallback, useEffect, useState } from "react";
import { getReports, resolveReport } from "../utils/reportsStore";
import styles from "./Tier1ReportQueue.module.css";

/**
 * Platform-wide moderation queue. Tier 1 already has every club's desk through
 * the switcher; this puts every open report in one place so a report cannot
 * disappear behind the currently selected club.
 */
export default function Tier1ReportQueue() {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setStatus("loading");
    setError("");
    getReports()
      .then((next) => {
        setReports(next);
        setStatus("ok");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(report, action) {
    const label =
      action === "dismiss"
        ? "Dismiss this report?"
        : action === "hide"
          ? "Hide this post and close every report on it?"
          : `Remove this ${report.targetType} and close every report on it?`;
    if (!window.confirm(label)) return;

    setBusyId(report.id);
    setNotice("");
    try {
      await resolveReport(report.id, action);
      setReports((current) =>
        current.filter(
          (entry) => !(entry.targetType === report.targetType && entry.targetId === report.targetId)
        )
      );
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
    <section className={styles.section} aria-labelledby="tier1-reports-heading">
      <div className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Moderation</p>
          <h2 id="tier1-reports-heading">
            Reports across clubs {reports.length > 0 ? `(${reports.length})` : ""}
          </h2>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={load}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className={styles.lede}>
        Every open report, whichever club it belongs to. One action closes every report on that
        item.
      </p>

      <p className="visually-hidden" role="status">
        {notice}
      </p>

      {status === "error" && (
        <div className={styles.state}>
          <p>Reports didn&apos;t load: {error}</p>
          <button type="button" className={styles.refresh} onClick={load}>
            Try again
          </button>
        </div>
      )}

      {status === "loading" && <p className={styles.state}>Loading reports…</p>}

      {status === "ok" && reports.length === 0 && (
        <p className={styles.state}>No open reports across any club.</p>
      )}

      {status === "ok" && reports.length > 0 && (
        <ul className={styles.list}>
          {reports.map((report) => {
            const busy = busyId === report.id;
            return (
              <li key={report.id} className={styles.report}>
                <div className={styles.meta}>
                  <span className={styles.club}>{report.clubName}</span>
                  <span className={styles.kind}>
                    {report.targetType === "media" ? "photo" : report.targetType}
                  </span>
                  <span className={styles.reason}>{report.reasonLabel}</span>
                  <span className={styles.count}>
                    {report.reportCount} {report.reportCount === 1 ? "report" : "reports"}
                  </span>
                </div>
                <p className={styles.target}>{report.targetText}</p>
                {report.note && <p className={styles.note}>“{report.note}”</p>}
                <div className={styles.actions}>
                  {report.targetType === "post" && (
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => resolve(report, "hide")}
                      disabled={busy}
                    >
                      Hide post
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.action} ${styles.danger}`}
                    onClick={() => resolve(report, "remove")}
                    disabled={busy}
                  >
                    Remove {report.targetType === "media" ? "photo" : report.targetType}
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => resolve(report, "dismiss")}
                    disabled={busy}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
