import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadLoginPaths, saveLoginPath } from "../utils/authStore";
import PasswordField from "../components/PasswordField";
import styles from "./Login.module.css";

// Demo accounts from the seeded database (server/campushub_database.sql,
// password set by `npm run set-passwords`).
const DEMO_ADMIN = {
  mode: "admin",
  label: "Admin demo",
  name: "Amara Okafor (tier1)",
  email: "amara.okafor@campus.edu",
  // Seeded demo password (SEED_PASSWORD in server/.env).
  password: "campushub123",
};
const DEMO_USER = {
  mode: "user",
  label: "User demo",
  name: "Sofia Ramirez (member)",
  email: "sofia.ramirez@campus.edu",
  password: "campushub123",
};

// Remembers, per account, which login path each account last used, so
// future visits to the login page preselect the right path automatically
// ("user" | "admin"). The helpers live in utils/authStore because the
// Navbar reads the same record too.

export default function Login() {
  const navigate = useNavigate();
  const { login, discardLogin, signup } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [submitting, setSubmitting] = useState(false);

  // Which login path the user is on. This is more than cosmetics: it
  // picks where a successful login navigates and, on the admin path,
  // rejects accounts that don't actually have admin rights. Newly
  // promoted admins come back and use this path; plain members use the
  // user path. Each choice is remembered per email for future logins.
  const [rolePath, setRolePath] = useState("user");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Preselect the login path for an account the visitor has previously
  // signed in with ("recently promoted" case: Sofia became a tier2,
  // so next time they type her email the page switches to Admin).
  useEffect(() => {
    const remembered = loadLoginPaths()[loginEmail.trim().toLowerCase()];
    if (remembered && remembered !== rolePath) setRolePath(remembered);
    // rolePath intentionally omitted: only the email drives the switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginEmail]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupError, setSignupError] = useState("");

  // Demo shortcut: prefill the credentials of the account matching the
  // currently chosen path. The password is the seeded demo password —
  // only for demo data; anyone can still type their own account instead.
  function fillDemo(account) {
    setLoginEmail(account.email);
    setLoginPassword(account.password);
    setRolePath(account.mode);
  }

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

    // The paths are separated for real: a member picking the Admin path
    // is stopped here — the token this attempt just stored AND the
    // context's half-set user are both discarded, so the navbar never
    // shows a logged-in state for an account the gate just rejected —
    // while admins may still use the user path if they only want to
    // browse.
    if (rolePath === "admin" && user.role === "member") {
      discardLogin();
      // Mirrors the promotion flip: if this account was demoted since its
      // last login, its remembered "admin" default is now a dead end —
      // flip it to "user" here so the toggle preselects the path that
      // actually works next visit, without the member having to toggle it
      // back manually after reading the error.
      saveLoginPath(loginEmail.trim().toLowerCase(), "user");
      setLoginError("That account doesn't have admin access yet. Use the user login.");
      return;
    }

    // Remember which path this account used, so future visits land on
    // the same path automatically. If the *user* path belongs to an
    // account that now has admin rights (e.g. a freshly promoted club
    // admin), remember "admin" instead: their next visit auto-switches
    // to the admin path, no manual toggle needed. Admins may still use
    // the user path whenever they like — this only changes the
    // remembered default, not this session.
    const effectivePath = rolePath === "user" && user.role !== "member" ? "admin" : rolePath;
    saveLoginPath(loginEmail.trim().toLowerCase(), effectivePath);

    // Admin path lands on the Dashboard; user path lands on the home feed.
    navigate(rolePath === "admin" ? "/dashboard" : "/");
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
          <p className={styles.blurb}>Input your email and the correct password.</p>

          <div className={styles.rolePath}>
            <span className={styles.demoLabel}>Log in as:</span>
            <div className={styles.rolePathButtons}>
              <button
                type="button"
                className={
                  rolePath === "user"
                    ? `${styles.rolePathButton} ${styles.rolePathButtonActive}`
                    : styles.rolePathButton
                }
                onClick={() => setRolePath("user")}
              >
                User
              </button>
              <button
                type="button"
                className={
                  rolePath === "admin"
                    ? `${styles.rolePathButton} ${styles.rolePathButtonActive}`
                    : styles.rolePathButton
                }
                onClick={() => setRolePath("admin")}
              >
                Admin
              </button>
            </div>
            <p className={styles.rolePathHint}>
              {rolePath === "admin"
                ? "Admin path — your account needs tier1 or tier2 admin rights (e.g. you were recently promoted). Successful logins land on the Dashboard."
                : "User path — clubs, events and RSVPs. Successful logins land on the home feed."}
            </p>
          </div>

          <div className={styles.demoPicker}>
            <span className={styles.demoLabel}>
              Quick fill ({rolePath === "admin" ? "admin demo" : "user demo"}):
            </span>
            <div className={styles.demoButtons}>
              {[rolePath === "admin" ? DEMO_ADMIN : DEMO_USER].map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className={styles.demoButton}
                  onClick={() => fillDemo(account)}
                >
                  <span className={styles.demoRole}>{account.label}</span>
                  <span className={styles.demoName}>{account.name}</span>
                </button>
              ))}
            </div>
          </div>

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
          <p className={styles.blurb}>Create a member account to join clubs and RSVP to events.</p>

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
