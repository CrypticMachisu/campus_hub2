import { apiFetch } from "./api";

/** Public club feed page: { posts, nextCursor }. */
export async function getClubPosts(clubId, { before = "", limit = 10 } = {}) {
  const params = new URLSearchParams({ clubId, limit: String(limit) });
  if (before) params.set("before", before);
  return apiFetch(`/posts?${params.toString()}`);
}

/** Officer desk: every status, newest first. */
export async function getManagedPosts(clubId) {
  const data = await apiFetch(`/posts/manage?clubId=${encodeURIComponent(clubId)}`);
  return data.posts;
}

export async function getPost(postId) {
  return (await apiFetch(`/posts/${encodeURIComponent(postId)}`)).post;
}

export async function createPost(clubId, text) {
  return (await apiFetch("/posts", { method: "POST", body: { clubId, text } })).post;
}

export async function updatePost(postId, text) {
  return (
    await apiFetch(`/posts/${encodeURIComponent(postId)}`, { method: "PATCH", body: { text } })
  ).post;
}

/** status: published | hidden | removed */
export async function setPostStatus(postId, status) {
  return (
    await apiFetch(`/posts/${encodeURIComponent(postId)}/status`, {
      method: "PATCH",
      body: { status },
    })
  ).post;
}
