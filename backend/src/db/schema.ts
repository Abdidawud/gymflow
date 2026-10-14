/**
 * Kysely table types for migrations/0001_initial.sql. Keep in sync with the
 * migrations; the integration tests exercise every table.
 *
 * `date` columns are ISO strings and `numeric` money is a decimal string
 * (see the type parsers in db/index.ts); timestamps are Date objects.
 */

import type { ColumnType, Generated } from "kysely";
import type {
  Appearance,
  Gender,
  PaymentMethod,
} from "@gymflow/shared/api/types";
import type { DateOnly } from "@gymflow/shared/domain/dates";
import type { Money } from "@gymflow/shared/domain/money";
import type { Role } from "@gymflow/shared/domain/permissions";
import type { Locale } from "@gymflow/shared/i18n/locales";

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type DefaultTimestamp = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;

export interface StaffTable {
  id: Generated<string>;
  full_name: string;
  email: string;
  password_hash: string;
  role: Role;
  is_active: Generated<boolean>;
  must_change_password: Generated<boolean>;
  appearance: Generated<Appearance>;
  language: Generated<Locale>;
  last_sign_in_at: Timestamp | null;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface SessionsTable {
  id: Generated<string>;
  token_hash: Buffer;
  staff_id: string;
  created_at: DefaultTimestamp;
  last_seen_at: DefaultTimestamp;
  expires_at: Timestamp;
}

export interface PasswordResetsTable {
  id: Generated<string>;
  token_hash: Buffer;
  staff_id: string;
  expires_at: Timestamp;
  consumed_at: Timestamp | null;
  created_at: DefaultTimestamp;
}

export interface LoginFailuresTable {
  id: Generated<string>;
  email: string;
  created_at: DefaultTimestamp;
}

export interface GymSettingsTable {
  id: Generated<boolean>;
  gym_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_storage_key: string | null;
  logo_updated_at: Timestamp | null;
  currency: Generated<"ETB">;
  timezone: Generated<string>;
  expiration_warning_days: Generated<number>;
  /** Read with a ::text[] cast: node-postgres does not parse enum arrays. */
  enabled_payment_methods: ColumnType<string, PaymentMethod[], PaymentMethod[]>;
  updated_at: DefaultTimestamp;
  updated_by: string | null;
}

export interface MembersTable {
  id: Generated<string>;
  member_code: Generated<string>;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  photo_storage_key: string | null;
  photo_updated_at: Timestamp | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  emergency_relationship: string | null;
  address: string | null;
  notes: string | null;
  is_archived: Generated<boolean>;
  archived_at: Timestamp | null;
  registration_date: DateOnly;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface PlansTable {
  id: Generated<string>;
  name: string;
  price: Money;
  duration_days: number;
  description: string | null;
  is_enabled: Generated<boolean>;
  created_at: DefaultTimestamp;
  updated_at: DefaultTimestamp;
}

export interface MembershipsTable {
  id: Generated<string>;
  member_id: string;
  plan_id: string;
  plan_name_snapshot: string;
  price_snapshot: Money;
  duration_days_snapshot: number;
  start_date: DateOnly;
  end_date: DateOnly;
  is_renewal: boolean;
  created_at: DefaultTimestamp;
}

export interface PaymentsTable {
  id: Generated<string>;
  payment_code: Generated<string>;
  member_id: string;
  membership_id: string;
  amount: Money;
  currency: Generated<"ETB">;
  method: PaymentMethod;
  received_date: DateOnly;
  reference: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: DefaultTimestamp;
}

export interface IdempotencyKeysTable {
  staff_id: string;
  request_key: string;
  request_fingerprint: string;
  payment_id: string | null;
  created_at: DefaultTimestamp;
}

export interface AuditEventsTable {
  id: Generated<string>;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_id: string | null;
  summary: ColumnType<unknown, string | null, never>;
  created_at: DefaultTimestamp;
}

export interface EmailOutboxTable {
  id: Generated<string>;
  recipient: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  attempts: Generated<number>;
  last_error: string | null;
  send_after: DefaultTimestamp;
  expires_at: Timestamp;
  sent_at: Timestamp | null;
  created_at: DefaultTimestamp;
}

export interface SchemaMigrationsTable {
  version: string;
  checksum: string;
  applied_at: DefaultTimestamp;
}

export interface Database {
  staff: StaffTable;
  sessions: SessionsTable;
  password_resets: PasswordResetsTable;
  login_failures: LoginFailuresTable;
  gym_settings: GymSettingsTable;
  members: MembersTable;
  plans: PlansTable;
  memberships: MembershipsTable;
  payments: PaymentsTable;
  idempotency_keys: IdempotencyKeysTable;
  audit_events: AuditEventsTable;
  email_outbox: EmailOutboxTable;
  schema_migrations: SchemaMigrationsTable;
}
