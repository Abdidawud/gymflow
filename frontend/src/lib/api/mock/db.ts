/**
 * Mock database: the records a real GymFlow backend would persist
 * (backend design §6), held in memory and saved to localStorage so demo
 * changes survive a reload.
 */

import type { DateOnly } from "@/lib/domain/dates";
import type { Money } from "@/lib/domain/money";
import type { Role } from "@/lib/domain/permissions";
import type { Appearance, Gender, Locale, PaymentMethod } from "../types";

export interface StaffRecord {
  id: string;
  fullName: string;
  email: string;
  /** Mock only. A real backend stores a memory-hard hash, never the password. */
  password: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  appearance: Appearance;
  language: Locale;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberRecord {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  photoUrl: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelationship: string | null;
  address: string | null;
  notes: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  registrationDate: DateOnly;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  price: Money;
  durationDays: number;
  description: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  id: string;
  memberId: string;
  planId: string;
  planNameSnapshot: string;
  priceSnapshot: Money;
  durationDaysSnapshot: number;
  startDate: DateOnly;
  endDate: DateOnly;
  isRenewal: boolean;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  paymentCode: string;
  memberId: string;
  membershipId: string;
  amount: Money;
  currency: "ETB";
  method: PaymentMethod;
  receivedDate: DateOnly;
  reference: string | null;
  notes: string | null;
  recordedBy: string;
  createdAt: string;
}

export interface IdempotencyRecord {
  staffId: string;
  key: string;
  fingerprint: string;
  paymentId: string;
  createdAt: string;
}

export interface SettingsRecord {
  gymName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  expirationWarningDays: number;
  enabledPaymentMethods: PaymentMethod[];
  updatedAt: string;
  updatedBy: string | null;
}

export interface SessionRecord {
  token: string;
  staffId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface ResetTokenRecord {
  token: string;
  staffId: string;
  expiresAt: number;
  consumedAt: number | null;
}

export interface MockDatabase {
  version: number;
  staff: StaffRecord[];
  members: MemberRecord[];
  plans: PlanRecord[];
  memberships: MembershipRecord[];
  payments: PaymentRecord[];
  idempotency: IdempotencyRecord[];
  settings: SettingsRecord;
  sessions: SessionRecord[];
  resetTokens: ResetTokenRecord[];
  failedLogins: { email: string; at: number }[];
  counters: { member: number; payment: number };
}

/** Bump when the seed or schema changes so stale browser copies are replaced. */
export const MOCK_DB_VERSION = 5;
const STORAGE_KEY = "gymflow:mock-db";

export function loadDatabase(): MockDatabase | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockDatabase;
    return parsed.version === MOCK_DB_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: MockDatabase | null = null;

function write(db: MockDatabase) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked (private mode): the demo keeps working in memory.
  }
}

/**
 * Persists the database. Mutations save immediately, like a committed
 * transaction, so a reload right after "Payment recorded" never loses it.
 * Only low-value bookkeeping (session activity) may be deferred.
 */
export function saveDatabase(db: MockDatabase, options: { defer?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!options.defer) {
    pending = null;
    write(db);
    return;
  }
  pending = db;
  saveTimer = setTimeout(() => {
    if (pending) write(pending);
    pending = null;
  }, 1000);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (pending) write(pending);
    pending = null;
  });
}

/** Another tab changed the demo data: reload it so tabs don't overwrite each other. */
export function onExternalChange(listener: (db: MockDatabase) => void): void {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as MockDatabase;
      if (parsed.version === MOCK_DB_VERSION) listener(parsed);
    } catch {
      // Ignore malformed data from another tab.
    }
  });
}

export function clearSavedDatabase(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
}
