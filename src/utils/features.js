// Keep this in step with the API's CROSS_UNIVERSITY_ENABLED flag. The client
// flag only controls whether the Phase 5 entry points are rendered; the server
// flag is the authorization boundary.
export const CROSS_UNIVERSITY_ENABLED =
  String(import.meta.env.VITE_CROSS_UNIVERSITY_ENABLED || "").toLowerCase() === "true";
