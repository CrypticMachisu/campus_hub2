// Member campus affiliations and the campus-admin approval queue.
import { apiFetch } from "./api";

export async function getMyCampusAffiliations() {
  return apiFetch("/campus-affiliations/me");
}

export async function requestCampusAffiliation({ campusId, kind, note }) {
  const { affiliation } = await apiFetch("/campus-affiliations/me", {
    method: "POST",
    body: { campusId, kind, note },
  });
  return affiliation;
}

export async function cancelCampusAffiliation(affiliationId) {
  return apiFetch(`/campus-affiliations/me/${encodeURIComponent(affiliationId)}`, {
    method: "DELETE",
  });
}

export async function getCampusAffiliationRequests({ status = "pending", campusId } = {}) {
  const params = new URLSearchParams({ status });
  if (campusId) params.set("campusId", campusId);
  const { affiliations } = await apiFetch(`/campus-affiliations?${params}`);
  return affiliations;
}

export async function approveCampusAffiliation(affiliationId) {
  const { affiliation } = await apiFetch(
    `/campus-affiliations/${encodeURIComponent(affiliationId)}/approve`,
    { method: "POST" }
  );
  return affiliation;
}

export async function denyCampusAffiliation(affiliationId) {
  const { affiliation } = await apiFetch(
    `/campus-affiliations/${encodeURIComponent(affiliationId)}/deny`,
    { method: "POST" }
  );
  return affiliation;
}
