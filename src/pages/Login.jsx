import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PasswordField from "../components/PasswordField";
import styles from "./Login.module.css";

export default function Login() {
  const navigate = useNavigate();
  const { login, signup } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [submitting, setSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupError, setSignupError] = useState("");

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setLoginError("");
    setSubmitting(true);

    const user = await login({ email: loginEmail, password: loginPassword });

    setSubmitting(false);
    if (!user) {
      setLoginError("Incorrect email or password.");
      return;
    }
    navigate("/");
  }

  async function handleSignupSubmit(e) {
    e.preventDefault();
    setSignupError("");
    setSubmitting(true);

    const { user, error } = await signup({ name, email, password });

    setSubmitting(false);
    if (!user) {
      setSignupError(error || "Couldn't create that account.");
      return;
    }
    navigate("/");
  }

  return (
    <div className={`container ${styles.wrap}`}>
      <h1>{mode === "login" ? "Log in" : "Sign up"}</h1>

      <div className={styles.tabs}>
        <button
          type="button"
          className={mode === "login" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setMode("login")}
        >
          Log In
        </button>
        <button
          type="button"
          className={mode === "signup" ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setMode("signup")}
        >
          Sign Up
        </button>
      </div>

      {mode === "login" ? (
        <>
          <p className={styles.blurb}>
            <blockquote>
              Input your email and the correct password.
            </blockquote>
          </p>

          <form className={styles.form} onSubmit={handleLoginSubmit}>
            <label className={styles.label} htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              className={styles.select}
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="amara.okafor@campus.edu"
              autoComplete="email"
              required
            />

            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <PasswordField
              id="login-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Link to="/forgot-password" className={styles.forgotLink}>
              Forgot password?
            </Link>

            {loginError && <p className={styles.error}>{loginError}</p>}

            <button type="submit" className={styles.submitButton} disabled={submitting}>
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className={styles.blurb}>
            <blockquote>Create a member account to join clubs and RSVP to events.</blockquote>
          </p>

          <form className={styles.form} onSubmit={handleSignupSubmit}>
            <label className={styles.label} htmlFor="signup-name">
              Full name
            </label>
            <input
              id="signup-name"
              type="text"
              className={styles.select}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Smith"
              autoComplete="name"
              required
            />

            <label className={styles.label} htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              className={styles.select}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jordan.smith@campus.edu"
              autoComplete="email"
              required
            />

            <label className={styles.label} htmlFor="signup-password">
              Password <span className={styles.optional}>(at least 8 characters)</span>
            </label>
            <PasswordField
              id="signup-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />

            {signupError && <p className={styles.error}>{signupError}</p>}

            <button type="submit" className={styles.submitButton} disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

