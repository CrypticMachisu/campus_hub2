import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import { SkeletonGroup, PartnerSkeletonCard } from "./Skeleton";
import styles from "./PartnerProduce.module.css";

// Farmer directory from Team 6's AgroConnect API (via our own backend).
// Week 11 (Part D): the backend answers { data, stale, asOf }. When
// stale is true we show the last saved copy WITH a banner saying when it
// was saved — a fallback the user cannot mistake for live data.
export default function PartnerFarmers() {
  const [farmers, setFarmers] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [stale, setStale] = useState(null); // { asOf } only when serving saved data

  useEffect(() => {
    apiFetch("/partner/farmers", { auth: false })
      .then((payload) => {
        setFarmers(payload.data);
        setStale(payload.stale ? { asOf: payload.asOf } : null);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <section className={styles.panel}>
      <h2>Farmers on AgroConnect</h2>
      <p className={styles.sub}>Live directory from our partner team.</p>

      {stale && (
        <p className={styles.staleBanner}>
          Showing saved data from {new Date(stale.asOf).toLocaleTimeString()}. The partner is not
          responding.
        </p>
      )}
      {status === "loading" && (
        <SkeletonGroup label="Loading partner data…">
          <div className={styles.grid}>
            {Array.from({ length: 4 }, (_, i) => (
              <PartnerSkeletonCard key={i} />
            ))}
          </div>
        </SkeletonGroup>
      )}
      {status === "error" && <p className={styles.error}>Partner data is unavailable right now.</p>}
      {status === "ok" && farmers.length === 0 && <p>No farmers listed right now.</p>}
      {status === "ok" && farmers.length > 0 && (
        <ul className={styles.grid}>
          {farmers.map((f) => (
            <li key={f.id} className={styles.card}>
              <h3>{f.fullName}</h3>
              <p>{f.focus}</p>
              <p className={styles.meta}>{f.county}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
