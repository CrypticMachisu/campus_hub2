import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { getAllEvents } from "../utils/eventsStore";
import {
  getSignups,
  deleteSignup,
  pruneOrphanedSignups,
} from "../utils/storage";

export default function MyEvents() {
  const { user } = useAuth();

  const [myEvents, setMyEvents] = useState([]);

  useEffect(() => {
    if (!user) return;

    function loadEvents() {
      const allEvents = getAllEvents();

      // Remove signups whose events no longer exist
      const validSignups = pruneOrphanedSignups(allEvents);

      const userSignups = validSignups.filter(
        (signup) => signup.userId === user.id
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const joinedEvents = userSignups
        .map((signup) => {
          const event = allEvents.find(
            (e) => e.id === signup.eventId
          );

          if (!event) return null;

          return {
            ...event,
            signupId: signup.id,
          };
        })
        .filter(Boolean)
        .filter((event) => {
          const eventDate = new Date(event.date);
          return eventDate >= today;
        })
        .sort(
          (a, b) =>
            new Date(a.date).getTime() -
            new Date(b.date).getTime()
        );

      setMyEvents(joinedEvents);
    }

    loadEvents();

    window.addEventListener(
      "campushub:events-updated",
      loadEvents
    );

    return () =>
      window.removeEventListener(
        "campushub:events-updated",
        loadEvents
      );
  }, [user]);

  function handleCancel(signupId) {
    // Optimistic UI
    setMyEvents((current) =>
      current.filter((event) => event.signupId !== signupId)
    );

    deleteSignup(signupId);
  }

  if (!user) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <h1>My Events</h1>
        <p>Please log in to view your events.</p>
        <Link to="/login">Go to Login</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: "2rem" }}>
      <h1>My Events</h1>

      {myEvents.length === 0 ? (
        <p>You haven't signed up for any upcoming events.</p>
      ) : (
        myEvents.map((event) => (
          <div
            key={event.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "16px",
              marginBottom: "20px",
            }}
          >
            <h2>{event.title}</h2>

            <p>{event.description}</p>

            <p>
              <strong>Date:</strong> {event.date}
            </p>

            <p>
              <strong>Time:</strong> {event.time}
            </p>

            <p>
              <strong>Location:</strong> {event.location}
            </p>

            <button
              onClick={() =>
                handleCancel(event.signupId)
              }
            >
              Cancel Signup
            </button>
          </div>
        ))
      )}
    </div>
  );
}