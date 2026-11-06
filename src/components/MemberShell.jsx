import { useEffect, useState } from "react";
import { NavLink, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canManageClub } from "../utils/authStore";
import styles from "./MemberShell.module.css";

/** "Debate & Rhetoric Society" -> "DR" (skips short joining words). */
function monogram(name = "") {
  const words = name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return (words[0]?.[0] || name[0] || "?").concat(words[1]?.[0] || "").toUpperCase();
}

/** Stable per-club tint so the same club is always the same paper colour. */
function hueFor(id = "") {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 360;
  return hash;
}

function navClass({ isActive }) {
  return isActive ? `${styles.clubLink} ${styles.clubLinkActive}` : styles.clubLink;
}

function utilityClass({ isActive }) {
  return isActive ? `${styles.utilityLink} ${styles.utilityLinkActive}` : styles.utilityLink;
}

/**
 * Chrome for signed-in users who belong to at least one club.
 * Desktop: a persistent club sidebar. Mobile: a sticky bottom bar.
 * Replaces the generic Navbar/Footer — that chrome is reserved for
 * logged-out visitors and members who haven't joined a club yet.
 */
export default function MemberShell({ myClubs }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // The club currently in context, whichever club-scoped page we're on.
  const segments = location.pathname.split("/").filter(Boolean);
  const activeClubId = ["workspace", "dashboard", "clubs"].includes(segments[0])
    ? segments[1]
    : null;
  const activeClub = myClubs.find((c) => c.id === activeClubId) || null;

  // Announce the workspace once, so screen readers know the context changed
  // when a member moves from one club to another.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (activeClub) setAnnouncement(`Viewing ${activeClub.name}`);
  }, [activeClub]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#workspace-main">
        Skip to content
      </a>

      <aside className={styles.sidebar}>
        <Link to="/" className={styles.brand}>
          Campus<span className={styles.brandAccent}>Hub</span>
        </Link>
        <p className={styles.tagline}>Member workspace</p>

        <nav aria-label="My clubs" className={styles.clubNav}>
          <p className={styles.navLabel}>My clubs</p>
          <ul className={styles.clubList}>
            {myClubs.map((club) => (
              <li key={club.id}>
                <NavLink
                  to={`/workspace/${club.id}`}
                  className={navClass}
                  style={{ "--chip-hue": hueFor(club.id) }}
                >
                  <span className={styles.monogram} aria-hidden="true">
                    {monogram(club.name)}
                  </span>
                  <span className={styles.clubText}>
                    <span className={styles.clubName}>{club.name}</span>
                    <span className={styles.clubMeta}>
                      {canManageClub(user, club.id) ? "You manage" : club.category}
                    </span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Workspace" className={styles.utilityNav}>
          <NavLink to="/discover" className={utilityClass}>
            Discover other clubs
          </NavLink>
          <NavLink to="/my-events" className={utilityClass}>
            My events
          </NavLink>
          {activeClub && canManageClub(user, activeClub.id) && (
            <NavLink to={`/dashboard/${activeClub.id}`} className={utilityClass}>
              Manage {activeClub.name}
            </NavLink>
          )}
        </nav>

        <div className={styles.account}>
          <span className={styles.accountName}>{user.name}</span>
          <span className={styles.accountEmail}>{user.email}</span>
          <button type="button" className={styles.logout} onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.mobileHeader}>
          <Link to="/" className={styles.brand}>
            Campus<span className={styles.brandAccent}>Hub</span>
          </Link>
          <span className={styles.mobileContext}>{activeClub?.name || "Member workspace"}</span>
          <button type="button" className={styles.logout} onClick={logout}>
            Log out
          </button>
        </header>

        <main id="workspace-main" className={styles.main}>
          <Outlet />
        </main>
      </div>

      <nav className={styles.bottomBar} aria-label="My clubs and workspace">
        <ul className={styles.bottomClubs}>
          {myClubs.map((club) => (
            <li key={club.id}>
              <NavLink
                to={`/workspace/${club.id}`}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.bottomClub} ${styles.bottomClubActive}`
                    : styles.bottomClub
                }
                style={{ "--chip-hue": hueFor(club.id) }}
              >
                <span className={styles.monogram} aria-hidden="true">
                  {monogram(club.name)}
                </span>
                <span className={styles.bottomClubName}>{club.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={styles.bottomDiscover}
          onClick={() => navigate("/discover")}
        >
          Discover
        </button>
      </nav>

      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  );
}
