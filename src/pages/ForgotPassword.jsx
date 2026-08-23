import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../utils/authStore";
import styles from "./Login.module.css";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await requestPasswordReset(email);
    setSubmitting(false);
    setSent(true);
}

return (
    <div className={`container ${styles.wrap}`}>
    <h1>Reset your password</h1>
    <p className={styles.blurb}>
        Enter your email below and we'll send you a link to reset your password.
    </p>
        {sent ? (
        <p className={styles.blurb}>
            If an account exists for that email, a reset link has been generated. No email service is wired up yet.
            service is wired up yet — ask whoever's running the server to check its console
            output for the link.
        </p>
        ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.label} htmlFor="forgot-email">
            Email
            </label>
            <input
                id="forgot-email"
                type="email"
                className={styles.select}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan.smith@campus.edu"
                autoComplete="email"
                required
            />

            <button type="submit" className={styles.submitButton} disabled={submitting}>
                {submitting ? "Sending…" : "Send reset link"}
            </button>
            </form>
        )}

        <p className={styles.blurb}>
            <Link to="/login">Back to log in</Link>
        </p>
    </div>
    );
}