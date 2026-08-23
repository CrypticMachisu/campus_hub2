import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import Dashboard from "./pages/Dashboard";
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
              <Route path="/dashboard" element={<Navigate to="/dashboard/club-01" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Footer />
          </ErrorBoundary>
        </BrowserRouter>
      </ClubsProvider>
    </AuthProvider>
  );
}
