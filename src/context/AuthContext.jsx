// Wraps authStore.js's API calls in a React Context so components
// re-render on login/logout instantly.
//
// v4: authStore's functions are now async (real network calls against
// the Express/MySQL API instead of synchronous localStorage reads), so
// the initial user has to be loaded in an effect rather than a useState
// initializer — hence the `loading` flag, which callers can use to avoid
// flashing a "logged out" state while the token is still being checked.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getCurrentUser,
  login as storeLogin,
  logout as storeLogout,
  signup as storeSignup,
} from "../utils/authStore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const current = await getCurrentUser();
    setUser(current);
    return current;
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  /** Returns the user on success, or null on bad credentials. */
  async function login(credentials) {
    const loggedInUser = await storeLogin(credentials);
    if (loggedInUser) setUser(loggedInUser);
    return loggedInUser;
  }

  function logout() {
    storeLogout();
    setUser(null);
    // Peer review: "Logout Cleanup" — force a hard reload rather than a
    // client-side navigate, so no component's local state (draft
    // comments, open forms, cached lists) survives as ghost data.
    window.location.href = "/";
  }

  /**
   * Create a new member account and log in as them immediately.
   * Returns { user, error } — user is null and error is a readable
   * message if signup failed.
   */
  async function signup(fields) {
    const result = await storeSignup(fields);
    if (result.user) setUser(result.user);
    return result;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
