import { apiFetch } from "./api";

/** Public club feed page: { posts, nextCursor, mediaEnabled }. */
export async function getClubPosts(clubId, { before = "", limit = 10 } = {}) {
  const params = new URLSearchParams({ clubId, limit: String(limit) });
  if (before) params.set("before", before);
  return apiFetch(`/posts?${params.toString()}`);
}

/** Officer desk: every status, newest first, plus whether photos are configured. */
export async function getManagedPosts(clubId) {
  return apiFetch(`/posts/manage?clubId=${encodeURIComponent(clubId)}`);
}

export async function getPost(postId) {
  return (await apiFetch(`/posts/${encodeURIComponent(postId)}`)).post;
}

/** Reserve a photo and receive a short-lived direct upload URL. */
export async function requestPhotoUpload(clubId, { file, altText, decorative, width, height }) {
  return apiFetch("/posts/media", {
    method: "POST",
    body: {
      clubId,
      mimeType: file.type,
      size: file.size,
      altText,
      decorative,
      width,
      height,
    },
  });
}

/**
 * PUT the file straight to the bucket. This must not carry the API's auth
 * header, and the Content-Type must match the value that was signed.
 */
export async function uploadPhoto(upload, file) {
  let response;
  try {
    response = await fetch(upload.url, {
      method: upload.method || "PUT",
      headers: upload.headers,
      body: file,
    });
  } catch {
    throw new Error("The photo upload couldn't reach storage. Check your connection.");
  }
  if (!response.ok) {
    throw new Error("Storage rejected the photo upload. Try again.");
  }
}

export async function discardPendingPhoto(mediaId) {
  await apiFetch(`/posts/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" });
}

export async function createPost(clubId, text, mediaIds = []) {
  return (await apiFetch("/posts", { method: "POST", body: { clubId, text, mediaIds } })).post;
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

export async function setPostPinned(postId, pinned) {
  return (
    await apiFetch(`/posts/${encodeURIComponent(postId)}/pin`, {
      method: "PATCH",
      body: { pinned },
    })
  ).post;
}

export async function removePostPhoto(postId, mediaId) {
  await apiFetch(`/posts/${encodeURIComponent(postId)}/media/${encodeURIComponent(mediaId)}`, {
    method: "DELETE",
  });
}
