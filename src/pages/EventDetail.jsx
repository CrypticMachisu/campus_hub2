import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getAllEvents } from "../utils/eventsStore";
import { getCurrentUser } from "../utils/authStore";
import { saveSignup, isSignedUp } from "../utils/storage";

export default function EventDetail() {
  const { eventId } = useParams();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const user = getCurrentUser();

  useEffect(() => {
    function loadEvent() {
      const events = getAllEvents();
      const found = events.find((e) => e.id === eventId);
      setEvent(found || null);
    }

    loadEvent();

    window.addEventListener("campushub:events-updated", loadEvent);

    return () => {
      window.removeEventListener("campushub:events-updated", loadEvent);
    };
  }, [eventId]);

  if (!event) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <h2>Event not found.</h2>
      </div>
    );
  }

  const alreadySigned = user && isSignedUp(event.id, user.id);
  const isPast = new Date(event.date) < new Date();

  async function handleSignup() {
    if (!user) return;

    setLoading(true);
    setMessage("");

    await new Promise((resolve) => setTimeout(resolve, 500));

    saveSignup({
      eventId: event.id,
      userId: user.id,
    });

    setLoading(false);
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

      {/* CommentSection will be added once your teammate finishes it */}
    </div>
  );
}
