/**
 * GymFlow API v1 data contracts.
 *
 * These mirror backend-database-system-design.md §8–9: dates are YYYY-MM-DD,
 * timestamps ISO 8601, money decimal strings with currency "ETB", and lists
 * are paginated `{ items, total, page, pageSize }`.
 */

import type { DateOnly } from "@/lib/domain/dates";
import type { MembershipStatus } from "@/lib/domain/membership";
import type { Money } from "@/lib/domain/money";
import type { Permission, Role } from "@/lib/domain/permissions";
import type { Locale } from "@/i18n/config";

export type { DateOnly, Locale, MembershipStatus, Money, Permission, Role };

export type Timestamp = string;
export type Currency = "ETB";
export type Appearance = "LIGHT" | "DARK" | "SYSTEM";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_PAYMENT"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type SortOrder = "asc" | "desc";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Auth & account
// ---------------------------------------------------------------------------

/** Operational gym context every signed-in role needs (sidebar name, today, methods). */
export interface GymContext {
  name: string;
  currency: Currency;
  timezone: string;
  /** Current calendar date in the gym timezone. */
  today: DateOnly;
  expirationWarningDays: number;
  enabledPaymentMethods: PaymentMethod[];
  hasPlans: boolean;
}

export interface AccountPreferences {
  appearance?: Appearance;
  language?: Locale;
}

export interface CurrentAccount {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  appearance: Appearance;
  /** Interface language, saved per staff account. */
  language: Locale;
  mustChangePassword: boolean;
  permissions: Permission[];
}

