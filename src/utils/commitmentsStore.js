import { apiFetch } from "./api";

/** Activity kinds, mirrored from server/routes/commitments.js. */
export const COMMITMENT_KINDS = [
  { id: "farm_visit", label: "Farm visit" },
  { id: "tree_planting", label: "Tree planting" },
  { id: "harvest", label: "Harvest" },
  { id: "volunteering", label: "Volunteering" },
  { id: "meeting", label: "Meeting" },
  { id: "workshop", label: "Workshop" },
  { id: "activity", label: "Activity" },
];

export function kindLabel(kind) {
  return COMMITMENT_KINDS.find((entry) => entry.id === kind)?.label || "Activity";
}

/**
 * v2 sends one ISO `startsAt`; the UI works with the app's date + time pair.
 * Split it once here, exactly like toUiEvent, so no browser timezone can move
 * the activity to another day.
 */
export function toUiCommitment(commitment) {
  if (!commitment || !commitment.startsAt) return commitment;
  const { startsAt, ...rest } = commitment;
  const [date, clock = "00:00"] = startsAt.split("T");
  return { ...rest, date, time: clock.slice(0, 5) };
}

/** Upcoming commitments, optionally for one club. Publicly readable. */
export async function getCommitments({ clubId, includePast = false } = {}) {
  const params = new URLSearchParams();
  if (clubId) params.set("clubId", clubId);
  if (includePast) params.set("upcoming", "0");
  const query = params.toString();
  const data = await apiFetch(`/commitments${query ? `?${query}` : ""}`);
  return (data.commitments || []).map(toUiCommitment);
}

/** The signed-in member's commitments, each with its own waitlist position. */
export async function getMyCommitments() {
  const { commitments } = await apiFetch("/commitments/mine");
  return commitments.map(toUiCommitment);
}

/** One commitment plus the reader's signup, if any. */
export async function getCommitment(commitmentId) {
  const data = await apiFetch(`/commitments/${encodeURIComponent(commitmentId)}`);
  return {
    commitment: toUiCommitment(data.commitment),
    signup: data.signup,
  };
}

/** Club managers only (server-checked). */
export async function createCommitment(payload) {
  const { commitment } = await apiFetch("/commitments", { method: "POST", body: payload });
  return toUiCommitment(commitment);
}

export async function deleteCommitment(commitmentId) {
  await apiFetch(`/commitments/${encodeURIComponent(commitmentId)}`, { method: "DELETE" });
}

/** Idempotent: committing twice returns the existing signup. */
export async function commitToCommitment(commitmentId) {
  return apiFetch(`/commitments/${encodeURIComponent(commitmentId)}/signup`, { method: "POST" });
}

export async function withdrawCommitment(commitmentId) {
  return apiFetch(`/commitments/${encodeURIComponent(commitmentId)}/signup`, {
    method: "DELETE",
  });
}

/**
 * Club managers only: edit any of the notice fields. Send only what changed;
 * capacity is null or "" for no limit.
 */
export async function updateCommitment(commitmentId, payload) {
  const { commitment } = await apiFetch(`/commitments/${encodeURIComponent(commitmentId)}`, {
    method: "PATCH",
    body: payload,
  });
  return toUiCommitment(commitment);
}

/** Club managers only: change the seat count (null or "" = no limit). */
export async function updateCommitmentCapacity(commitmentId, capacity) {
  const { commitment } = await apiFetch(`/commitments/${encodeURIComponent(commitmentId)}`, {
    method: "PATCH",
    body: { capacity },
  });
  return toUiCommitment(commitment);
}

/** Club managers only: remove one person's signup from the roster. */
export async function removeCommitmentSignup(commitmentId, signupId) {
  return apiFetch(
    `/commitments/${encodeURIComponent(commitmentId)}/signups/${encodeURIComponent(signupId)}`,
    { method: "DELETE" }
  );
}

/** Club managers only: going + waitlisted, in arrival order. */
export async function getCommitmentRoster(commitmentId) {
  return apiFetch(`/commitments/${encodeURIComponent(commitmentId)}/roster`);
}
