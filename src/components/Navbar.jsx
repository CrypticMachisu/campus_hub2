import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useClubs } from "../context/ClubsContext";
import { canManageClub } from "../utils/authStore";
import { getPendingAdminRequests } from "../utils/adminStore";
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
function firstManageableClubId(user, clubs) {
  if (!user) return null;
  return clubs.find((c) => canManageClub(user, c.id))?.id ?? null;
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { clubs } = useClubs();
  const location = useLocation();
  const dashboardClubId = firstManageableClubId(user, clubs);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  // Tier1 only. Re-checks on every navigation (rather than polling) so the
  // badge stays fresh after approving/denying a request on the Dashboard.
  useEffect(() => {
    if (user?.role !== "tier1") {
      setPendingRequestCount(0);
      return;
    }
    let cancelled = false;
    getPendingAdminRequests()
      .then((requests) => {
        if (!cancelled) setPendingRequestCount(requests.length);
      })
      .catch(() => {
        if (!cancelled) setPendingRequestCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [user, location.pathname]);

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
              {pendingRequestCount > 0 && (
                <span className={styles.badge}>{pendingRequestCount}</span>
              )}
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
