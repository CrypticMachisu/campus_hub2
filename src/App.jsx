import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ClubsProvider } from "./context/ClubsContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Home from "./pages/Home";
import ClubProfile from "./pages/ClubProfile";
import EventDetail from "./pages/EventDetail";
import MyEvents from "./pages/MyEvents";
import Dashboard, { DashboardHome } from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <AuthProvider>
      <ClubsProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Navbar />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<Home />} />
              <Route path="/clubs/:clubId" element={<ClubProfile />} />
              <Route path="/events/:eventId" element={<EventDetail />} />
              <Route path="/my-events" element={<MyEvents />} />
              <Route path="/dashboard/:clubId" element={<Dashboard />} />
              {/* Resolves the plain /dashboard URL per role: logged out → login,
                  tier1 → platform default, tier2 → their first managed club. */}
              <Route path="/dashboard" element={<DashboardHome />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Footer />
          </ErrorBoundary>
        </BrowserRouter>
      </ClubsProvider>
    </AuthProvider>
  );
}
