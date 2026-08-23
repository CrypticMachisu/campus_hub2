import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getAllClubs } from "../utils/clubsStore";

const ClubsContext = createContext(null);

export function ClubsProvider({ children }) {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getAllClubs();
      setClubs(result);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <ClubsContext.Provider value={{ clubs, loading, error, refresh }}>
      {children}
    </ClubsContext.Provider>
  );
}

export function useClubs() {
  const ctx = useContext(ClubsContext);
  if (!ctx) throw new Error("useClubs must be used within a ClubsProvider");
  return ctx;
}