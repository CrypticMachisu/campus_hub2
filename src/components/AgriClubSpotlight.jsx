import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { SkeletonGroup, PartnerSkeletonCard } from "./Skeleton";
import styles from "./AgriClubSpotlight.module.css";

// The club row created by server/migrations/004_add_agriculture_club.sql.
export const AGRI_CLUB_ID = "club-07";

/**
 * Recruitment + marketing block for the Agri club. It shows live data from
 * Team 6's AgroConnect API (fetched through OUR backend, which holds the
 * partner key) to show students what AgroConnect is and why to join.
 * Each feed fails on its own: if the partner is down the pitch and the
 * sign-up button still work.
 */
export default function AgriClubSpotlight() {
  const { user } = useAuth();
  const [farmers, setFarmers] = useState([]);
  const [listings, setListings] = useState([]);
  const [status, setStatus] = useState({ farmers: "loading", listings: "loading" });

  useEffect(() => {
    let cancelled = false;
    apiFetch("/partner/farmers", { auth: false })
      .then((data) => {
        if (cancelled) return;
        setFarmers(data);
        setStatus((s) => ({ ...s, farmers: "ok" }));
      })
      .catch(() => !cancelled && setStatus((s) => ({ ...s, farmers: "error" })));

    apiFetch("/partner/produce", { auth: false })
      .then((data) => {
        if (cancelled) return;
        setListings(data);
        setStatus((s) => ({ ...s, listings: "ok" }));
      })
      .catch(() => !cancelled && setStatus((s) => ({ ...s, listings: "error" })));

    return () => {
      cancelled = true;
    };
  }, []);

  const loading = status.farmers === "loading" || status.listings === "loading";
  const bothDown = status.farmers === "error" && status.listings === "error";
  const counties = new Set(
    [...farmers, ...listings].map((x) => x.county).filter(Boolean)
  );

  return (
    <section className={styles.spotlight}>
      <div className={styles.pitch}>
        <h2>Grow with us — and with AgroConnect</h2>
        <p>
          AgroConnect is a marketplace where Kenyan farmers list their produce and buyers find
          them. The Agri-Business &amp; Farming Club works with it directly: we study real
          listings, meet the growers and build skills in farming and agri-business. New members
          are welcome, whatever your course.
        </p>
        <div className={styles.cta}>
          <a href="#events" className={styles.primary}>
            See our next event &amp; sign up
          </a>
          {!user && (
            <Link to="/login" className={styles.secondary}>
              Log in to join
            </Link>
          )}
        </div>
      </div>

      {/* Live numbers: only shown when the partner answered */}
      {status.farmers === "ok" && status.listings === "ok" && (
        <ul className={styles.stats} aria-label="AgroConnect right now">
          <li>
            <strong>{farmers.length}</strong> farmers
          </li>
          <li>
            <strong>{listings.length}</strong> produce listings
          </li>
          <li>
            <strong>{counties.size}</strong> counties
          </li>
        </ul>
      )}

      {loading && (
        <SkeletonGroup label="Loading AgroConnect data…">
          <div className={styles.grid}>
            {Array.from({ length: 3 }, (_, i) => (
              <PartnerSkeletonCard key={i} />
            ))}
          </div>
        </SkeletonGroup>
      )}

      {bothDown && (
        <p className={styles.error}>
          AgroConnect data is unavailable right now — our events and sign-up still work below.
        </p>
      )}

      {status.farmers === "ok" && farmers.length > 0 && (
        <>
          <h3>Meet the growers</h3>
          <ul className={styles.grid}>
            {farmers.slice(0, 6).map((f) => (
              <li key={f.id} className={styles.card}>
                <h4>{f.fullName}</h4>
                <p>{f.focus}</p>
                <p className={styles.meta}>{f.county}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {status.listings === "ok" && listings.length > 0 && (
        <>
          <h3>Fresh on AgroConnect right now</h3>
          <ul className={styles.grid}>
            {listings.slice(0, 6).map((l) => (
              <li key={l.id} className={styles.card}>
                <h4>{l.title}</h4>
                <p>
                  KES {l.price} / {l.unit}
                </p>
                <p className={styles.meta}>
                  {l.sellerName} · {l.county}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
