-- English becomes the default interface language for new staff accounts.
-- Existing accounts keep the language each person chose.
ALTER TABLE staff ALTER COLUMN language SET DEFAULT 'en';
