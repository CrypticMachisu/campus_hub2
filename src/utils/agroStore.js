import { apiFetch } from "./api";

/** The four activity types the Agri club runs with its growers. */
export const OPPORTUNITY_KINDS = [
  { id: "farm_visit", label: "Farm visit" },
  { id: "tree_planting", label: "Tree planting" },
  { id: "harvest", label: "Harvest" },
  { id: "volunteering", label: "Volunteering" },
];

export function kindLabel(kind) {
  return OPPORTUNITY_KINDS.find((entry) => entry.id === kind)?.label || "Activity";
}

/**
 * v2 sends one ISO `startsAt`; the cards and the .ics exporter work with the
 * app's date + time pair. Split it once, here, exactly like toUiEvent does.
 */
export function toUiOpportunity(opportunity) {
  if (!opportunity || !opportunity.startsAt) return opportunity;
  const { startsAt, ...rest } = opportunity;
  const [date, clock = "00:00"] = startsAt.split("T");
  return { ...rest, date, time: clock.slice(0, 5) };
}

/** Upcoming opportunities + the freshness of the grower details beside them. */
export async function getAgroOpportunities() {
  const data = await apiFetch("/agro/opportunities");
  return {
    opportunities: (data.opportunities || []).map(toUiOpportunity),
    partner: data.partner || { live: false, asOf: null, stale: false },
  };
}

export async function registerOpportunityInterest(opportunityId) {
  const { interest } = await apiFetch(
    `/agro/opportunities/${encodeURIComponent(opportunityId)}/interest`,
    { method: "POST" }
  );
  return interest;
}

export async function withdrawOpportunityInterest(opportunityId) {
  const { interest } = await apiFetch(
    `/agro/opportunities/${encodeURIComponent(opportunityId)}/interest`,
    { method: "DELETE" }
  );
  return interest;
}

/** Admin only: the members who registered interest, with contact details. */
export async function getOpportunityInterested(opportunityId) {
  const { interested } = await apiFetch(
    `/agro/opportunities/${encodeURIComponent(opportunityId)}/interested`
  );
  return interested;
}

/** Club admins only (server-checked). */
export async function addAgroOpportunity(payload) {
  const { opportunity } = await apiFetch("/agro/opportunities", {
    method: "POST",
    body: payload,
  });
  return toUiOpportunity(opportunity);
}

export async function deleteAgroOpportunity(opportunityId) {
  await apiFetch(`/agro/opportunities/${encodeURIComponent(opportunityId)}`, {
    method: "DELETE",
  });
}
