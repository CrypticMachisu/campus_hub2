import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { resetPassword } from "../utils/authStore";
import PasswordField from "../components/PasswordField";
import styles from "./Login.module.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await resetPassword({ token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className={`container ${styles.wrap}`}>
        <h1>Reset your password</h1>
        <p className={styles.error}>
          This link is missing its reset token. Request a new one from the{" "}
          <Link to="/forgot-password">forgot password</Link> page.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`container ${styles.wrap}`}>
        <h1>Password updated</h1>
        <p className={styles.blurb}>Redirecting you to log in…</p>
      </div>
    );
  }

  return (
    <div className={`container ${styles.wrap}`}>
      <h1>Choose a new password</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="new-password">
          New password <span className={styles.optional}>(at least 8 characters)</span>
        </label>
        <PasswordField
          id="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submitButton} disabled={submitting}>
          {submitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}