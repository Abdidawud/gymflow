/**
 * Structural request validation with zod. Shape problems (wrong types, unknown
 * fields) are client bugs and answer 400; business checks with per-field
 * messages live in the modules and answer 422.
 */

import type { z } from "zod";
import { AppError } from "../lib/errors";
import type { Translate } from "../lib/i18n";

function toAppError(error: z.ZodError, t: Translate): AppError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) fieldErrors[[...issue.path, key].join(".")] = t("unknownField");
      continue;
    }
    const path = issue.path.join(".") || "body";
    fieldErrors[path] ??= t("invalidValue");
  }
  return new AppError(400, "VALIDATION_FAILED", t("malformed"), {
    fieldErrors,
  });
}

export function parse<S extends z.ZodType>(schema: S, value: unknown, t: Translate): z.infer<S> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw toAppError(result.error, t);
  return result.data;
}
