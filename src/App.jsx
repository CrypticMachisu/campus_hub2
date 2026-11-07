import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ClubsProvider, useClubs } from "./context/ClubsContext";
import { canManageClub, clubsForUser } from "./utils/authStore";
import ErrorBoundary from "./components/ErrorBoundary";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import MemberShell from "./components/MemberShell";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Home from "./pages/Home";
import ClubProfile from "./pages/ClubProfile";
import EventDetail from "./pages/EventDetail";
import MyEvents from "./pages/MyEvents";
import Dashboard from "./pages/Dashboard";
import ClubWorkspace from "./pages/ClubWorkspace";
import NotFound from "./pages/NotFound";
import styles from "./App.module.css";

/**
 * Decides which of the two apps to render:
 *
 *   - Tier 1 admins keep the platform-wide chrome (Navbar + Discover + every
 *     club dashboard), unchanged.
 *   - Signed-in users who belong to at least one club get the member shell:
 *     a club switcher plus that club's workspace, with "/" pointing at their
 *     club instead of the generic feed.
 *   - Everyone else (visitors, and members who haven't joined a club) gets
 *     the generic discovery UI, which is now the "no club yet" view.
 */
function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { clubs, loading: clubsLoading } = useClubs();

  if (authLoading || (user && clubsLoading)) {
    return (
      <div className={styles.splash} aria-busy="true">
        <p className={styles.splashBrand}>
          Campus<span className={styles.splashAccent}>Hub</span>
        </p>
        <p className={styles.splashNote}>Opening your workspace…</p>
      </div>
    );
  }

  const myClubs = clubsForUser(user, clubs);
  const isMemberView = Boolean(user) && user.role !== "tier1" && myClubs.length > 0;

  if (isMemberView) {
    const homeClubId = myClubs[0].id;
    const manageableClubId = myClubs.find((club) => canManageClub(user, club.id))?.id;

    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<MemberShell myClubs={myClubs} />}>
          <Route path="/" element={<Navigate to={`/workspace/${homeClubId}`} replace />} />
          <Route path="/workspace" element={<Navigate to={`/workspace/${homeClubId}`} replace />} />
          <Route path="/workspace/:clubId" element={<ClubWorkspace />} />
          <Route path="/discover" element={<Home />} />
          <Route path="/clubs/:clubId" element={<ClubProfile />} />
          <Route path="/events/:eventId" element={<EventDetail />} />
          <Route path="/my-events" element={<MyEvents />} />
          <Route path="/dashboard/:clubId" element={<Dashboard />} />
          <Route
            path="/dashboard"
            element={
              <Navigate
                to={manageableClubId ? `/dashboard/${manageableClubId}` : "/discover"}
                replace
              />
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    );
  }

  // Generic view: visitors and members with no club yet.
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<Home />} />
        <Route path="/discover" element={<Home />} />
        <Route path="/clubs/:clubId" element={<ClubProfile />} />
        <Route path="/events/:eventId" element={<EventDetail />} />
        {/* Normally members get the member shell above. When the clubs request
            fails there is no shell to host this page, so keep the route here
            as well; ClubWorkspace can then show its own retry gate instead of
            the URL falling through to NotFound. */}
        <Route
          path="/workspace/:clubId"
          element={user && user.role !== "tier1" ? <ClubWorkspace /> : <Navigate to="/" replace />}
        />
        <Route path="/my-events" element={<MyEvents />} />
        <Route path="/dashboard/:clubId" element={<Dashboard />} />
        <Route path="/dashboard" element={<Navigate to="/dashboard/club-01" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ClubsProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      </ClubsProvider>
    </AuthProvider>
  );
}