export interface Session {
  account: CurrentAccount;
  gym: GymContext;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface PasswordPolicy {
  minLength: number;
  requireNumberOrSymbol: boolean;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface Plan {
  id: string;
  name: string;
  price: Money;
  durationDays: number;
  description: string | null;
  isEnabled: boolean;
  /** Members whose current coverage was purchased with this plan. */
  activeMemberCount: number;
  /** True once any purchase references the plan (it can then only be disabled). */
  isReferenced: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlanInput {
  name: string;
  price: Money;
  durationDays: number;
  description: string | null;
  isEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Members & memberships
// ---------------------------------------------------------------------------

/** A purchased coverage period with its purchase-time plan snapshot. */
export interface MembershipPeriod {
  id: string;
  planId: string;
  planName: string;
  durationDays: number;
  price: Money;
  startDate: DateOnly;
  endDate: DateOnly;
  isRenewal: boolean;
  paymentId: string;
  paymentCode: string;
  createdAt: Timestamp;
}

/** Derived membership state; authoritative when returned by the backend. */
export interface MembershipState {
  status: MembershipStatus;
  current: MembershipPeriod | null;
  next: MembershipPeriod | null;
  last: MembershipPeriod | null;
  coverageEnd: DateOnly | null;
  remainingDays: number | null;
  daysUntilStart: number | null;
  hasPaidMembership: boolean;
}

export type Gender = "MALE" | "FEMALE";

export interface MemberSummary {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  photoUrl: string | null;
  isArchived: boolean;
  registrationDate: DateOnly;
  membership: MembershipState;
}

export interface MemberPermittedActions {
  edit: boolean;
  recordPayment: boolean;
  archive: boolean;
  reactivate: boolean;
}

export interface MemberDetail extends MemberSummary {
  gender: Gender | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelationship: string | null;
  address: string | null;
  notes: string | null;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Future paid periods, earliest first. */
  upcoming: MembershipPeriod[];
  paymentCount: number;
  membershipCount: number;
  permittedActions: MemberPermittedActions;
}

export interface MemberInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelationship: string | null;
  address: string | null;
  notes: string | null;
}

/** Status filter; "ACTIVE" includes Expiring Soon (design.md §14). */
export type MembershipStatusFilter = MembershipStatus;

export type MemberSortField = "name" | "memberCode" | "endDate" | "registrationDate";

export interface MemberListQuery extends PageQuery {
  search?: string;
  status?: MembershipStatusFilter;
  planId?: string;
  archived?: boolean;
  sort?: MemberSortField;
  order?: SortOrder;
}

export interface DuplicatePhoneMatch {
  id: string;
  memberCode: string;
  fullName: string;
}

export interface MembershipListQuery extends PageQuery {
  search?: string;
  status?: MembershipStatusFilter;
  planId?: string;
  endFrom?: DateOnly;
  endTo?: DateOnly;
}

export interface MembershipCounts {
  all: number;
  active: number;
  expiringSoon: number;
  expired: number;
  scheduled: number;
  unpaid: number;
}

export interface MembershipList extends Paginated<MemberSummary> {
  counts: MembershipCounts;
}

export interface MemberMembershipHistoryItem extends MembershipPeriod {
  /** Status of this period relative to today. */
  periodStatus: "CURRENT" | "UPCOMING" | "ENDED";
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface StaffRef {
  id: string;
  fullName: string;
}

export interface PaymentSummary {
  id: string;
  paymentCode: string;
  member: { id: string; memberCode: string; fullName: string; photoUrl: string | null };
  plan: { id: string; name: string; durationDays: number };
  amount: Money;
  currency: Currency;
  method: PaymentMethod;
  receivedDate: DateOnly;
  reference: string | null;
  recordedBy: StaffRef;
  createdAt: Timestamp;
}

export interface PaymentDetail extends PaymentSummary {
  notes: string | null;
  member: PaymentSummary["member"] & { phone: string; email: string | null; isArchived: boolean };
  membership: {
    id: string;
    planName: string;
    durationDays: number;
    price: Money;
    startDate: DateOnly;
    endDate: DateOnly;
    isRenewal: boolean;
  };
}

export interface Receipt {
  gym: { name: string; address: string | null; phone: string | null; email: string | null; logoUrl: string | null };
  payment: PaymentDetail;
}

export type PaymentSortField = "receivedDate" | "amount" | "createdAt";

export interface PaymentListQuery extends PageQuery {
  search?: string;
  from?: DateOnly;
  to?: DateOnly;
  method?: PaymentMethod;
  planId?: string;
  memberId?: string;
  sort?: PaymentSortField;
  order?: SortOrder;
}

export interface PaymentList extends Paginated<PaymentSummary> {
  /** Present for administrators only. */
  summary: { totalRevenue: Money; transactions: number } | null;
}

export interface PaymentPreviewRequest {
  memberId: string;
  planId: string;
  requestedStartDate?: DateOnly;
}

export interface PaymentPreview {
  member: MemberSummary;
  plan: { id: string; name: string; durationDays: number; price: Money };
  amount: Money;
  currency: Currency;
  startDate: DateOnly;
  endDate: DateOnly;
  /** Continuous renewal: the start date is fixed by existing coverage. */
  startIsAutomatic: boolean;
  /** Earliest start staff may choose when the start is editable. */
  minStartDate: DateOnly;
  isRenewal: boolean;
  /** Current and scheduled periods, shown so staff can see there is no overlap. */
  existingCoverage: MembershipPeriod[];
  previewFingerprint: string;
}

export interface RecordPaymentRequest {
  memberId: string;
  planId: string;
  paymentMethod: PaymentMethod;
  receivedDate: DateOnly;
  requestedStartDate?: DateOnly;
  reference: string | null;
  notes: string | null;
  previewFingerprint: string;
}

export interface RecordPaymentResult {
  payment: PaymentDetail;
  /** True when the server returned an already-recorded result for the same operation key. */
  replayed: boolean;
}

// ---------------------------------------------------------------------------
// Dashboard & reports
// ---------------------------------------------------------------------------

export interface RevenuePoint {
  date: DateOnly;
  amount: Money;
  transactions: number;
}

export interface Dashboard {
  today: DateOnly;
  counts: MembershipCounts;
  expiringSoon: MemberSummary[];
  recentPayments: PaymentSummary[];
  hasPlans: boolean;
  hasMembers: boolean;
  /** Administrator-only gym-wide revenue. */
  revenue: {
    today: { amount: Money; transactions: number };
    month: { from: DateOnly; to: DateOnly; amount: Money; transactions: number };
    last30Days: RevenuePoint[];
  } | null;
}

export interface DateRangeQuery {
  from: DateOnly;
  to: DateOnly;
}

export interface RevenueReport {
  from: DateOnly;
  to: DateOnly;
  totalRevenue: Money;
  transactions: number;
  averagePayment: Money;
  series: RevenuePoint[];
  byPlan: { planId: string; planName: string; durationDays: number; transactions: number; revenue: Money }[];
  byMethod: { method: PaymentMethod; transactions: number; revenue: Money }[];
  generatedAt: Timestamp;
}

export interface MembershipReport {
  from: DateOnly;
  to: DateOnly;
  newRegistrations: number;
  renewals: number;
  firstPurchases: number;
  current: { asOf: DateOnly } & Omit<MembershipCounts, "all">;
  generatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Staff & settings
// ---------------------------------------------------------------------------

export interface StaffAccount {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastSignInAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface CreateStaffRequest {
  fullName: string;
  email: string;
  role: Role;
  temporaryPassword: string;
}

export interface UpdateStaffRequest {
  fullName: string;
  role: Role;
}

export interface GymSettings {
  gymName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  currency: Currency;
  timezone: string;
  expirationWarningDays: number;
  enabledPaymentMethods: PaymentMethod[];
  updatedAt: Timestamp;
  updatedBy: StaffRef | null;
}

export type GymSettingsUpdate = Partial<
  Pick<
    GymSettings,
    "gymName" | "phone" | "email" | "address" | "logoUrl" | "expirationWarningDays" | "enabledPaymentMethods"
  >
>;
