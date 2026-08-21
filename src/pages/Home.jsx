import { useState, useEffect } from "react";
import { clubs, CATEGORIES } from "../data/mockData";
import { getAllEvents } from "../utils/eventsStore";
import ClubCard from "../components/ClubCard";
import EventCard from "../components/EventCard";
import styles from "./Home.module.css";

/**
 * Custom hook to debounce fast-changing state values.
 * Prevents unnecessary re-filtering on rapid keystrokes.
 */
function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default function Home() {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("clubs");

  // Rule 2: 300ms input debouncing execution
  const debouncedSearch = useDebounce(search, 300);

  // Filter Clubs: Matches category, name, tags, and expanded description parameter
  const filteredClubs = clubs.filter((club) => {
    const matchesCategory = category === "All" || club.category === category;
    const searchLower = debouncedSearch.toLowerCase();
    
    const matchesSearch =
      club.name.toLowerCase().includes(searchLower) ||
      club.description.toLowerCase().includes(searchLower) || // Rule 2: Expanded search
      club.tags.some((tag) => tag.toLowerCase().includes(searchLower));

    return matchesCategory && matchesSearch;
  });

  // Filter and Sort Events: Uses precise dynamic timestamp parsing
  const upcomingEvents = getAllEvents()
    .filter((event) => {
      const matchesCategory = category === "All" || event.category === category;
      const searchLower = debouncedSearch.toLowerCase();
      
      const matchesSearch =
        event.title.toLowerCase().includes(searchLower) ||
        event.tags?.some((tag) => tag.toLowerCase().includes(searchLower));

      return matchesCategory && matchesSearch;
    })
    // Rule 2: Explicit timestamp sorting fallback mechanism
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>CampusHub Discovery</h1>
        <p>Find your community and upcoming campus events</p>
      </header>

      {/* Inputs and Control Center */}
      <section className={styles.controls}>
        <input
          type="text"
          placeholder="Search by name, description, or tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />

        <div className={styles.filterGroup}>
          <button
            onClick={() => setCategory("All")}
            className={category === "All" ? styles.activeFilter : styles.filterBtn}
          >
            All Categories
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={category === cat ? styles.activeFilter : styles.filterBtn}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className={styles.toggleGroup}>
          <button 
            onClick={() => setViewMode("clubs")} 
            className={viewMode === "clubs" ? styles.activeToggle : styles.toggleBtn}
          >
            Browse Clubs
          </button>
          <button 
            onClick={() => setViewMode("events")} 
            className={viewMode === "events" ? styles.activeToggle : styles.toggleBtn}
          >
            Browse Events
          </button>
        </div>
      </section>

      {/* Main Layout Content Grids */}
      <main className={styles.content}>
        {viewMode === "clubs" ? (
          <div className={styles.grid}>
            {filteredClubs.length > 0 ? (
              filteredClubs.map((club) => (
                <ClubCard key={club.id} club={club} />
              ))
            ) : (
              /* Rule 2: Dedicated empty state UI component */
              <div className={styles.emptyStateBox}>
                <h3>No Clubs Found</h3>
                <p>We couldn't find any clubs matching "{debouncedSearch}". Try modifying your parameters.</p>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {upcomingEvents.length > 0 ? (
              upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))
            ) : (
              /* Rule 2: Dedicated empty state UI component */
              <div className={styles.emptyStateBox}>
                <h3>No Upcoming Events Found</h3>
                <p>No results match your search keywords under this tab category.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
