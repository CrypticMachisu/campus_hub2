import { useId, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { reportContent } from "../utils/reportsStore";
import styles from "./ReportButton.module.css";

const REASONS = [
  { value: "spam", label: "Spam or advertising" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "off_topic", label: "Off topic" },
  { value: "other", label: "Something else" },
];

/**
 * Inline report control for a post or comment.
 *
 * The form is a native dialog so Escape, focus trapping and focus return come
 * from the browser rather than a hand-written trap. Reporting requires a
 * session; signed-out readers see nothing here and can still read the thread.
 */
export default function ReportButton({ targetType, targetId, label = "Report" }) {
  const { user } = useAuth();
  const dialogRef = useRef(null);
  const headingId = useId();
  const [reason, setReason] = useState("spam");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  if (!user) return null;

  function openDialog() {
    setError("");
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await reportContent({ targetType, targetId, reason, note });
      setSent(true);
      closeDialog();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        onClick={openDialog}
        disabled={sent}
        aria-haspopup="dialog"
      >
        {sent ? "Reported" : label}
      </button>

      <span role="status" className={styles.sent}>
        {sent ? "Report received. A club manager will review it." : ""}
      </span>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={headingId}
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
      >
        <form className={styles.form} onSubmit={handleSubmit}>
          <h2 id={headingId}>Report this {targetType}</h2>
          <p className={styles.intro}>
            A club manager will review it. Your name is not shown to them.
          </p>

          <fieldset className={styles.fieldset}>
            <legend>Reason</legend>
            {REASONS.map((option) => (
              <label key={option.value} className={styles.radio}>
                <input
                  type="radio"
                  name="reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={(e) => setReason(e.target.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>

          <label className={styles.noteLabel}>
            Anything else? <span className={styles.optional}>(optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={sending}>
              {sending ? "Sending…" : "Send report"}
            </button>
            <button type="button" className={styles.cancel} onClick={closeDialog}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </span>
  );
}
