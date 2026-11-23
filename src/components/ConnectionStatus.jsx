import { useEffect, useState } from "react";
import styles from "./ConnectionStatus.module.css";

/**
 * A quiet, in-flow connection note. It never floats over the page: when the
 * browser goes offline the strip takes its own line, so header actions and
 * page content stay reachable. After reconnecting it confirms recovery for a
 * moment, then removes itself.
 */
export default function ConnectionStatus() {
  const [state, setState] = useState(() =>
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online"
  );

  useEffect(() => {
    let confirmationTimer;

    function handleOffline() {
      window.clearTimeout(confirmationTimer);
      setState("offline");
    }

    function handleOnline() {
      window.clearTimeout(confirmationTimer);
      setState("restored");
      confirmationTimer = window.setTimeout(() => setState("online"), 3200);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(confirmationTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (state === "online") return null;

  const restored = state === "restored";

  return (
    <div className={styles.strip} data-state={state} role="status" aria-live="polite">
      <p className={styles.inner}>
        <span className={styles.dot} aria-hidden="true" />
        {restored ? "Back online · connection restored" : "Offline · changes may not save"}
      </p>
    </div>
  );
}
