import { z } from "zod";
import { notFound } from "../lib/errors";
import type { Translate } from "../lib/i18n";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Record ids are opaque UUIDs; anything else simply doesn't exist. */
export function idParam(params: unknown, t: Translate): string {
  const id = (params as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !UUID_RE.test(id)) notFound(t);
  return id.toLowerCase();
}

export const PageQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
