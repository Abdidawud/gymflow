/**
 * Role permission matrix (design.md §2). The backend returns the effective
 * permissions in /auth/me and enforces them on every request; the frontend
 * only uses them to hide navigation and actions. Role names and descriptions
 * live in the i18n catalog (labels.roles).
 */

export const ROLES = ["ADMINISTRATOR", "RECEPTIONIST"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  "members.archive" | "plans.manage" | "revenue.view" | "reports.view" | "staff.manage" | "settings.manage";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMINISTRATOR: ["members.archive", "plans.manage", "revenue.view", "reports.view", "staff.manage", "settings.manage"],
  RECEPTIONIST: [],
};
