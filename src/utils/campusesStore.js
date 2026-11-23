// Campus settings are tier-1 only. The public campus list is not read here;
// this store is for the administration screen.
import { apiFetch } from "./api";

export async function getCampuses() {
  const { campuses } = await apiFetch("/campuses", { auth: false });
  return campuses;
}

export async function getCampusSettings() {
  const { campuses } = await apiFetch("/campuses/manage");
  return campuses;
}

export async function createCampus({ name, slug, domains }) {
  const { campus } = await apiFetch("/campuses", {
    method: "POST",
    body: { name, slug, domains },
  });
  return campus;
}

export async function updateCampus(campusId, { name, slug }) {
  const { campus } = await apiFetch(`/campuses/${encodeURIComponent(campusId)}`, {
    method: "PATCH",
    body: { name, slug },
  });
  return campus;
}

export async function addCampusDomain(campusId, domain) {
  return apiFetch(`/campuses/${encodeURIComponent(campusId)}/domains`, {
    method: "POST",
    body: { domain },
  });
}

export async function removeCampusDomain(campusId, domain) {
  return apiFetch(
    `/campuses/${encodeURIComponent(campusId)}/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" }
  );
}
