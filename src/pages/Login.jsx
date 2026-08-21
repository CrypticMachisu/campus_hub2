import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllUsers } from "../utils/authStore";
import { useAuth } from "../context/AuthContext";
import styles from "./Login.module.css";

const ROLE_LABELS = {
  tier1: "Tier 1 Admin",
  tier2: "Tier 2 Admin",
  member: "Member",
};

export default function Login() {
  const navigate = useNavigate();
  const { login, signup } = useAuth();

  // Seed accounts + anyone who has signed up at runtime. Kept in state
  // (rather than read once at import time) so a brand-new account shows
  // up in the picker immediately after signup, without a page reload.
  const [accountList, setAccountList] = useState(() => getAllUsers());

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [selectedId, setSelectedId] = useState(accountList[0]?.id ?? "");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signupError, setSignupError] = useState("");

  function handleLoginSubmit(e) {
    e.preventDefault();
    if (!selectedId) return;
    login(selectedId);
    navigate("/");
  }

  function handleSignupSubmit(e) {
    e.preventDefault();
    setSignupError("");

    const newUser = signup({ name, email });
    if (!newUser) {
      setSignupError(
        "Couldn't create that account — check that both fields are filled in and the email isn't already registered."
      );
      return;
    }

    // Refresh the account list so the new member appears right away,
    // then hand off to the login tab with them pre-selected.
    setAccountList(getAllUsers());
    setSelectedId(newUser.id);
    setName("");
    setEmail("");
    setMode("login");
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
            <blockquote>Please select an account to continue.</blockquote>
          </p>

          <form className={styles.form} onSubmit={handleLoginSubmit}>
            <label className={styles.label} htmlFor="user-select">
              Choose an account
            </label>
            <select
              id="user-select"
              className={styles.select}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {accountList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {ROLE_LABELS[u.role]}
                </option>
              ))}
            </select>

            <button type="submit" className={styles.submitButton}>
              Log in
            </button>
          </form>

          <div className={styles.list}>
            {accountList.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`${styles.userRow} ${u.id === selectedId ? styles.userRowSelected : ""}`}
                onClick={() => {
                  login(u.id);
                  navigate("/");
                }}
              >
                <span className={styles.userName}>{u.name}</span>
                <span className={styles.userRole}>{ROLE_LABELS[u.role]}</span>
              </button>
            ))}
          </div>
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
            />

            {signupError && <p className={styles.error}>{signupError}</p>}

            <button type="submit" className={styles.submitButton}>
              Create account
            </button>
          </form>
        </>
      )}
    </div>
  );
}
