import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import { useAuth } from "../context/AuthContext";

const emptyForm = {
  title: "",
  description: "",
  activity_type: "Farm Visit",
  location: "",
  event_date: "",
  event_time: "",
  capacity: "",
};

export default function AgroOpportunities() {
  const { user } = useAuth();

  const [opportunities, setOpportunities] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busyId, setBusyId] = useState(null);

  const canCreate =
    user?.role === "tier1" || (user?.role === "tier2" && user?.adminForClubs?.includes("club-07"));

  // Load all opportunities and the current user's registrations.
  async function loadOpportunities() {
    try {
      const data = await apiFetch("/agro-opportunities", {
        auth: false,
      });

      setOpportunities(Array.isArray(data) ? data : []);

      if (user) {
        const mine = await apiFetch("/agro-opportunities/mine");
        setMyRegistrations(Array.isArray(mine) ? mine : []);
      } else {
        setMyRegistrations([]);
      }
    } catch (error) {
      setMessage(error.message || "Could not load opportunities.");
    } finally {
      setLoading(false);
    }
  }

  // Check whether the current user has registered.
  function isRegistered(opportunityId) {
    return myRegistrations.some((registration) => registration.opportunity_id === opportunityId);
  }

  // Create a new opportunity.
  async function createOpportunity(event) {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    try {
      await apiFetch("/agro-opportunities", {
        method: "POST",
        body: {
          ...form,
          capacity: form.capacity ? Number(form.capacity) : null,
        },
      });

      setMessage("Opportunity published successfully!");
      setForm(emptyForm);

      await loadOpportunities();
    } catch (error) {
      setMessage(error.message || "Could not publish opportunity.");
    } finally {
      setSaving(false);
    }
  }

  // Register for an opportunity.
  async function register(id) {
    if (!user) {
      setMessage("Please log in to register.");
      return;
    }

    if (isRegistered(id)) {
      setMessage("You are already registered for this opportunity.");
      return;
    }

    setBusyId(id);
    setMessage("");

    try {
      await apiFetch(`/agro-opportunities/${id}/register`, {
        method: "POST",
      });

      setMessage("Registration successful!");
      await loadOpportunities();
    } catch (error) {
      setMessage(error.message || "Could not register.");
    } finally {
      setBusyId(null);
    }
  }

  // Cancel an existing registration.
  async function unregister(id) {
    setBusyId(id);
    setMessage("");

    try {
      await apiFetch(`/agro-opportunities/${id}/register`, {
        method: "DELETE",
      });

      setMessage("Registration cancelled successfully!");
      await loadOpportunities();
    } catch (error) {
      setMessage(error.message || "Could not cancel registration.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    loadOpportunities();
  }, [user?.id]);

  if (loading) {
    return <p>Loading opportunities...</p>;
  }

  return (
    <section className="agro-opportunities">
      <h2>AgroConnect Opportunities</h2>

      <p>Discover farming activities, workshops and volunteering opportunities.</p>

      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}

      {/* Create opportunity */}
      {canCreate && (
        <div className="create-opportunity">
          <h3>Create an Opportunity</h3>

          <form onSubmit={createOpportunity}>
            <label>
              Title
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <label>
              Activity Type
              <select
                value={form.activity_type}
                onChange={(e) => setForm({ ...form, activity_type: e.target.value })}
              >
                <option>Farm Visit</option>
                <option>Tree Planting</option>
                <option>Harvesting</option>
                <option>Workshop</option>
                <option>Volunteering</option>
              </select>
            </label>

            <label>
              Location
              <input
                required
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>

            <label>
              Date
              <input
                type="date"
                required
                min={new Date().toLocaleDateString("en-CA")}
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              />
            </label>

            <label>
              Time
              <input
                type="time"
                value={form.event_time}
                onChange={(e) => setForm({ ...form, event_time: e.target.value })}
              />
            </label>

            <label>
              Capacity (leave empty for unlimited)
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving ? "Publishing..." : "Publish Opportunity"}
            </button>
          </form>
        </div>
      )}

      {/* My registrations */}
      {user && (
        <div className="my-opportunities">
          <h3>My Registered Opportunities</h3>

          {myRegistrations.length === 0 ? (
            <p>You haven't registered for any opportunities yet.</p>
          ) : (
            <ul>
              {myRegistrations.map((registration) => (
                <li key={registration.id || registration.signup_id}>
                  {registration.title || registration.opportunity_id}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Available opportunities */}
      <div className="opportunities-list">
        <h3>Available Opportunities</h3>

        {opportunities.length === 0 ? (
          <p>No opportunities available yet. Check back soon!</p>
        ) : (
          opportunities.map((item) => {
            const registered = isRegistered(item.opportunity_id);
            const full = item.capacity != null && item.signup_count >= item.capacity;

            const unavailable = item.status !== "open" || full;

            return (
              <article key={item.opportunity_id} className="opportunity-card">
                <h3>{item.title}</h3>

                <p>{item.description}</p>

                <p>
                  <strong>Activity:</strong> {item.activity_type}
                </p>

                <p>
                  <strong>Location:</strong> {item.location}
                </p>

                <p>
                  <strong>Date:</strong> {new Date(item.event_date).toLocaleDateString()}
                </p>

                {item.event_time && (
                  <p>
                    <strong>Time:</strong> {item.event_time}
                  </p>
                )}

                <p>
                  <strong>Places:</strong>{" "}
                  {item.capacity == null
                    ? `${item.signup_count} registered · Unlimited`
                    : `${item.signup_count}/${item.capacity}`}
                </p>

                {registered ? (
                  <button
                    type="button"
                    onClick={() => unregister(item.opportunity_id)}
                    disabled={busyId === item.opportunity_id}
                  >
                    {busyId === item.opportunity_id ? "Please wait..." : "Unregister"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => register(item.opportunity_id)}
                    disabled={!user || unavailable || busyId === item.opportunity_id}
                  >
                    {busyId === item.opportunity_id
                      ? "Please wait..."
                      : !user
                        ? "Log in to register"
                        : full
                          ? "Fully booked"
                          : item.status !== "open"
                            ? "Unavailable"
                            : "Register"}
                  </button>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
