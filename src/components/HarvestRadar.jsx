import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getToken } from "../utils/api";
import { SkeletonGroup, PartnerSkeletonCard } from "./Skeleton";
import styles from "./HarvestRadar.module.css";

const DAY_MS = 24 * 60 * 60 * 1000;

// AgroConnect timestamps look like "2026-08-24 17:30:00" (no ISO T, no
// timezone), which some browsers refuse to parse directly. Normalize the
// separator and treat an unparseable date as "no arrival date".
function parseArrival(value) {
  if (!value) return null;
  const ms = Date.parse(String(value).trim().replace(" ", "T"));
  return Number.isNaN(ms) ? null : ms;
}

// One human line per listing: ready now / tomorrow / in N days / on the
// market already. Computed from the current time, re-derived each render.
function arrivalText(arrival, now, todayStart) {
  if (arrival == null) return "check with the seller";
  if (arrival < now) return arrival >= todayStart ? "ready today" : "on the market";
  const days = Math.ceil((arrival - now) / DAY_MS);
  return days <= 1 ? "ready tomorrow" : `arriving in ${days} days`;
}

/**
 * Harvest Radar — turns the raw produce list from Team 6's AgroConnect API
 * (proxied through OUR backend, which holds the partner key) into a
 * time-aware board for Agri club members: what is ready right now, what is
 * arriving over the next 7 days and what is further out — filterable by
 * county.
 *
 * Harvest Watch builds on it: a logged-in member can pin a listing, which
 * our MySQL database keeps even when the partner feed rotates or is down.
 * Reading partner data is unaffected by whether anyone is logged in.
 *
 * Fails independently of every other panel: a cold partner start shows
 * skeletons, a dead partner shows a friendly card with a Retry button.
 */
