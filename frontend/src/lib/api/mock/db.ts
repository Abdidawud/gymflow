/**
 * Mock database: the records a real GymFlow backend would persist
 * (backend design §6), held in memory and saved to localStorage so demo
 * changes survive a reload.
 */

import type { DemoDataset } from "@gymflow/shared/demo/records";
import { generateDemoData } from "@gymflow/shared/demo/seed";

export type {
  MemberRecord,
  MembershipRecord,
  PaymentRecord,
  PlanRecord,
  SettingsRecord,
  StaffRecord,
} from "@gymflow/shared/demo/records";

export interface IdempotencyRecord {
  staffId: string;
  key: string;
  fingerprint: string;
  paymentId: string;
  createdAt: string;
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

export interface MockDatabase extends DemoDataset {
  version: number;
  idempotency: IdempotencyRecord[];
  sessions: SessionRecord[];
  resetTokens: ResetTokenRecord[];
  failedLogins: { email: string; at: number }[];
}

/** Bump when the seed or schema changes so stale browser copies are replaced. */
export const MOCK_DB_VERSION = 6;

/** A fresh mock database holding the shared demo gym (the same data the backend seed inserts). */
export function createDatabase(): MockDatabase {
  return {
    ...generateDemoData(),
    version: MOCK_DB_VERSION,
    idempotency: [],
    sessions: [],
    resetTokens: [],
    failedLogins: [],
  };
}
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
