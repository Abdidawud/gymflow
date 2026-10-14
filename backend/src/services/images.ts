/**
 * Image uploads (backend design §12): JPEG, PNG or WebP up to 5 MB, checked by
 * their actual bytes rather than the declared type, then re-encoded. Re-encoding
 * strips metadata (camera, GPS) and neutralizes files that only pretend to be
 * images.
 */

import type { MultipartFile } from "@fastify/multipart";
import type { FastifyRequest } from "fastify";
import sharp, { type Sharp } from "sharp";
import { invalid } from "../lib/errors";
import type { Translate } from "../lib/i18n";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function looksLikeImage(data: Buffer): boolean {
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp =
    data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP";
  return isJpeg || isPng || isWebp;
}

/** Reads the single uploaded file from a multipart request, enforcing type and size. */
export async function readUpload(request: FastifyRequest, field: string, t: Translate): Promise<Buffer> {
  let file: MultipartFile | undefined;
  try {
    file = await request.file();
  } catch {
    invalid(t, { [field]: t("photoMissing") });
  }
  if (!file || file.fieldname !== field) invalid(t, { [field]: t("photoMissing") });
  if (!ACCEPTED_TYPES.has(file.mimetype)) {
    file.file.resume();
    invalid(t, { [field]: t("photoType") });
  }
  let data: Buffer;
  try {
    data = await file.toBuffer();
  } catch {
    invalid(t, { [field]: t("photoSize") });
  }
  if (file.file.truncated) invalid(t, { [field]: t("photoSize") });
  if (!looksLikeImage(data)) invalid(t, { [field]: t("photoInvalid") });
  return data;
}

async function reencode(data: Buffer, field: string, t: Translate, pipeline: (image: Sharp) => Sharp) {
  try {
    return await pipeline(sharp(data, { limitInputPixels: 40_000_000, failOn: "error" }).rotate()).toBuffer();
  } catch {
    return invalid(t, { [field]: t("photoUnreadable") });
  }
}

/** Member photo: at most 640×640 JPEG. */
export function processPhoto(data: Buffer, t: Translate): Promise<Buffer> {
  return reencode(data, "photo", t, (image) =>
    image.resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }),
  );
}

/** Gym logo: at most 512×512 PNG, keeping transparency for receipts. */
export function processLogo(data: Buffer, t: Translate): Promise<Buffer> {
  return reencode(data, "logo", t, (image) =>
    image.resize(512, 512, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }),
  );
}