export default function HarvestRadar() {
  const [listings, setListings] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [bucketFilter, setBucketFilter] = useState("ready");
  const [countyFilter, setCountyFilter] = useState("");

  const [watch, setWatch] = useState([]);
  const [watchBusy, setWatchBusy] = useState(""); // listingId currently being saved/removed
  const [watchError, setWatchError] = useState("");
  const loggedIn = Boolean(getToken());

  // One loader for both the first fetch and the Retry button; `isActive`
  // lets the mount effect ignore a response that arrives after unmount.
  const load = useCallback(async (isActive = () => true) => {
    setStatus("loading");
    try {
      const data = await apiFetch("/partner/produce", { auth: false });
      if (!isActive()) return;
      setListings(Array.isArray(data) ? data : []);
      setStatus("ok");
    } catch {
      if (!isActive()) return;
      setListings(null);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  // My saved listings live in OUR database; a failed load must not hide the
  // partner feed, so it only clears the watch panel.
  useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    apiFetch("/harvest-watch")
      .then((data) => {
        if (!cancelled) setWatch(Array.isArray(data?.watch) ? data.watch : []);
      })
      .catch(() => {
        if (!cancelled) setWatch([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // Bucketing, sorting and county chips are derived in one pass per
  // dataset / filter change, so the JSX below stays dumb.
  const view = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStart = startOfToday.getTime();
    const weekStart = todayStart + DAY_MS; // anything from tomorrow…
    const weekEnd = weekStart + 7 * DAY_MS; // …up to 7 days out

    const rows = (listings ?? []).map((listing) => ({
      listing,
      arrival: parseArrival(listing.availableFrom),
    }));
    const byDateThenPrice = (a, b) =>
      (a.arrival ?? Infinity) - (b.arrival ?? Infinity) || a.listing.price - b.listing.price;

    const buckets = {
      ready: rows.filter((r) => r.arrival !== null && r.arrival < weekStart).sort(byDateThenPrice),
      week: rows
        .filter((r) => r.arrival !== null && r.arrival >= weekStart && r.arrival < weekEnd)
        .sort(byDateThenPrice),
      later: rows.filter((r) => r.arrival === null || r.arrival >= weekEnd).sort(byDateThenPrice),
    };
    const counties = [...new Set(rows.map((r) => r.listing.county).filter(Boolean))].sort();

    return { buckets, counties, now, todayStart };
  }, [listings]);

  const watchedIds = useMemo(() => new Set(watch.map((item) => item.listingId)), [watch]);

  async function toggleWatch(listing) {
    const id = String(listing.id ?? "");
    if (!id || watchBusy) return;
    setWatchBusy(id);
    setWatchError("");
    try {
      if (watchedIds.has(id)) {
        await apiFetch(`/harvest-watch/${encodeURIComponent(id)}`, { method: "DELETE" });
        setWatch((current) => current.filter((item) => item.listingId !== id));
      } else {
        const data = await apiFetch("/harvest-watch", {
          method: "POST",
          body: {
            listingId: id,
            title: listing.title,
            seller: listing.sellerName,
            county: listing.county,
            price: listing.price,
            unit: listing.unit,
            quantity: listing.quantity,
            availableFrom: listing.availableFrom,
          },
        });
        if (data?.watch) setWatch((current) => [data.watch, ...current]);
      }
    } catch (error) {
      setWatchError(error.message || "Could not update your watch list.");
    } finally {
      setWatchBusy("");
    }
  }

  const labels = { ready: "Ready now", week: "Next 7 days", later: "Later" };
  const active = view.buckets[bucketFilter] ?? [];
  const shown = countyFilter ? active.filter((r) => r.listing.county === countyFilter) : active;

  return (
    <section
      aria-label="Harvest Radar — producer listings arriving on AgroConnect"
      className={styles.radar}
    >
      <h2>Harvest Radar</h2>
      <p className={styles.intro}>
        Producer listings from AgroConnect arranged by when they reach the market — so club members
        can buy from our partner growers at exactly the right moment.
      </p>

      {status === "loading" && (
        <SkeletonGroup label="Loading the market feed…">
          <div className={styles.board}>
            {Array.from({ length: 3 }, (_, i) => (
              <PartnerSkeletonCard key={i} />
            ))}
          </div>
        </SkeletonGroup>
      )}

      {status === "error" && (
        <div className={styles.radarCard}>
          <p className={styles.error}>
            The AgroConnect market feed is unavailable right now — club events below work without
            it.
          </p>
          <button type="button" className={styles.retry} onClick={load}>
            Retry the feed
          </button>
        </div>
      )}

      {status === "ok" && listings.length === 0 && (
        <p className={styles.empty}>
          No producer listings on AgroConnect yet — check back once the market fills up.
        </p>
      )}

      {status === "ok" && listings.length > 0 && (
        <>
          {/* Harvest Watch: what this member pinned, kept in our own database */}
          <div className={styles.watchPanel} aria-label="Your harvest watch">
            <p className={styles.watchHead}>
              <strong>Your harvest watch</strong>{" "}
              {watch.length === 0
                ? "— pin a listing below and we'll keep its details, even when the feed is down."
                : `— ${watch.length} listing${watch.length === 1 ? "" : "s"} saved.`}
            </p>
            {!loggedIn && (
              <p className={styles.watchNote}>
                Log in to keep producer listings under your own account.
              </p>
            )}
            {watchError && <p className={styles.error}>{watchError}</p>}
            {watch.length > 0 && (
              <ul className={styles.watchList}>
                {watch.map((item) => (
                  <li key={item.listingId} className={styles.watchItem}>
                    <span>
                      <strong>{item.title}</strong>
                      {item.county ? ` · ${item.county}` : ""} ·{" "}
                      {arrivalText(parseArrival(item.availableFrom), view.now, view.todayStart)}
                    </span>
                    <button
                      type="button"
                      className={`${styles.watchBtn} ${styles.watchOn}`}
                      onClick={() => toggleWatch({ id: item.listingId, ...item })}
                      disabled={watchBusy === item.listingId}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Arrival-window tabs; the count shows how much each window holds */}
          <ul className={styles.tabs} aria-label="Arrival windows">
            {Object.entries(labels).map(([key, label]) => (
              <li key={key}>
                <button
                  type="button"
                  className={`${styles.tab} ${bucketFilter === key ? styles.tabActive : ""}`}
                  aria-pressed={bucketFilter === key}
                  onClick={() => setBucketFilter(key)}
                >
                  {label}
                  <span className={styles.count}>{view.buckets[key].length}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* County chips derived from the data itself */}
          <div className={styles.chips}>
            <button
              type="button"
              className={`${styles.chip} ${countyFilter === "" ? styles.chipActive : ""}`}
              aria-pressed={countyFilter === ""}
              onClick={() => setCountyFilter("")}
            >
              All counties
            </button>
            {view.counties.map((county) => (
              <button
                key={county}
                type="button"
                className={`${styles.chip} ${countyFilter === county ? styles.chipActive : ""}`}
                aria-pressed={countyFilter === county}
                onClick={() => setCountyFilter(county)}
              >
                {county}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className={styles.empty}>
              Nothing {labels[bucketFilter].toLowerCase()}
              {countyFilter ? ` in ${countyFilter}` : ""} — try another window or county.
            </p>
          ) : (
            <ul className={styles.board}>
              {shown.map(({ listing, arrival }) => {
                const id = String(listing.id ?? "");
                const saved = watchedIds.has(id);
                return (
                  <li
                    key={id || `${listing.title}-${listing.sellerName}`}
                    className={styles.radarCard}
                  >
                    <h3>{listing.title}</h3>
                    <p>
                      KES {listing.price}&nbsp;/&nbsp;{listing.unit}
                    </p>
                    <p>
                      <strong>{listing.quantity ?? "?"}</strong> {listing.unit} ·{" "}
                      <span className={styles.seller}>{listing.sellerName}</span>
                    </p>
                    <p className={styles.meta}>
                      {listing.county} · {arrivalText(arrival, view.now, view.todayStart)}
                    </p>
                    {loggedIn && id && (
                      <button
                        type="button"
                        className={`${styles.watchBtn} ${saved ? styles.watchOn : ""}`}
                        aria-pressed={saved}
                        disabled={watchBusy === id}
                        onClick={() => toggleWatch(listing)}
                      >
                        {saved ? "Watching" : "Watch"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
