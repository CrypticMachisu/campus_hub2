// Prints the log label of every key in API_KEYS, WITHOUT printing the keys.
// The label matches the "caller" field written by monitoring.js:
// "key-" + the first 6 hex characters of the key's SHA-256.
import "dotenv/config";
import crypto from "crypto";

const keys = (process.env.API_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
if (keys.length === 0) {
  console.error("No API_KEYS found. Run this from the server folder with server/.env present.");
  process.exit(1);
}
keys.forEach((k, i) => {
  const label = "key-" + crypto.createHash("sha256").update(k).digest("hex").slice(0, 6);
  console.log(`#${i + 1}  ${label}`);
});
