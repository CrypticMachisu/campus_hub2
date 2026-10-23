import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";
import styles from "./PartnerProduce.module.css";

// Shows live produce from Team 6's AgroConnect API (via our own backend).
export default function PartnerProduce() {
  const [listings, setListings] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error

  useEffect(() => {
    apiFetch("/partner/produce", { auth: false })
      .then((data) => {
        setListings(data);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <section className={styles.panel}>
      <h2>Fresh from AgroConnect</h2>
      <p className={styles.sub}>Live produce listings from our partner team.</p>

      {status === "loading" && <p>Loading partner data…</p>}
      {status === "error" && (
        <p className={styles.error}>Partner data is unavailable right now.</p>
      )}
      {status === "ok" && listings.length === 0 && <p>No produce listed right now.</p>}
      {status === "ok" && listings.length > 0 && (
        <ul className={styles.grid}>
          {listings.map((l) => (
            <li key={l.id} className={styles.card}>
              <h3>{l.title}</h3>
              <p>
                KES {l.price} / {l.unit} · {l.quantity} {l.unit} left
              </p>
              <p className={styles.meta}>
                {l.sellerName} · {l.county}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
