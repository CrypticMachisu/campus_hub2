import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { rejectSessionRetry, resolveSessionRetry } from "../utils/api";
import PasswordField from "./PasswordField";
import styles from "./SessionExpiryModal.module.css";

/**
 * A session can expire while a draft is open. This keeps the current route and
 * component tree mounted, so re-authenticating never discards the draft.
 */
export default function SessionExpiryModal() {
  const { user, login } = useAuth();
  const dialogRef = useRef(null);
  const openRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handleExpired() {
      if (!userRef.current || openRef.current) return;
      openRef.current = true;
      setError("");
      setPassword("");
      setOpen(true);
    }
    window.addEventListener("campushub:session-expired", handleExpired);
    return () => window.removeEventListener("campushub:session-expired", handleExpired);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const restored = await login({ email: user?.email, password });
    setSubmitting(false);
    if (!restored) {
      setError("That password didn't work. Your draft is still here.");
      return;
    }
    // Close the modal before releasing the queued requests: a fast second
    // 401 must be able to open a fresh re-auth cycle.
    openRef.current = false;
    setOpen(false);
    resolveSessionRetry();
  }

  function close() {
    openRef.current = false;
    setOpen(false);
    rejectSessionRetry();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="session-expiry-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        // A close event from the previous cycle can arrive after the next
        // expiry has already reopened the same dialog.
        if (openRef.current) return;
        setOpen(false);
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <p className={styles.kicker}>Session expired</p>
        <h2 id="session-expiry-title">Log in again to keep this draft.</h2>
        <p className={styles.body}>
          You&apos;re still on the same page. Log in as <strong>{user?.email}</strong> and
          everything you were writing will stay exactly where it is.
        </p>

        <label className={styles.label} htmlFor="session-expiry-password">
          Password
        </label>
        <PasswordField
          id="session-expiry-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          autoFocus
        />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={submitting}>
            {submitting ? "Logging in…" : "Log in again"}
          </button>
          <button type="button" className={styles.quiet} onClick={close}>
            Not now
          </button>
        </div>
        <p className={styles.note}>The draft stays on this page until you leave it.</p>
      </form>
    </dialog>
  );
}
