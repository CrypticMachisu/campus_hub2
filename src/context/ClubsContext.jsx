import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { getAllClubs } from "../utils/clubsStore";

const ClubsContext = createContext(null);

export function ClubsProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getAllClubs();
      setClubs(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // The list is campus-scoped, so it must reload when the session changes
  // (sign in, sign out, or a promotion that changes the reader's view).
  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh, authLoading, user?.id]);

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
