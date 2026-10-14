/**
 * Demo dataset records (backend design §6). The in-browser mock keeps them as
 * its database; the backend seed inserts them into PostgreSQL.
 */

import type { Appearance, Gender, PaymentMethod } from "../api/types";
import type { DateOnly } from "../domain/dates";
import type { Money } from "../domain/money";
import type { Role } from "../domain/permissions";
import type { Locale } from "../i18n/locales";

export interface StaffRecord {
  id: string;
  fullName: string;
  email: string;
  /** Demo only. The backend stores an Argon2id hash, never the password. */
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

export interface DemoDataset {
  staff: StaffRecord[];
  members: MemberRecord[];
  plans: PlanRecord[];
  memberships: MembershipRecord[];
  payments: PaymentRecord[];
  settings: SettingsRecord;
  /** Highest member and payment numbers in use, so new codes continue after them. */
  counters: { member: number; payment: number };
}
