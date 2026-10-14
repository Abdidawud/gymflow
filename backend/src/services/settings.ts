import { PAYMENT_METHODS, type PaymentMethod } from "@gymflow/shared/api/types";
import { sql } from "kysely";
import type { Db, Tx } from "../db";

export interface SettingsRow {
  gymName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoStorageKey: string | null;
  logoUpdatedAt: Date | null;
  expirationWarningDays: number;
  enabledPaymentMethods: PaymentMethod[];
  updatedAt: Date;
  updatedBy: string | null;
}

/**
 * Reads the singleton settings row. Inside a payment transaction it is read
 * FOR SHARE so a concurrent settings change waits until the payment commits.
 */
export async function readSettings(db: Db | Tx, options: { lock?: "share" | "update" } = {}): Promise<SettingsRow> {
  let query = db
    .selectFrom("gym_settings")
    .select([
      "gym_name",
      "phone",
      "email",
      "address",
      "logo_storage_key",
      "logo_updated_at",
      "expiration_warning_days",
      sql<string[]>`enabled_payment_methods::text[]`.as("methods"),
      "updated_at",
      "updated_by",
    ]);
  if (options.lock === "share") query = query.forShare();
  if (options.lock === "update") query = query.forUpdate();
  const row = await query.executeTakeFirstOrThrow();
  return {
    gymName: row.gym_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    logoStorageKey: row.logo_storage_key,
    logoUpdatedAt: row.logo_updated_at,
    expirationWarningDays: row.expiration_warning_days,
    // Canonical order, whatever order they were saved in.
    enabledPaymentMethods: PAYMENT_METHODS.filter((m) => row.methods.includes(m)),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function hasEnabledPlans(db: Db | Tx): Promise<boolean> {
  const row = await db.selectFrom("plans").select("id").where("is_enabled", "=", true).limit(1).executeTakeFirst();
  return Boolean(row);
}
