// Server-side feature flags. Flags are read at process start for mounted
// routers; restart the API after changing one.
export function crossUniversityEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.CROSS_UNIVERSITY_ENABLED || "").toLowerCase()
  );
}
