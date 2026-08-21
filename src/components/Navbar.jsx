import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canManageClub } from "../utils/authStore";
import { clubs } from "../data/mockData";
import styles from "./Navbar.module.css";

function linkClass({ isActive }) {
  return isActive ? `${styles.link} ${styles.linkActive}` : styles.link;
}

const ROLE_LABELS = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  member: "Member",
};

/** First club (in listing order) this user is allowed to manage, if any. */
function firstManageableClubId(user) {
  if (!user) return null;
  return clubs.find((c) => canManageClub(user, c.id))?.id ?? null;
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const dashboardClubId = firstManageableClubId(user);

  return (
    <header className={styles.nav}>
      <div className={`container ${styles.inner}`}>
        <NavLink to="/" className={styles.brand}>
          Campus<span className={styles.brandAccent}>Hub</span>
        </NavLink>
        <nav className={styles.links}>
          <NavLink to="/" end className={linkClass}>
            Discover
          </NavLink>
          {user && (
            <NavLink to="/my-events" className={linkClass}>
              My Events
            </NavLink>
          )}
          {dashboardClubId && (
            <NavLink to={`/dashboard/${dashboardClubId}`} className={linkClass}>
              Dashboard
            </NavLink>
          )}
          {user ? (
            <span className={styles.authGroup}>
              <span className={styles.userInfo}>
                {user.name} ({ROLE_LABELS[user.role]})
              </span>
              <button type="button" className={styles.logoutButton} onClick={logout}>
                Log out
              </button>
            </span>
          ) : (
            <NavLink to="/login" className={linkClass}>
              Log in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
