import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getAllEvents } from "../utils/eventsStore";
import { useAuth } from "../context/AuthContext";
import { saveSignup, isSignedUp } from "../utils/storage";
import CommentSection from "../components/CommentSection";

export default function EventDetail() {
  const { eventId } = useParams();
  const { user } = useAuth();

  const [event, setEvent] = useState(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      const events = await getAllEvents();
      const found = events.find((e) => e.id === eventId);
      if (cancelled) return;
      setEvent(found || null);
      setEventLoading(false);
    }

    loadEvent();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !event) {
      setAlreadySigned(false);
      return;
    }
    isSignedUp(event.id).then((result) => {
      if (!cancelled) setAlreadySigned(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user, event]);

  if (eventLoading) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <p>Loading event…</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <h2>Event not found.</h2>
      </div>
    );
  }

  const isPast = new Date(event.date) < new Date();

  async function handleSignup() {
    if (!user) return;

    setLoading(true);
    setMessage("");

    await saveSignup({ eventId: event.id });

    setLoading(false);
    setAlreadySigned(true);
    setMessage("✅ Successfully signed up!");
  }

  return (
    <div
      className="container"
      style={{
        paddingTop: "2rem",
        maxWidth: "800px",
      }}
    >
      <img
        src={event.imageUrl}
        alt={event.title}
        style={{
          width: "100%",
          borderRadius: "12px",
          marginBottom: "20px",
        }}
      />

      <h1>{event.title}</h1>

      <p>{event.description}</p>

      <hr />

      <p><strong>Date:</strong> {event.date}</p>
      <p><strong>Time:</strong> {event.time}</p>
      <p><strong>Location:</strong> {event.location}</p>

      <br />

      {!user ? (
        <div>
          <p>Please log in to sign up.</p>
          <Link to="/login">Go to Login</Link>
        </div>
      ) : isPast ? (
        <button disabled>Event has already happened</button>
      ) : alreadySigned ? (
        <button disabled>Already Signed Up</button>
      ) : (
        <button onClick={handleSignup} disabled={loading}>
          {loading ? "Signing Up..." : "Sign Up"}
        </button>
      )}

      {message && (
        <p style={{ marginTop: "1rem", color: "green" }}>
          {message}
        </p>
      )}

      <hr style={{ marginTop: "2rem" }} />
      <CommentSection targetType="event" targetId={event.id} />
    </div>
  );
}
