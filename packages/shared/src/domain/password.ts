/**
 * Password requirements shown before submission (design.md §7). The backend
 * enforces the same policy; keep the two in sync. Letters are Unicode-aware, so
 * Ge'ez (Amharic) letters count as letters too. Labels live in the i18n catalog
 * under auth.password.<id>.
 */

export type PasswordRequirementId = "length" | "letter" | "numberOrSymbol";

export interface PasswordRequirement {
  id: PasswordRequirementId;
  test: (password: string) => boolean;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: "length",
    test: (p) => p.length >= PASSWORD_MIN_LENGTH && p.length <= PASSWORD_MAX_LENGTH,
  },
  { id: "letter", test: (p) => /\p{L}/u.test(p) },
  { id: "numberOrSymbol", test: (p) => /[^\p{L}]/u.test(p) },
];

export function meetsPasswordPolicy(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(password));
}
