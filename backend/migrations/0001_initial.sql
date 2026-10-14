-- GymFlow Version 1 schema (backend-database-system-design.md §6–7).
--
-- The database enforces the rules that protect money and coverage, so a bug
-- in the application cannot silently corrupt them:
--   * no overlapping coverage for a member (exclusion constraint);
--   * end date = start date + duration − 1, positive fixed-precision amounts;
--   * one payment per membership, for the same member, equal to its price;
--   * posted payments, purchased memberships and audit events are immutable;
--   * idempotency keys are unique per staff member and never committed half-done.
--
-- Dates are ISO calendar dates; the Ethiopian calendar is a display concern.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE staff_role AS ENUM ('ADMINISTRATOR', 'RECEPTIONIST');
CREATE TYPE appearance AS ENUM ('LIGHT', 'DARK', 'SYSTEM');
CREATE TYPE ui_language AS ENUM ('am', 'en');
CREATE TYPE payment_method AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_PAYMENT');
CREATE TYPE gender AS ENUM ('MALE', 'FEMALE');

-- "GYM-00124": zero-padded to at least five digits, never truncated.
CREATE FUNCTION display_code(prefix text, n bigint) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT
  RETURN prefix || '-' || lpad(n::text, greatest(5, length(n::text)), '0');

CREATE FUNCTION reject_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable once recorded', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- ---------------------------------------------------------------------------
-- Staff, sessions and account recovery
-- ---------------------------------------------------------------------------

CREATE TABLE staff (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 80),
  email                text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  password_hash        text NOT NULL,
  role                 staff_role NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  appearance           appearance NOT NULL DEFAULT 'SYSTEM',
  language             ui_language NOT NULL DEFAULT 'am',
  last_sign_in_at      timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_email_key UNIQUE (email)
);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   bytea NOT NULL CHECK (length(token_hash) = 32),
  staff_id     uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  CONSTRAINT sessions_token_hash_key UNIQUE (token_hash),
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_staff_id_idx ON sessions (staff_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  bytea NOT NULL CHECK (length(token_hash) = 32),
  staff_id    uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_resets_token_hash_key UNIQUE (token_hash),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 day')
);
CREATE INDEX password_resets_staff_id_idx ON password_resets (staff_id);
CREATE INDEX password_resets_expires_at_idx ON password_resets (expires_at);

-- Failed sign-ins per email, for the brute-force limit (backend design §12).
CREATE TABLE login_failures (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_failures_email_created_idx ON login_failures (email, created_at);

-- ---------------------------------------------------------------------------
-- Gym settings (singleton)
-- ---------------------------------------------------------------------------

CREATE TABLE gym_settings (
  id                      boolean PRIMARY KEY DEFAULT true CHECK (id),
  gym_name                text NOT NULL CHECK (length(btrim(gym_name)) BETWEEN 1 AND 80),
  phone                   text CHECK (phone ~ '^\+251[1-9][0-9]{8}$'),
  email                   text CHECK (email = lower(email) AND length(email) <= 254),
  address                 text CHECK (length(address) <= 200),
  logo_storage_key        text,
  logo_updated_at         timestamptz,
  currency                text NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
  timezone                text NOT NULL DEFAULT 'Africa/Addis_Ababa' CHECK (timezone = 'Africa/Addis_Ababa'),
  expiration_warning_days integer NOT NULL DEFAULT 7 CHECK (expiration_warning_days BETWEEN 0 AND 30),
  enabled_payment_methods payment_method[] NOT NULL
    DEFAULT '{CASH,BANK_TRANSFER,CARD,MOBILE_PAYMENT}'
    CHECK (cardinality(enabled_payment_methods) BETWEEN 1 AND 4),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES staff (id) ON DELETE SET NULL
);
INSERT INTO gym_settings (gym_name) VALUES ('GymFlow');

-- ---------------------------------------------------------------------------
-- Members and plans
-- ---------------------------------------------------------------------------

CREATE SEQUENCE member_number_seq;

CREATE TABLE members (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_code            text NOT NULL DEFAULT display_code('GYM', nextval('member_number_seq'))
                         CHECK (member_code ~ '^GYM-[0-9]{5,}$'),
  first_name             text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 60),
  last_name              text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 60),
  -- Canonical +251 form; unique under the Version 1 one-member-per-phone policy.
  phone                  text NOT NULL CHECK (phone ~ '^\+251[79][0-9]{8}$'),
  email                  text CHECK (email = lower(email) AND length(email) <= 254),
  gender                 gender,
  photo_storage_key      text,
  photo_updated_at       timestamptz,
  emergency_name         text CHECK (length(emergency_name) <= 80),
  emergency_phone        text CHECK (emergency_phone ~ '^\+251[1-9][0-9]{8}$'),
  emergency_relationship text CHECK (length(emergency_relationship) <= 40),
  address                text CHECK (length(address) <= 200),
  notes                  text CHECK (length(notes) <= 1000),
  is_archived            boolean NOT NULL DEFAULT false,
  archived_at            timestamptz,
  registration_date      date NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT members_member_code_key UNIQUE (member_code),
  CONSTRAINT members_phone_key UNIQUE (phone),
  CHECK ((emergency_name IS NULL) = (emergency_phone IS NULL)),
  CHECK (is_archived = (archived_at IS NOT NULL)),
  CHECK ((photo_storage_key IS NULL) = (photo_updated_at IS NULL))
);
CREATE INDEX members_registration_date_idx ON members (registration_date);
CREATE INDEX members_name_idx ON members (lower(first_name), lower(last_name));

