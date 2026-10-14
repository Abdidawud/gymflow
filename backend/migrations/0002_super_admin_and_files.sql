-- Super administrator and database-backed file storage (for serverless hosting).
--
-- * staff.is_super_admin marks the gym owner's account. It must stay an active
--   administrator: no one can demote or deactivate it (enforced here and in the API).
-- * Member photos and the gym logo live in PostgreSQL instead of a local disk,
--   so they work on platforms without persistent disks (Vercel) and are part of
--   every database backup. Images are re-encoded and small (≤ 640 px JPEG, ≤ 512 px PNG).

ALTER TABLE staff ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD CONSTRAINT staff_super_admin_active
  CHECK (NOT is_super_admin OR (role = 'ADMINISTRATOR' AND is_active));

CREATE TABLE stored_files (
  key          text PRIMARY KEY CHECK (key ~ '^(members|logo)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  data         bytea NOT NULL CHECK (octet_length(data) BETWEEN 1 AND 5242880),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Files are only kept while something points at them; earlier keys referred to
-- a local disk, so they are cleared.
UPDATE members SET photo_storage_key = NULL, photo_updated_at = NULL WHERE photo_storage_key IS NOT NULL;
UPDATE gym_settings SET logo_storage_key = NULL, logo_updated_at = NULL WHERE logo_storage_key IS NOT NULL;

ALTER TABLE members ADD CONSTRAINT members_photo_file_fkey
  FOREIGN KEY (photo_storage_key) REFERENCES stored_files (key) ON DELETE RESTRICT;
ALTER TABLE gym_settings ADD CONSTRAINT gym_settings_logo_file_fkey
  FOREIGN KEY (logo_storage_key) REFERENCES stored_files (key) ON DELETE RESTRICT;
