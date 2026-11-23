import { apiFetch } from "./api";

/** Club-wide pins over the merged workspace feed, newest pin first. */
export async function getWorkspacePins(clubId) {
  const params = new URLSearchParams({ clubId });
  const { pins } = await apiFetch(`/workspace-pins?${params}`);
  return pins;
}

export async function pinWorkspaceItem({ clubId, itemType, itemId }) {
  const { pin } = await apiFetch("/workspace-pins", {
    method: "POST",
    body: { clubId, itemType, itemId },
  });
  return pin;
}

export async function unpinWorkspaceItem({ clubId, itemType, itemId }) {
  const params = new URLSearchParams({ clubId, itemType, itemId });
  await apiFetch(`/workspace-pins?${params}`, { method: "DELETE" });
}
