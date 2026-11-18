// One small WebP derivative per published photo. The original stays available
// for the permalink and as the fallback when generation is unavailable.
import sharp from "sharp";

export const THUMBNAIL_WIDTH = 640;
export const THUMBNAIL_MIME = "image/webp";

export function thumbnailKeyFor(storageKey) {
  return `${storageKey}.thumb.webp`;
}

/**
 * Decode one uploaded image and return a bounded WebP. `rotate()` applies the
 * EXIF orientation before resizing; the re-encode drops the rest of the
 * metadata. The pixel limit keeps a malformed or oversized image from
 * exhausting the API process.
 */
export async function createThumbnail(stream) {
  return sharp(stream, {
    failOn: "error",
    limitInputPixels: 40_000_000,
    animated: false,
  })
    .rotate()
    .resize({
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 74, effort: 4 })
    .toBuffer();
}
