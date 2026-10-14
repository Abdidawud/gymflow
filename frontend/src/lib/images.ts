/**
 * Image preparation in the browser before upload. Phone cameras produce 3–10 MB
 * photos; shrinking them first keeps uploads fast on mobile data and well under
 * the 4.5 MB request limit of serverless hosting. The server re-encodes every
 * image again (and strips metadata), so this is only about size.
 */

/** Largest original accepted from the device, before shrinking. */
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
/** Largest upload the API accepts. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function shrinkImage(
  file: File,
  { maxSize, type, quality = 0.88 }: { maxSize: number; type: "image/jpeg" | "image/png"; quality?: number },
): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // the server will report a file it can't read
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  if (type === "image/jpeg") {
    // JPEG has no transparency: paint it white rather than black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob || (scale === 1 && blob.size >= file.size && file.size <= MAX_UPLOAD_BYTES)) return file;
  const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.${type === "image/png" ? "png" : "jpg"}`;
  return new File([blob], name, { type });
}
