import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useClubs } from "../context/ClubsContext";
import { canManageClub, getRememberedLoginPath } from "../utils/authStore";
import { CROSS_UNIVERSITY_ENABLED } from "../utils/features";
import { getPendingAdminRequests } from "../utils/adminStore";
import styles from "./Navbar.module.css";

function linkClass({ isActive }) {
  return isActive ? `${styles.link} ${styles.linkActive}` : styles.link;
}

const ROLE_LABELS = {
  tier1: "Tier 1",
  campus_admin: "Campus admin",
  tier2: "Club admin",
  member: "Member",
};

/** First club (in listing order) this user is allowed to manage, if any. */
function firstManageableClubId(user, clubs) {
  if (!user) return null;
  return clubs.find((c) => canManageClub(user, c.id))?.id ?? null;
}

/** "Sat 22 Nov" — the edition date, fixed to the campus wall clock. */
function editionDate() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { clubs } = useClubs();
  const location = useLocation();
  const navigate = useNavigate();
  const dashboardClubId = firstManageableClubId(user, clubs);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  // Admins who signed in through the ordinary consumer flow (the login
  // page's "user path") get an explicit button to jump to the desk.
  const loggedViaUserPath = Boolean(user) && getRememberedLoginPath(user.email) === "user";

  // Tier1 and campus admins. Re-checks on every navigation (rather than
  // polling) so the badge stays fresh after approving/denying a request on the
  // Dashboard.
  useEffect(() => {
    if (!["tier1", "campus_admin"].includes(user?.role)) {
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
    <header className={styles.masthead}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className={styles.edition}>
        <div className={`container ${styles.editionInner}`}>
          <span>Vol. 01 · {user?.campusName || "Strathmore University"}</span>
          <span className={styles.editionDate}>{editionDate()}</span>
          <span className={styles.live}>
            <i aria-hidden="true" /> Campus live
          </span>
        </div>
      </div>

      <div className={`container ${styles.inner}`}>
        <NavLink to="/" className={styles.brand} aria-label="Kesho — this week">
          kesho
          <span className={styles.brandDot} aria-hidden="true">
            .
          </span>
        </NavLink>

        <nav className={styles.links} aria-label="Primary">
          <NavLink to="/" end className={linkClass}>
            This week
          </NavLink>
          {CROSS_UNIVERSITY_ENABLED && (
            <NavLink to="/families" className={linkClass}>
              Families
            </NavLink>
          )}
          {user && (
            <NavLink to="/my-events" className={linkClass}>
              Commitments
            </NavLink>
          )}
          {CROSS_UNIVERSITY_ENABLED && user && user.role !== "tier1" && (
            <NavLink to="/network" className={linkClass}>
              My network
            </NavLink>
          )}
          {CROSS_UNIVERSITY_ENABLED && user && (
            <NavLink to="/campus-access" className={linkClass}>
              Campus access
            </NavLink>
          )}
          {dashboardClubId && (
            <NavLink to={`/dashboard/${dashboardClubId}`} className={linkClass}>
              The desk
              {pendingRequestCount > 0 && (
                <span className={styles.badge}>{pendingRequestCount}</span>
              )}
            </NavLink>
          )}
          {user?.role === "tier1" && (
            <NavLink to="/settings/campuses" className={linkClass}>
              Campuses
            </NavLink>
          )}
          {CROSS_UNIVERSITY_ENABLED &&
            (user?.role === "tier1" || (user?.familyAdminOf || []).length > 0) && (
              <NavLink to="/settings/families" className={linkClass}>
                Family settings
              </NavLink>
            )}
        </nav>

        <div className={styles.tools}>
          {user ? (
            <>
              <span className={styles.userInfo}>
                {user.name} · {ROLE_LABELS[user.role]}
              </span>
              {dashboardClubId && loggedViaUserPath && (
                <button
                  type="button"
                  className={styles.deskButton}
                  onClick={() => navigate(`/dashboard/${dashboardClubId}`)}
                >
                  Open the desk
                  {pendingRequestCount > 0 && (
                    <span className={`${styles.badge} ${styles.buttonBadge}`}>
                      {pendingRequestCount}
                    </span>
                  )}
                </button>
              )}
              <button type="button" className={styles.logoutButton} onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className={styles.loginLink}>
              Log in
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
