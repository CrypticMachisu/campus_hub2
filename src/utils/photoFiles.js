export const MAX_POST_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = "image/jpeg,image/png,image/webp";

export function photoFileError(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return `${file.name || "That file"} isn't a JPEG, PNG or WebP image.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `${file.name || "That photo"} is over 5 MB.`;
  }
  return "";
}

function newKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readDimensions(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });
    };
    image.onerror = () => resolve({ width: null, height: null });
    image.src = url;
  });
}

/** A draft the composer can preview and upload, before it has a media id. */
export async function createPhotoDraft(file) {
  const previewUrl = URL.createObjectURL(file);
  const dimensions = await readDimensions(previewUrl);
  return {
    key: newKey(),
    file,
    previewUrl,
    width: dimensions.width,
    height: dimensions.height,
    altText: "",
    decorative: false,
    mediaId: null,
  };
}

export function revokePhotoDraft(photo) {
  if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
}
