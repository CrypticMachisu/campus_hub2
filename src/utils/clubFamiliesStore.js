// Tier-1 club family management. Mounted only when the cross-university flag
// is enabled; the server is authoritative if the client flags drift.
import { apiFetch } from "./api";

export async function getFamilies() {
  const { families } = await apiFetch("/club-families", { auth: false });
  return families;
}

export async function getFamily(familyId) {
  const { family } = await apiFetch(`/club-families/${encodeURIComponent(familyId)}`, {
    auth: false,
  });
  return family;
}

export async function getFamilySettings() {
  const { families } = await apiFetch("/club-families/manage");
  return families;
}

export async function createFamily({ name, slug, homeCampusId, description, logoUrl }) {
  const { family } = await apiFetch("/club-families", {
    method: "POST",
    body: { name, slug, homeCampusId, description, logoUrl },
  });
  return family;
}

export async function updateFamily(familyId, { name, slug, description, logoUrl }) {
  const { family } = await apiFetch(`/club-families/${encodeURIComponent(familyId)}`, {
    method: "PATCH",
    body: { name, slug, description, logoUrl },
  });
  return family;
}

export async function addFamilyAdmin(familyId, { email, role }) {
  const { family } = await apiFetch(`/club-families/${encodeURIComponent(familyId)}/admins`, {
    method: "POST",
    body: { email, role },
  });
  return family;
}

export async function removeFamilyAdmin(familyId, userId) {
  const { family } = await apiFetch(
    `/club-families/${encodeURIComponent(familyId)}/admins/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
  return family;
}

export async function linkFamilyChapter(familyId, clubId) {
  const { family } = await apiFetch(`/club-families/${encodeURIComponent(familyId)}/chapters`, {
    method: "POST",
    body: { clubId },
  });
  return family;
}

export async function moveFamilyChapter(targetFamilyId, clubId, fromFamilyId) {
  const { family } = await apiFetch(
    `/club-families/${encodeURIComponent(targetFamilyId)}/chapters/${encodeURIComponent(
      clubId
    )}/move`,
    { method: "POST", body: { fromFamilyId } }
  );
  return family;
}

export async function unlinkFamilyChapter(familyId, clubId) {
  const { family } = await apiFetch(
    `/club-families/${encodeURIComponent(familyId)}/chapters/${encodeURIComponent(clubId)}`,
    { method: "DELETE" }
  );
  return family;
}
