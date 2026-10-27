/**
 * Photos are prepared in the browser and never kept.
 *
 * A label is photographed at the kitchen table: the picture is downscaled to
 * something a phone can upload on mobile data, sent once to the AI function to
 * be read, and then thrown away. Nothing here writes to storage, and no caller
 * keeps the data URL after the numbers come back.
 */

const MAX_EDGE = 1024;
const QUALITY = 0.82;

/** Downscales a picked photo so uploads stay small and fast on mobile. */
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("unreadable");
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const data = canvas.toDataURL("image/jpeg", QUALITY);
  // Blank the canvas so the pixels do not linger in memory after the upload.
  canvas.width = 0;
  canvas.height = 0;
  return { data, width, height };
}

/** Drops a prepared photo: the string is the only copy the app holds. */
export function discardImage(photo) {
  if (photo) photo.data = null;
  return null;
}
