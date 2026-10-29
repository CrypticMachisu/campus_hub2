import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import { SkeletonGroup, PartnerSkeletonCard } from "./Skeleton";
import styles from "./PartnerProduce.module.css";

// Farmer directory from Team 6's AgroConnect API (via our own backend).
export default function PartnerFarmers() {
  const [farmers, setFarmers] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error

  useEffect(() => {
    apiFetch("/partner/farmers", { auth: false })
      .then((data) => {
        setFarmers(data);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <section className={styles.panel}>
      <h2>Farmers on AgroConnect</h2>
      <p className={styles.sub}>Live directory from our partner team.</p>

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
