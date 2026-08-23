import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { getAllEvents } from "../utils/eventsStore";
import { getSignups, deleteSignup } from "../utils/storage";

export default function MyEvents() {
  const { user } = useAuth();

  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadEvents() {
      setLoading(true);

      // v4: no more pruneOrphanedSignups() call — signups.event_id has
      // ON DELETE CASCADE in the MySQL schema, so a deleted custom event
      // takes its signups with it automatically. getSignups() can never
      // return a signup whose event no longer exists.
      const [allEvents, userSignups] = await Promise.all([getAllEvents(), getSignups()]);
      if (cancelled) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const joinedEvents = userSignups
        .map((signup) => {
          const event = allEvents.find((e) => e.id === signup.eventId);
          if (!event) return null;
          return { ...event, signupId: signup.id };
        })
        .filter(Boolean)
        .filter((event) => {
          const eventDate = new Date(event.date);
          return eventDate >= today;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setMyEvents(joinedEvents);
      setLoading(false);
    }

    loadEvents();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleCancel(signupId) {
    // Optimistic UI
    setMyEvents((current) => current.filter((event) => event.signupId !== signupId));
    await deleteSignup(signupId);
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

      {loading ? (
        <p>Loading your events…</p>
      ) : myEvents.length === 0 ? (
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

            <button onClick={() => handleCancel(event.signupId)}>Cancel Signup</button>
          </div>
        ))
      )}
    </div>
  );
}