CREATE TABLE plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  price         numeric(12, 2) NOT NULL CHECK (price > 0),
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 3650),
  description   text CHECK (length(description) <= 280),
  is_enabled    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plans_name_key ON plans (lower(name));

-- ---------------------------------------------------------------------------
-- Memberships and payments (financial history)
-- ---------------------------------------------------------------------------

CREATE TABLE memberships (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id              uuid NOT NULL REFERENCES members (id) ON DELETE RESTRICT,
  plan_id                uuid NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  plan_name_snapshot     text NOT NULL CHECK (length(plan_name_snapshot) BETWEEN 1 AND 60),
  price_snapshot         numeric(12, 2) NOT NULL CHECK (price_snapshot > 0),
  duration_days_snapshot integer NOT NULL CHECK (duration_days_snapshot BETWEEN 1 AND 3650),
  start_date             date NOT NULL,
  end_date               date NOT NULL,
  is_renewal             boolean NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_id_member_key UNIQUE (id, member_id),
  CONSTRAINT memberships_end_date_check CHECK (end_date = start_date + duration_days_snapshot - 1),
  -- One member can never hold two paid periods covering the same day.
  CONSTRAINT memberships_no_overlap
    EXCLUDE USING gist (member_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
);
CREATE INDEX memberships_member_dates_idx ON memberships (member_id, end_date, start_date);
CREATE INDEX memberships_end_date_idx ON memberships (end_date);
CREATE INDEX memberships_plan_id_idx ON memberships (plan_id);

CREATE SEQUENCE payment_number_seq;

CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_code  text NOT NULL DEFAULT display_code('PAY', nextval('payment_number_seq'))
                CHECK (payment_code ~ '^PAY-[0-9]{5,}$'),
  member_id     uuid NOT NULL REFERENCES members (id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL,
  amount        numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency      text NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
  method        payment_method NOT NULL,
  received_date date NOT NULL,
  reference     text CHECK (length(reference) BETWEEN 1 AND 64),
  notes         text CHECK (length(notes) <= 500),
  recorded_by   uuid NOT NULL REFERENCES staff (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_payment_code_key UNIQUE (payment_code),
  CONSTRAINT payments_membership_id_key UNIQUE (membership_id),
  -- The payment's member must be the member of the period it funds.
  CONSTRAINT payments_membership_member_fkey FOREIGN KEY (membership_id, member_id)
    REFERENCES memberships (id, member_id) ON DELETE RESTRICT,
  CONSTRAINT payments_reference_required CHECK (method = 'CASH' OR reference IS NOT NULL),
  -- Received date is never after the day it was entered (gym date).
  CONSTRAINT payments_received_not_future
    CHECK (received_date <= (created_at AT TIME ZONE 'Africa/Addis_Ababa')::date)
);
CREATE INDEX payments_received_date_idx ON payments (received_date);
CREATE INDEX payments_member_received_idx ON payments (member_id, received_date);
CREATE INDEX payments_recorded_by_idx ON payments (recorded_by);
CREATE INDEX payments_created_at_idx ON payments (created_at DESC);

-- Amount is derived from the purchased period, never trusted from a client.
CREATE FUNCTION check_payment_amount() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  expected numeric(12, 2);
BEGIN
  SELECT price_snapshot INTO expected FROM memberships WHERE id = NEW.membership_id;
  IF expected IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'payment amount % does not match membership price %', NEW.amount, expected
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payments_amount_matches_membership
  BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION check_payment_amount();

-- Posted payments and purchased periods are never edited or deleted (corrections
-- need a separately designed reversal workflow).
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER memberships_immutable BEFORE UPDATE OR DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION reject_change();

-- ---------------------------------------------------------------------------
-- Idempotent payment confirmation
-- ---------------------------------------------------------------------------

CREATE TABLE idempotency_keys (
  staff_id            uuid NOT NULL REFERENCES staff (id) ON DELETE RESTRICT,
  request_key         uuid NOT NULL,
  request_fingerprint text NOT NULL,
  -- NULL only inside the transaction that reserved the key.
  payment_id          uuid REFERENCES payments (id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, request_key)
);

-- A reservation must never be committed without its payment.
CREATE FUNCTION check_idempotency_complete() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM idempotency_keys
    WHERE staff_id = NEW.staff_id AND request_key = NEW.request_key AND payment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'idempotency key reserved without a payment' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER idempotency_keys_complete
  AFTER INSERT OR UPDATE ON idempotency_keys
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_idempotency_complete();

-- ---------------------------------------------------------------------------
-- Audit trail and outgoing email
-- ---------------------------------------------------------------------------

CREATE TABLE audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES staff (id) ON DELETE RESTRICT,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  request_id  text,
  summary     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_at_idx ON audit_events (created_at);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id);
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_change();

-- Outbox: email is queued in the same transaction as the change that needs
-- it and delivered by a worker, so requests never wait on the mail server.
CREATE TABLE email_outbox (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient  text NOT NULL,
  subject    text NOT NULL,
  -- Cleared after delivery: bodies can contain single-use links.
  body_text  text,
  body_html  text,
  attempts   integer NOT NULL DEFAULT 0,
  last_error text,
  send_after timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_pending_idx ON email_outbox (send_after) WHERE sent_at IS NULL;
