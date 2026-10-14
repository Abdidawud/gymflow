/**
 * In-browser mock of the GymFlow backend. It implements the same contract and
 * business rules described in backend-database-system-design.md so the UI can
 * be built and reviewed before the real backend exists:
 *
 * - session cookie (simulated in localStorage) with 12 h lifetime and 30 min idle timeout;
 * - role checks on every call, forced first-login password change;
 * - derived membership status, gap-free renewals, overlap conflicts;
 * - atomic, idempotent payment recording with stale-preview detection;
 * - last-administrator protection, generic password-recovery responses.
 *
 * Testing hooks (browser console):
 *   window.__gymflowMock.failNextPayment = "after-commit"   // lost response after saving
 *   window.__gymflowMock.failNextPayment = "before-commit"  // server error, nothing saved
 *   window.__gymflowMock.reset()                            // restore the demo dataset
 */

import { addDays, daysBetween, eachDay, isDateOnly, type DateOnly } from "@gymflow/shared/domain/dates";
import { startOfEthiopianMonth } from "@gymflow/shared/domain/ethiopian-calendar";
import {
  evaluateMembership,
  findOverlap,
  MAX_ADVANCE_DAYS,
  MAX_BACKDATE_DAYS,
  membershipEndDate,
  proposeStartDate,
} from "@gymflow/shared/domain/membership";
import { averageMoney, fromCents, parsePriceInput, sumMoney, toCents } from "@gymflow/shared/domain/money";
import { meetsPasswordPolicy } from "@gymflow/shared/domain/password";
import { ROLE_PERMISSIONS, type Permission } from "@gymflow/shared/domain/permissions";

const countStatuses = (rows: MemberSummary[]) => countStatusList(rows.map((row) => row.membership.status));
import {
  compareByAttention,
  countStatuses as countStatusList,
  displayPeriod,
  matchesMemberSearch,
  matchesStatusFilter as matchesStatus,
  paginate,
  sortMembers,
} from "@gymflow/shared/domain/member-list";
import { normalizeEthiopianPhone } from "@gymflow/shared/domain/phone";
import type { GymFlowApi } from "../contract";
import { ApiError, type ApiErrorCode } from "../errors";
import {
  PAYMENT_METHODS,
  type CurrentAccount,
  type Dashboard,
  type GymContext,
  type GymSettings,
  type MemberDetail,
  type MemberInput,
  type MemberMembershipHistoryItem,
  type MembershipPeriod,
  type MembershipState,
  type MemberSummary,
  type PaymentDetail,
  type PaymentMethod,
  type PaymentPreview,
  type PaymentPreviewRequest,
  type PaymentSummary,
  type Plan,
  type PlanInput,
  type RecordPaymentRequest,
  type RevenuePoint,
  type Session,
  type StaffAccount,
} from "@gymflow/shared/api/types";
import { isLocale, readStoredLocale } from "@/i18n/config";
import { getTranslator } from "@/i18n/translator";
import type { MessageKey, MessageValues } from "@/i18n/types";
import { mockNow, mockToday } from "./clock";
import {
  clearSavedDatabase,
  createDatabase,
  loadDatabase,
  onExternalChange,
  saveDatabase,
  type MemberRecord,
  type MembershipRecord,
  type MockDatabase,
  type PaymentRecord,
  type PlanRecord,
  type StaffRecord,
} from "./db";

const SESSION_STORAGE_KEY = "gymflow:mock-session";
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const RESET_TOKEN_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

export interface MockControls {
  failNextPayment: null | "before-commit" | "after-commit";
  reset(): void;
}

declare global {
  interface Window {
    __gymflowMock?: MockControls;
  }
}

interface Index {
  memberById: Map<string, MemberRecord>;
  planById: Map<string, PlanRecord>;
  staffById: Map<string, StaffRecord>;
  membershipById: Map<string, MembershipRecord>;
  periodsByMember: Map<string, MembershipRecord[]>;
  paymentById: Map<string, PaymentRecord>;
  paymentByMembership: Map<string, PaymentRecord>;
  paymentsByMember: Map<string, PaymentRecord[]>;
}

function buildIndex(db: MockDatabase): Index {
  const index: Index = {
    memberById: new Map(db.members.map((m) => [m.id, m])),
    planById: new Map(db.plans.map((p) => [p.id, p])),
    staffById: new Map(db.staff.map((s) => [s.id, s])),
    membershipById: new Map(db.memberships.map((m) => [m.id, m])),
    periodsByMember: new Map(),
    paymentById: new Map(db.payments.map((p) => [p.id, p])),
    paymentByMembership: new Map(db.payments.map((p) => [p.membershipId, p])),
    paymentsByMember: new Map(),
  };
  for (const membership of db.memberships) {
    const list = index.periodsByMember.get(membership.memberId) ?? [];
    list.push(membership);
    index.periodsByMember.set(membership.memberId, list);
  }
  for (const list of index.periodsByMember.values()) list.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  for (const payment of db.payments) {
    const list = index.paymentsByMember.get(payment.memberId) ?? [];
    list.push(payment);
    index.paymentsByMember.set(payment.memberId, list);
  }
  for (const list of index.paymentsByMember.values()) list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return index;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Messages follow the request language (Accept-Language), as the real backend's will. */
function msg(key: MessageKey, values?: MessageValues): string {
  return getTranslator(readStoredLocale()).t(key, values);
}

function msgDate(date: DateOnly): string {
  return getTranslator(readStoredLocale()).f.date(date);
}

function fail(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra: { fieldErrors?: Record<string, string>; details?: Record<string, unknown> } = {},
): never {
  throw new ApiError({ status, code, message, ...extra, requestId: `mock-${Math.random().toString(36).slice(2, 10)}` });
}

function invalid(fieldErrors: Record<string, string>): never {
  return fail(422, "VALIDATION_FAILED", msg("api.checkFields"), { fieldErrors });
}

function latency(min = 160, max = 420): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
}

function newId(): string {
  return crypto.randomUUID();
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** FNV-1a: stable fingerprints for previews and idempotent requests. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function clean(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function cleanMultiline(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function readToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(SESSION_STORAGE_KEY, token);
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Blocked storage: the session lasts for this page only.
  }
}

async function readImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    invalid({ photo: msg("api.photoType") });
  }
  if (file.size > PHOTO_MAX_BYTES) invalid({ photo: msg("api.photoSize") });

  // Verify the actual file content, not just the declared type (backend design §12).
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isWebp =
    String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) invalid({ photo: msg("api.photoInvalid") });

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return invalid({ photo: msg("api.photoUnreadable") });
  }
}

// ---------------------------------------------------------------------------
// The mock server
// ---------------------------------------------------------------------------

export function createMockApi(): GymFlowApi {
  let db: MockDatabase = loadDatabase() ?? createDatabase();
  let index = buildIndex(db);
  saveDatabase(db);

  const controls: MockControls = {
    failNextPayment: null,
    reset() {
      clearSavedDatabase();
      writeToken(null);
      db = createDatabase();
      index = buildIndex(db);
      saveDatabase(db);
      // A full reload guarantees no cached data from the old dataset survives.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    },
  };
  if (typeof window !== "undefined") window.__gymflowMock = controls;
  onExternalChange((next) => {
    db = next;
    index = buildIndex(db);
  });

  const commit = () => {
    index = buildIndex(db);
    saveDatabase(db);
  };

  const today = () => mockToday();
  const warningDays = () => db.settings.expirationWarningDays;

  // ----- Authentication ------------------------------------------------------

  function authenticate(options: { allowPasswordChange?: boolean } = {}): StaffRecord {
    const token = readToken();
    if (!token) fail(401, "UNAUTHENTICATED", msg("api.unauthenticated"));
    const session = db.sessions.find((s) => s.token === token);
    if (!session) fail(401, "SESSION_EXPIRED", msg("api.sessionExpired"));

    const now = Date.now();
    if (now > session.expiresAt || now - session.lastSeenAt > SESSION_IDLE_MS) {
      db.sessions = db.sessions.filter((s) => s !== session);
      writeToken(null);
      commit();
      fail(401, "SESSION_EXPIRED", msg("api.sessionExpired"));
    }
    const staff = index.staffById.get(session.staffId);
    if (!staff || !staff.isActive) {
      db.sessions = db.sessions.filter((s) => s !== session);
      writeToken(null);
      commit();
      fail(401, "ACCOUNT_DEACTIVATED", msg("api.deactivated"));
    }
    if (staff.mustChangePassword && !options.allowPasswordChange) {
      fail(403, "PASSWORD_CHANGE_REQUIRED", msg("api.passwordChangeRequired"));
    }
    if (now - session.lastSeenAt > 60_000) {
      session.lastSeenAt = now;
      saveDatabase(db, { defer: true });
    }
    return staff;
  }

  function permissionsOf(staff: StaffRecord): Permission[] {
    return [...ROLE_PERMISSIONS[staff.role]];
  }

  function requirePermission(staff: StaffRecord, permission: Permission): void {
    if (!permissionsOf(staff).includes(permission)) {
      fail(403, "FORBIDDEN", msg("api.forbidden"));
    }
  }

  function accountDto(staff: StaffRecord): CurrentAccount {
    return {
      id: staff.id,
      fullName: staff.fullName,
      email: staff.email,
      role: staff.role,
      appearance: staff.appearance,
      language: staff.language,
      mustChangePassword: staff.mustChangePassword,
      isSuperAdmin: staff.isSuperAdmin,
      permissions: permissionsOf(staff),
    };
  }

  function gymContext(): GymContext {
    return {
      name: db.settings.gymName,
      currency: "ETB",
      timezone: "Africa/Addis_Ababa",
      today: today(),
      expirationWarningDays: warningDays(),
      enabledPaymentMethods: [...db.settings.enabledPaymentMethods],
      hasPlans: db.plans.some((p) => p.isEnabled),
    };
  }

  function sessionDto(staff: StaffRecord): Session {
    return { account: accountDto(staff), gym: gymContext() };
  }

  function staffDto(staff: StaffRecord): StaffAccount {
    return {
      id: staff.id,
      fullName: staff.fullName,
      email: staff.email,
      role: staff.role,
      isActive: staff.isActive,
      mustChangePassword: staff.mustChangePassword,
      isSuperAdmin: staff.isSuperAdmin,
      lastSignInAt: staff.lastSignInAt,
      createdAt: staff.createdAt,
    };
  }

  function revokeSessions(staffId: string, keepToken?: string | null) {
    db.sessions = db.sessions.filter((s) => s.staffId !== staffId || s.token === keepToken);
  }

  function validateNewPassword(password: string, field: string): void {
    if (!meetsPasswordPolicy(password)) {
      invalid({ [field]: msg("common.validation.passwordPolicy") });
    }
  }

  // ----- Membership DTOs -------------------------------------------------------

  function periodDto(membership: MembershipRecord): MembershipPeriod {
    const payment = index.paymentByMembership.get(membership.id);
    return {
      id: membership.id,
      planId: membership.planId,
      planName: membership.planNameSnapshot,
      durationDays: membership.durationDaysSnapshot,
      price: membership.priceSnapshot,
      startDate: membership.startDate,
      endDate: membership.endDate,
      isRenewal: membership.isRenewal,
      paymentId: payment?.id ?? "",
      paymentCode: payment?.paymentCode ?? "",
      createdAt: membership.createdAt,
    };
  }

  function stateFor(memberId: string): MembershipState {
    const periods = index.periodsByMember.get(memberId) ?? [];
    const e = evaluateMembership(periods, today(), warningDays());
    return {
      status: e.status,
      current: e.current ? periodDto(e.current) : null,
      next: e.next ? periodDto(e.next) : null,
      last: e.last ? periodDto(e.last) : null,
      coverageEnd: e.coverageEnd,
      remainingDays: e.remainingDays,
      daysUntilStart: e.daysUntilStart,
      hasPaidMembership: e.hasPaidMembership,
    };
  }

  function memberSummary(member: MemberRecord): MemberSummary {
    return {
      id: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      fullName: `${member.firstName} ${member.lastName}`,
      phone: member.phone,
      email: member.email,
      photoUrl: member.photoUrl,
      isArchived: member.isArchived,
      registrationDate: member.registrationDate,
      membership: stateFor(member.id),
    };
  }

  function memberDetail(member: MemberRecord, staff: StaffRecord): MemberDetail {
    const canArchive = permissionsOf(staff).includes("members.archive");
    const periods = index.periodsByMember.get(member.id) ?? [];
    return {
      ...memberSummary(member),
      gender: member.gender,
      emergencyName: member.emergencyName,
      emergencyPhone: member.emergencyPhone,
      emergencyRelationship: member.emergencyRelationship,
      address: member.address,
      notes: member.notes,
      archivedAt: member.archivedAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      upcoming: periods.filter((p) => p.startDate > today()).map(periodDto),
      paymentCount: index.paymentsByMember.get(member.id)?.length ?? 0,
      membershipCount: periods.length,
      permittedActions: {
        edit: true,
        recordPayment: !member.isArchived && db.plans.some((p) => p.isEnabled),
        archive: canArchive && !member.isArchived,
        reactivate: canArchive && member.isArchived,
      },
    };
  }

  function getMember(id: string): MemberRecord {
    const member = index.memberById.get(id);
    if (!member) fail(404, "NOT_FOUND", msg("api.notFound"));
    return member;
  }

  // ----- Payments DTOs -----------------------------------------------------------

  function paymentSummary(payment: PaymentRecord): PaymentSummary {
    const member = index.memberById.get(payment.memberId)!;
    const membership = index.membershipById.get(payment.membershipId)!;
    const recorder = index.staffById.get(payment.recordedBy);
    return {
      id: payment.id,
      paymentCode: payment.paymentCode,
      member: {
        id: member.id,
        memberCode: member.memberCode,
        fullName: `${member.firstName} ${member.lastName}`,
        photoUrl: member.photoUrl,
      },
      plan: { id: membership.planId, name: membership.planNameSnapshot, durationDays: membership.durationDaysSnapshot },
      amount: payment.amount,
      currency: "ETB",
      method: payment.method,
      receivedDate: payment.receivedDate,
      reference: payment.reference,
      recordedBy: { id: payment.recordedBy, fullName: recorder?.fullName ?? msg("api.formerStaff") },
      createdAt: payment.createdAt,
    };
  }

  function paymentDetail(payment: PaymentRecord): PaymentDetail {
    const summary = paymentSummary(payment);
    const member = index.memberById.get(payment.memberId)!;
    const membership = index.membershipById.get(payment.membershipId)!;
    return {
      ...summary,
      notes: payment.notes,
      member: { ...summary.member, phone: member.phone, email: member.email, isArchived: member.isArchived },
      membership: {
        id: membership.id,
        planName: membership.planNameSnapshot,
        durationDays: membership.durationDaysSnapshot,
        price: membership.priceSnapshot,
        startDate: membership.startDate,
        endDate: membership.endDate,
        isRenewal: membership.isRenewal,
      },
    };
  }

  function getPayment(id: string): PaymentRecord {
    const payment = index.paymentById.get(id);
    if (!payment) fail(404, "NOT_FOUND", msg("api.notFound"));
    return payment;
  }

  function revenueSeries(from: DateOnly, to: DateOnly): RevenuePoint[] {
    const byDay = new Map<DateOnly, { cents: number; count: number }>();
    for (const payment of db.payments) {
      if (payment.receivedDate < from || payment.receivedDate > to) continue;
      const entry = byDay.get(payment.receivedDate) ?? { cents: 0, count: 0 };
      entry.cents += toCents(payment.amount);
      entry.count++;
      byDay.set(payment.receivedDate, entry);
    }
    return eachDay(from, to).map((date) => {
      const entry = byDay.get(date);
      return { date, amount: fromCents(entry?.cents ?? 0), transactions: entry?.count ?? 0 };
    });
  }

  function paymentsInRange(from: DateOnly, to: DateOnly): PaymentRecord[] {
    return db.payments.filter((p) => p.receivedDate >= from && p.receivedDate <= to);
  }

  function validateRange(from: DateOnly, to: DateOnly): void {
    if (!isDateOnly(from) || !isDateOnly(to)) invalid({ from: msg("api.validDates") });
    if (from > to) invalid({ from: msg("common.validation.fromAfterTo") });
    if (daysBetween(from, to) > 366) invalid({ from: msg("reports.errors.tooLong") });
  }

  // ----- Plans ---------------------------------------------------------------------

  function planDto(plan: PlanRecord): Plan {
    let activeMemberCount = 0;
    for (const member of db.members) {
      if (member.isArchived) continue;
      const state = stateFor(member.id);
      if (state.current?.planId === plan.id) activeMemberCount++;
    }
    return {
      id: plan.id,
      name: plan.name,
      price: plan.price,
      durationDays: plan.durationDays,
      description: plan.description,
      isEnabled: plan.isEnabled,
      activeMemberCount,
      isReferenced: db.memberships.some((m) => m.planId === plan.id),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  function validatePlan(input: PlanInput, excludeId?: string): PlanInput {
    const errors: Record<string, string> = {};
    const name = clean(input.name);
    if (!name) errors.name = msg("plans.dialog.errors.name");
    else if (name.length > 60) errors.name = msg("common.validation.maxLength", { max: 60 });
    else if (db.plans.some((p) => p.id !== excludeId && p.name.toLowerCase() === name.toLowerCase())) {
      errors.name = msg("plans.dialog.errors.nameTaken");
    }
    const price = parsePriceInput(String(input.price ?? ""));
    if (!price) errors.price = msg("plans.dialog.errors.priceInvalid");
    const duration = Number(input.durationDays);
    if (!Number.isInteger(duration) || duration < 1 || duration > 3650) {
      errors.durationDays = msg("plans.dialog.errors.durationInvalid");
    }
    const description = cleanMultiline(input.description);
    if (description && description.length > 280) errors.description = msg("common.validation.maxLength", { max: 280 });
    if (Object.keys(errors).length > 0) {
      if (errors.name?.startsWith("A plan")) fail(409, "DUPLICATE_PLAN_NAME", errors.name, { fieldErrors: errors });
      invalid(errors);
    }
    return { name: name!, price: price!, durationDays: duration, description, isEnabled: Boolean(input.isEnabled) };
  }

  // ----- Members ---------------------------------------------------------------------

  function validateMember(input: MemberInput, excludeId?: string): MemberInput {
    const errors: Record<string, string> = {};
    const firstName = clean(input.firstName);
    const lastName = clean(input.lastName);
    if (!firstName) errors.firstName = msg("members.form.errors.firstName");
    else if (firstName.length > 60) errors.firstName = msg("common.validation.maxLength", { max: 60 });
    if (!lastName) errors.lastName = msg("members.form.errors.lastName");
    else if (lastName.length > 60) errors.lastName = msg("common.validation.maxLength", { max: 60 });

    const phone = normalizeEthiopianPhone(input.phone ?? "");
    if (!phone) errors.phone = msg("common.validation.mobileInvalid");

    const email = clean(input.email)?.toLowerCase() ?? null;
    if (email && (!EMAIL_RE.test(email) || email.length > 254)) errors.email = msg("common.validation.emailInvalid");

    const emergencyName = clean(input.emergencyName);
    const emergencyPhoneRaw = clean(input.emergencyPhone);
    const emergencyPhone = emergencyPhoneRaw ? normalizeEthiopianPhone(emergencyPhoneRaw, "any") : null;
    if (emergencyName && !emergencyPhoneRaw) errors.emergencyPhone = msg("members.form.errors.emergencyPhone");
    if (emergencyPhoneRaw && !emergencyName) errors.emergencyName = msg("members.form.errors.emergencyName");
    if (emergencyPhoneRaw && !emergencyPhone) errors.emergencyPhone = msg("common.validation.phoneInvalid");

    const relationship = clean(input.emergencyRelationship);
    const address = clean(input.address);
    if (address && address.length > 200) errors.address = msg("common.validation.maxLength", { max: 200 });
    const notes = cleanMultiline(input.notes);
    if (notes && notes.length > 1000) errors.notes = msg("common.validation.maxLength", { max: 1000 });
    if (input.gender !== null && input.gender !== "MALE" && input.gender !== "FEMALE") {
      errors.gender = msg("api.validOption");
    }

    if (Object.keys(errors).length > 0) invalid(errors);

    const duplicate = db.members.find((m) => m.phone === phone && m.id !== excludeId);
    if (duplicate) {
      fail(409, "DUPLICATE_PHONE", msg("api.duplicatePhone"), {
        fieldErrors: {
          phone: msg("api.duplicatePhoneField", {
            name: `${duplicate.firstName} ${duplicate.lastName}`,
            code: duplicate.memberCode,
          }),
        },
        details: {
          member: {
            id: duplicate.id,
            memberCode: duplicate.memberCode,
            fullName: `${duplicate.firstName} ${duplicate.lastName}`,
          },
        },
      });
    }

    return {
      firstName: firstName!,
      lastName: lastName!,
      phone: phone!,
      email,
      gender: input.gender,
      emergencyName,
      emergencyPhone,
      emergencyRelationship: relationship,
      address,
      notes,
    };
  }

  // ----- Payment preview ---------------------------------------------------------------

  interface ComputedPreview extends PaymentPreview {
    planRecord: PlanRecord;
  }

  function computePreview(input: PaymentPreviewRequest): ComputedPreview {
    const member = getMember(input.memberId);
    if (member.isArchived) {
      fail(422, "MEMBER_ARCHIVED", msg("api.memberArchived"));
    }
    const plan = index.planById.get(input.planId);
    if (!plan) fail(404, "NOT_FOUND", msg("api.planNotFound"));
    if (!plan.isEnabled) {
      fail(422, "PLAN_DISABLED", msg("api.planDisabled"), {
        fieldErrors: { planId: msg("api.chooseEnabledPlan") },
      });
    }

    const periods = index.periodsByMember.get(member.id) ?? [];
    const proposed = proposeStartDate(periods, today());
    let startDate = proposed.startDate;
    if (!proposed.automatic && input.requestedStartDate) {
      if (!isDateOnly(input.requestedStartDate)) invalid({ requestedStartDate: msg("api.validStartDate") });
      if (input.requestedStartDate < addDays(today(), -MAX_BACKDATE_DAYS)) {
        invalid({ requestedStartDate: msg("api.startTooEarly") });
      }
      if (daysBetween(today(), input.requestedStartDate) > MAX_ADVANCE_DAYS) {
        invalid({ requestedStartDate: msg("api.startTooFar") });
      }
      startDate = input.requestedStartDate;
    }
    const endDate = membershipEndDate(startDate, plan.durationDays);

    const overlap = findOverlap(periods, startDate, endDate);
    if (overlap) {
      const suggested = addDays(overlap.endDate, 1);
      fail(
        409,
        "DATE_CONFLICT",
        msg("api.overlap", { start: msgDate(overlap.startDate), end: msgDate(overlap.endDate) }),
        {
          fieldErrors: {
            requestedStartDate: msg("api.overlapField", {
              start: msgDate(overlap.startDate),
              end: msgDate(overlap.endDate),
              suggested: msgDate(suggested),
            }),
          },
          details: { conflictStart: overlap.startDate, conflictEnd: overlap.endDate, suggestedStart: suggested },
        },
      );
    }

    const existingCoverage = periods.filter((p) => p.endDate >= today()).map(periodDto);
    const previewFingerprint = fingerprint({
      memberId: member.id,
      planId: plan.id,
      price: plan.price,
      durationDays: plan.durationDays,
      startDate,
      endDate,
      automatic: proposed.automatic,
      coverage: periods.map((p) => [p.id, p.startDate, p.endDate]),
    });

    return {
      member: memberSummary(member),
      plan: { id: plan.id, name: plan.name, durationDays: plan.durationDays, price: plan.price },
      amount: plan.price,
      currency: "ETB",
      startDate,
      endDate,
      startIsAutomatic: proposed.automatic,
      minStartDate: proposed.automatic ? startDate : addDays(today(), -MAX_BACKDATE_DAYS),
      isRenewal: periods.length > 0,
      existingCoverage,
      previewFingerprint,
      planRecord: plan,
    };
  }

  function validatePaymentFields(input: RecordPaymentRequest): { reference: string | null; notes: string | null } {
    const errors: Record<string, string> = {};
    if (!PAYMENT_METHODS.includes(input.paymentMethod)) errors.paymentMethod = msg("api.choosePaymentMethod");
    else if (!db.settings.enabledPaymentMethods.includes(input.paymentMethod)) {
      fail(422, "PAYMENT_METHOD_DISABLED", msg("api.methodDisabled"), {
        fieldErrors: { paymentMethod: msg("api.chooseEnabledMethod") },
      });
    }
    if (!isDateOnly(input.receivedDate)) errors.receivedDate = msg("payments.drawer.errors.date");
    else if (input.receivedDate > today()) errors.receivedDate = msg("payments.drawer.errors.futureDate");

    const reference = clean(input.reference);
    if (input.paymentMethod !== "CASH" && !reference) {
      errors.reference = msg("payments.drawer.errors.reference");
    }
    if (reference && reference.length > 64) errors.reference = msg("common.validation.maxLength", { max: 64 });
    const notes = cleanMultiline(input.notes);
    if (notes && notes.length > 500) errors.notes = msg("common.validation.maxLength", { max: 500 });
    if (Object.keys(errors).length > 0) invalid(errors);
    return { reference, notes };
  }

  // ---------------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------------

  return {
    auth: {
      async session() {
        await latency(120, 260);
        return sessionDto(authenticate({ allowPasswordChange: true }));
      },

      async login({ email, password }) {
        await latency(450, 800);
        const normalized = (email ?? "").trim().toLowerCase();
        const now = Date.now();
        db.failedLogins = db.failedLogins.filter((f) => now - f.at < LOGIN_WINDOW_MS);
        if (db.failedLogins.filter((f) => f.email === normalized).length >= LOGIN_MAX_FAILURES) {
          fail(429, "RATE_LIMITED", msg("api.rateLimited"));
        }
        const staff = db.staff.find((s) => s.email.toLowerCase() === normalized);
        if (!staff || staff.password !== password) {
          db.failedLogins.push({ email: normalized, at: now });
          saveDatabase(db);
          fail(401, "INVALID_CREDENTIALS", msg("auth.login.invalid"));
        }
        if (!staff.isActive) {
          fail(401, "ACCOUNT_DEACTIVATED", msg("api.deactivated"));
        }
        const token = newToken();
        db.sessions.push({
          token,
          staffId: staff.id,
          createdAt: now,
          lastSeenAt: now,
          expiresAt: now + SESSION_MAX_MS,
        });
        db.failedLogins = db.failedLogins.filter((f) => f.email !== normalized);
        staff.lastSignInAt = mockNow();
        writeToken(token);
        commit();
        return sessionDto(staff);
      },

      async logout() {
        await latency(80, 160);
        const token = readToken();
        db.sessions = db.sessions.filter((s) => s.token !== token);
        writeToken(null);
        commit();
      },

      async forgotPassword(email) {
        await latency(500, 900);
        const staff = db.staff.find((s) => s.email.toLowerCase() === (email ?? "").trim().toLowerCase());
        if (staff && staff.isActive) {
          const token = newToken();
          db.resetTokens.push({ token, staffId: staff.id, expiresAt: Date.now() + RESET_TOKEN_MS, consumedAt: null });
          commit();
          // A real backend emails this link; the mock exposes it for testing only.
          const link = `${window.location.origin}/reset-password?token=${token}`;
          console.info(`[GymFlow mock] Password reset link for ${staff.email}: ${link}`);
          try {
            window.sessionStorage.setItem("gymflow:mock-last-reset-link", link);
          } catch {
            // Ignore blocked storage.
          }
        }
        // Same response whether or not the account exists.
      },

      async resetPassword({ token, newPassword }) {
        await latency(400, 700);
        const record = db.resetTokens.find((t) => t.token === token);
        if (!record || record.consumedAt !== null || Date.now() > record.expiresAt) {
          fail(400, "INVALID_RESET_TOKEN", msg("api.invalidResetToken"));
        }
        validateNewPassword(newPassword, "newPassword");
        const staff = index.staffById.get(record.staffId);
        if (!staff || !staff.isActive) {
          fail(400, "INVALID_RESET_TOKEN", msg("api.invalidResetToken"));
        }
        staff.password = newPassword;
        staff.mustChangePassword = false;
        staff.updatedAt = mockNow();
        record.consumedAt = Date.now();
        revokeSessions(staff.id);
        writeToken(null);
        commit();
      },
    },

    account: {
      async changePassword({ currentPassword, newPassword }) {
        await latency(400, 700);
        const staff = authenticate({ allowPasswordChange: true });
        if (staff.password !== currentPassword) {
          fail(422, "INVALID_CURRENT_PASSWORD", msg("api.currentPasswordWrong"), {
            fieldErrors: { currentPassword: msg("api.currentPasswordWrong") },
          });
        }
        validateNewPassword(newPassword, "newPassword");
        if (newPassword === currentPassword) {
          invalid({ newPassword: msg("account.password.errors.same") });
        }
        staff.password = newPassword;
        staff.mustChangePassword = false;
        staff.updatedAt = mockNow();
        revokeSessions(staff.id, readToken());
        commit();
      },

      async updatePreferences({ appearance, language }) {
        await latency(80, 160);
        const staff = authenticate({ allowPasswordChange: true });
        if (appearance !== undefined) {
          if (!["LIGHT", "DARK", "SYSTEM"].includes(appearance)) invalid({ appearance: msg("api.chooseAppearance") });
          staff.appearance = appearance;
        }
        if (language !== undefined) {
          if (!isLocale(language)) invalid({ language: msg("api.chooseLanguage") });
          staff.language = language;
        }
        commit();
        return accountDto(staff);
      },
    },

    members: {
      async list(query) {
        await latency(140, 320);
        authenticate();
        const archived = query.archived === true;
        let rows = db.members
          .filter((m) => m.isArchived === archived && matchesMemberSearch(m, query.search))
          .map(memberSummary)
          .filter((row) => matchesStatus(row.membership.status, query.status))
          .filter((row) => !query.planId || displayPeriod(row.membership)?.planId === query.planId);

        rows = sortMembers(rows, query.sort, query.order);
        return paginate(rows, query.page, query.pageSize);
      },

      async findByPhone(phone, excludeId) {
        await latency(120, 220);
        authenticate();
        const normalized = normalizeEthiopianPhone(phone);
        if (!normalized) return null;
        const match = db.members.find((m) => m.phone === normalized && m.id !== excludeId);
        return match
          ? { id: match.id, memberCode: match.memberCode, fullName: `${match.firstName} ${match.lastName}` }
          : null;
      },

      async get(id) {
        await latency();
        const staff = authenticate();
        return memberDetail(getMember(id), staff);
      },

      async create(input) {
        await latency(450, 800);
        const staff = authenticate();
        const data = validateMember(input);
        db.counters.member += 1;
        const timestamp = mockNow();
        const member: MemberRecord = {
          id: newId(),
          memberCode: `GYM-${String(db.counters.member).padStart(5, "0")}`,
          ...data,
          photoUrl: null,
          isArchived: false,
          archivedAt: null,
          registrationDate: today(),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        db.members.push(member);
        commit();
        return memberDetail(member, staff);
      },

      async update(id, input) {
        await latency(400, 700);
        const staff = authenticate();
        const member = getMember(id);
        Object.assign(member, validateMember(input, id), { updatedAt: mockNow() });
        commit();
        return memberDetail(member, staff);
      },

      async archive(id) {
        await latency(350, 600);
        const staff = authenticate();
        requirePermission(staff, "members.archive");
        const member = getMember(id);
        member.isArchived = true;
        member.archivedAt = mockNow();
        member.updatedAt = member.archivedAt;
        commit();
        return memberDetail(member, staff);
      },

      async reactivate(id) {
        await latency(350, 600);
        const staff = authenticate();
        requirePermission(staff, "members.archive");
        const member = getMember(id);
        member.isArchived = false;
        member.archivedAt = null;
        member.updatedAt = mockNow();
        commit();
        return memberDetail(member, staff);
      },

      async payments(id, query) {
        await latency();
        authenticate();
        getMember(id);
        const items = (index.paymentsByMember.get(id) ?? []).map(paymentSummary);
        return paginate(items, query.page, query.pageSize ?? 10);
      },

      async memberships(id, query) {
        await latency();
        authenticate();
        getMember(id);
        const t = today();
        const items: MemberMembershipHistoryItem[] = [...(index.periodsByMember.get(id) ?? [])].reverse().map((p) => ({
          ...periodDto(p),
          periodStatus: p.startDate > t ? "UPCOMING" : p.endDate < t ? "ENDED" : "CURRENT",
        }));
        return paginate(items, query.page, query.pageSize ?? 10);
      },

      async uploadPhoto(id, file) {
        await latency(500, 900);
        const staff = authenticate();
        const member = getMember(id);
        member.photoUrl = await readImage(file);
        member.updatedAt = mockNow();
        commit();
        return memberDetail(member, staff);
      },

      async removePhoto(id) {
        await latency(250, 450);
        const staff = authenticate();
        const member = getMember(id);
        member.photoUrl = null;
        member.updatedAt = mockNow();
        commit();
        return memberDetail(member, staff);
      },
    },

    memberships: {
      async list(query) {
        await latency(160, 340);
        authenticate();
        const inEndRange = (row: MemberSummary) => {
          if (!query.endFrom && !query.endTo) return true;
          const period = displayPeriod(row.membership);
          if (!period) return false;
          const end = row.membership.coverageEnd ?? period.endDate;
          return (!query.endFrom || end >= query.endFrom) && (!query.endTo || end <= query.endTo);
        };
        const base = db.members
          .filter((m) => !m.isArchived && matchesMemberSearch(m, query.search))
          .map(memberSummary)
          .filter((row) => !query.planId || displayPeriod(row.membership)?.planId === query.planId)
          .filter(inEndRange);

        const counts = countStatuses(base);
        const rows = base.filter((row) => matchesStatus(row.membership.status, query.status)).sort(compareByAttention);
        return { ...paginate(rows, query.page, query.pageSize), counts };
      },
    },

    plans: {
      async list(options) {
        await latency(120, 260);
        const staff = authenticate();
        const includeDisabled = Boolean(options?.includeDisabled) && permissionsOf(staff).includes("plans.manage");
        return db.plans
          .filter((p) => includeDisabled || p.isEnabled)
          .sort((a, b) => a.durationDays - b.durationDays || a.name.localeCompare(b.name))
          .map(planDto);
      },

      async create(input) {
        await latency(400, 700);
        const staff = authenticate();
        requirePermission(staff, "plans.manage");
        const data = validatePlan(input);
        const timestamp = mockNow();
        const plan: PlanRecord = { id: newId(), ...data, createdAt: timestamp, updatedAt: timestamp };
        db.plans.push(plan);
        commit();
        return planDto(plan);
      },

      async update(id, input) {
        await latency(400, 700);
        const staff = authenticate();
        requirePermission(staff, "plans.manage");
        const plan = index.planById.get(id);
        if (!plan) fail(404, "NOT_FOUND", msg("api.notFound"));
        Object.assign(plan, validatePlan(input, id), { updatedAt: mockNow() });
        commit();
        return planDto(plan);
      },

      async disable(id) {
        await latency(300, 500);
        const staff = authenticate();
        requirePermission(staff, "plans.manage");
        const plan = index.planById.get(id);
        if (!plan) fail(404, "NOT_FOUND", msg("api.notFound"));
        plan.isEnabled = false;
        plan.updatedAt = mockNow();
        commit();
        return planDto(plan);
      },

      async enable(id) {
        await latency(300, 500);
        const staff = authenticate();
        requirePermission(staff, "plans.manage");
        const plan = index.planById.get(id);
        if (!plan) fail(404, "NOT_FOUND", msg("api.notFound"));
        plan.isEnabled = true;
        plan.updatedAt = mockNow();
        commit();
        return planDto(plan);
      },
    },

    payments: {
      async preview(input) {
        await latency(180, 360);
        authenticate();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { planRecord, ...preview } = computePreview(input);
        return preview;
      },

      async record(input, idempotencyKey) {
        await latency(700, 1200);
        const staff = authenticate();
        if (!idempotencyKey) fail(400, "VALIDATION_FAILED", msg("api.missingIdempotencyKey"));

        const requestFingerprint = fingerprint(input);
        const existing = db.idempotency.find((r) => r.staffId === staff.id && r.key === idempotencyKey);
        if (existing) {
          if (existing.fingerprint !== requestFingerprint) {
            fail(409, "IDEMPOTENCY_CONFLICT", msg("api.idempotencyConflict"));
          }
          return { payment: paymentDetail(getPayment(existing.paymentId)), replayed: true };
        }

        const simulated = controls.failNextPayment;
        controls.failNextPayment = null;
        if (simulated === "before-commit") {
          fail(500, "INTERNAL", msg("payments.drawer.failed"));
        }

        const { reference, notes } = validatePaymentFields(input);
        const preview = computePreview({
          memberId: input.memberId,
          planId: input.planId,
          requestedStartDate: input.requestedStartDate,
        });
        if (preview.previewFingerprint !== input.previewFingerprint) {
          fail(409, "STALE_PREVIEW", msg("api.previewChanged"));
        }

        // One atomic write: membership + payment + idempotency record.
        const timestamp = mockNow();
        const membership: MembershipRecord = {
          id: newId(),
          memberId: input.memberId,
          planId: preview.planRecord.id,
          planNameSnapshot: preview.planRecord.name,
          priceSnapshot: preview.planRecord.price,
          durationDaysSnapshot: preview.planRecord.durationDays,
          startDate: preview.startDate,
          endDate: preview.endDate,
          isRenewal: preview.isRenewal,
          createdAt: timestamp,
        };
        db.counters.payment += 1;
        const payment: PaymentRecord = {
          id: newId(),
          paymentCode: `PAY-${String(db.counters.payment).padStart(5, "0")}`,
          memberId: input.memberId,
          membershipId: membership.id,
          amount: preview.planRecord.price,
          currency: "ETB",
          method: input.paymentMethod,
          receivedDate: input.receivedDate,
          reference,
          notes,
          recordedBy: staff.id,
          createdAt: timestamp,
        };
        db.memberships.push(membership);
        db.payments.push(payment);
        db.idempotency.push({
          staffId: staff.id,
          key: idempotencyKey,
          fingerprint: requestFingerprint,
          paymentId: payment.id,
          createdAt: timestamp,
        });
        commit();

        if (simulated === "after-commit") {
          fail(0, "NETWORK_ERROR", msg("common.feedback.networkError"));
        }
        return { payment: paymentDetail(payment), replayed: false };
      },

      async list(query) {
        await latency(160, 340);
        const staff = authenticate();
        const search = (query.search ?? "").trim().toLowerCase();
        const paymentNumber = /^(?:pay)?[\s-]?0*(\d{3,})$/i.exec(search.replace(/\s/g, ""));

        const filtered = db.payments.filter((p) => {
          if (query.from && p.receivedDate < query.from) return false;
          if (query.to && p.receivedDate > query.to) return false;
          if (query.method && p.method !== query.method) return false;
          if (query.memberId && p.memberId !== query.memberId) return false;
          if (query.planId && index.membershipById.get(p.membershipId)?.planId !== query.planId) return false;
          if (!search) return true;
          if (paymentNumber && Number(p.paymentCode.slice(4)) === Number(paymentNumber[1])) return true;
          if (p.reference?.toLowerCase().includes(search)) return true;
          const member = index.memberById.get(p.memberId);
          return member ? matchesMemberSearch(member, search) : false;
        });

        const direction = query.order === "asc" ? 1 : -1;
        const sortField = query.sort ?? "receivedDate";
        filtered.sort((a, b) => {
          const primary =
            sortField === "amount"
              ? toCents(a.amount) - toCents(b.amount)
              : sortField === "createdAt"
                ? a.createdAt.localeCompare(b.createdAt)
                : a.receivedDate.localeCompare(b.receivedDate);
          return direction * (primary || a.createdAt.localeCompare(b.createdAt));
        });

        const page = paginate(filtered, query.page, query.pageSize);
        const summary = permissionsOf(staff).includes("revenue.view")
          ? { totalRevenue: sumMoney(filtered.map((p) => p.amount)), transactions: filtered.length }
          : null;
        return { ...page, items: page.items.map(paymentSummary), summary };
      },

      async get(id) {
        await latency();
        authenticate();
        return paymentDetail(getPayment(id));
      },

      async receipt(id) {
        await latency();
        authenticate();
        return {
          gym: {
            name: db.settings.gymName,
            address: db.settings.address,
            phone: db.settings.phone,
            email: db.settings.email,
            logoUrl: db.settings.logoUrl,
          },
          payment: paymentDetail(getPayment(id)),
        };
      },
    },

    dashboard: {
      async get() {
        await latency(220, 420);
        const staff = authenticate();
        const t = today();
        const rows = db.members.filter((m) => !m.isArchived).map(memberSummary);
        const expiringSoon = rows
          .filter((r) => r.membership.status === "EXPIRING_SOON")
          .sort(
            (a, b) =>
              (a.membership.remainingDays ?? 0) - (b.membership.remainingDays ?? 0) ||
              a.fullName.localeCompare(b.fullName),
          )
          .slice(0, 5);
        const recentPayments = [...db.payments]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 5)
          .map(paymentSummary);

        let revenue: Dashboard["revenue"] = null;
        if (permissionsOf(staff).includes("revenue.view")) {
          const todayPayments = paymentsInRange(t, t);
          // "This month" is the current Ethiopian month.
          const monthFrom = startOfEthiopianMonth(t);
          const monthPayments = paymentsInRange(monthFrom, t);
          revenue = {
            today: { amount: sumMoney(todayPayments.map((p) => p.amount)), transactions: todayPayments.length },
            month: {
              from: monthFrom,
              to: t,
              amount: sumMoney(monthPayments.map((p) => p.amount)),
              transactions: monthPayments.length,
            },
            last30Days: revenueSeries(addDays(t, -29), t),
          };
        }

        return {
          today: t,
          counts: countStatuses(rows),
          expiringSoon,
          recentPayments,
          hasPlans: db.plans.some((p) => p.isEnabled),
          hasMembers: rows.length > 0,
          revenue,
        };
      },
    },

    reports: {
      async revenue({ from, to }) {
        await latency(260, 480);
        const staff = authenticate();
        requirePermission(staff, "reports.view");
        validateRange(from, to);
        const payments = paymentsInRange(from, to);
        const total = sumMoney(payments.map((p) => p.amount));

        const byPlan = new Map<
          string,
          { planId: string; planName: string; durationDays: number; transactions: number; cents: number }
        >();
        const byMethod = new Map<PaymentMethod, { transactions: number; cents: number }>();
        for (const payment of payments) {
          const membership = index.membershipById.get(payment.membershipId)!;
          // Group by purchase-time snapshot so renamed plans don't rewrite history.
          const key = `${membership.planId}|${membership.planNameSnapshot}|${membership.durationDaysSnapshot}`;
          const plan = byPlan.get(key) ?? {
            planId: membership.planId,
            planName: membership.planNameSnapshot,
            durationDays: membership.durationDaysSnapshot,
            transactions: 0,
            cents: 0,
          };
          plan.transactions++;
          plan.cents += toCents(payment.amount);
          byPlan.set(key, plan);

          const method = byMethod.get(payment.method) ?? { transactions: 0, cents: 0 };
          method.transactions++;
          method.cents += toCents(payment.amount);
          byMethod.set(payment.method, method);
        }

        return {
          from,
          to,
          totalRevenue: total,
          transactions: payments.length,
          averagePayment: averageMoney(total, payments.length),
          series: revenueSeries(from, to),
          byPlan: [...byPlan.values()]
            .sort((a, b) => b.cents - a.cents)
            .map(({ cents, ...rest }) => ({ ...rest, revenue: fromCents(cents) })),
          byMethod: [...byMethod.entries()]
            .sort((a, b) => b[1].cents - a[1].cents)
            .map(([method, value]) => ({ method, transactions: value.transactions, revenue: fromCents(value.cents) })),
          generatedAt: mockNow(),
        };
      },

      async memberships({ from, to }) {
        await latency(200, 400);
        const staff = authenticate();
        requirePermission(staff, "reports.view");
        validateRange(from, to);
        let renewals = 0;
        let firstPurchases = 0;
        for (const payment of paymentsInRange(from, to)) {
          if (index.membershipById.get(payment.membershipId)?.isRenewal) renewals++;
          else firstPurchases++;
        }
        const counts = countStatuses(db.members.filter((m) => !m.isArchived).map(memberSummary));
        return {
          from,
          to,
          newRegistrations: db.members.filter((m) => m.registrationDate >= from && m.registrationDate <= to).length,
          renewals,
          firstPurchases,
          current: {
            asOf: today(),
            active: counts.active,
            expiringSoon: counts.expiringSoon,
            expired: counts.expired,
            scheduled: counts.scheduled,
            unpaid: counts.unpaid,
          },
          generatedAt: mockNow(),
        };
      },
    },

    users: {
      async list() {
        await latency();
        const staff = authenticate();
        requirePermission(staff, "staff.manage");
        return [...db.staff]
          .sort(
            (a, b) =>
              Number(b.isSuperAdmin) - Number(a.isSuperAdmin) ||
              Number(b.isActive) - Number(a.isActive) ||
              a.fullName.localeCompare(b.fullName),
          )
          .map(staffDto);
      },

      async create(input) {
        await latency(450, 800);
        const staff = authenticate();
        requirePermission(staff, "staff.manage");
        const errors: Record<string, string> = {};
        const fullName = clean(input.fullName);
        const email = clean(input.email)?.toLowerCase() ?? "";
        if (!fullName) errors.fullName = msg("staff.form.errors.fullName");
        if (!EMAIL_RE.test(email)) errors.email = msg("common.validation.emailInvalid");
        if (input.role !== "ADMINISTRATOR" && input.role !== "RECEPTIONIST") errors.role = msg("api.chooseRole");
        if (!meetsPasswordPolicy(input.temporaryPassword ?? "")) {
          errors.temporaryPassword = msg("common.validation.passwordPolicy");
        }
        if (Object.keys(errors).length > 0) invalid(errors);
        if (db.staff.some((s) => s.email.toLowerCase() === email)) {
          fail(409, "DUPLICATE_EMAIL", msg("api.duplicateEmail"), {
            fieldErrors: { email: msg("api.duplicateEmail") },
          });
        }
        const timestamp = mockNow();
        const record: StaffRecord = {
          id: newId(),
          fullName: fullName!,
          email,
          password: input.temporaryPassword,
          role: input.role,
          isActive: true,
          mustChangePassword: true,
          isSuperAdmin: false,
          appearance: "SYSTEM",
          language: readStoredLocale(),
          lastSignInAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        db.staff.push(record);
        commit();
        return staffDto(record);
      },

      async update(id, input) {
        await latency(400, 700);
        const actor = authenticate();
        requirePermission(actor, "staff.manage");
        const target = index.staffById.get(id);
        if (!target) fail(404, "NOT_FOUND", msg("api.notFound"));
        const fullName = clean(input.fullName);
        if (!fullName) invalid({ fullName: msg("staff.form.errors.fullName") });
        if (input.role !== "ADMINISTRATOR" && input.role !== "RECEPTIONIST") invalid({ role: msg("api.chooseRole") });
        // Only the super administrator can change their account, which always stays an administrator.
        if (target.isSuperAdmin && target.id !== actor.id) fail(403, "FORBIDDEN", msg("api.superAdminProtected"));
        if (target.isSuperAdmin && input.role !== "ADMINISTRATOR") {
          fail(409, "LAST_ADMINISTRATOR", msg("api.superAdminRole"), {
            fieldErrors: { role: msg("api.superAdminRole") },
          });
        }

        const demoting = target.role === "ADMINISTRATOR" && input.role !== "ADMINISTRATOR" && target.isActive;
        const activeAdmins = db.staff.filter((s) => s.role === "ADMINISTRATOR" && s.isActive).length;
        if (demoting && activeAdmins <= 1) {
          fail(409, "LAST_ADMINISTRATOR", msg("api.lastAdmin"), {
            fieldErrors: { role: msg("api.lastAdminField") },
          });
        }
        const roleChanged = target.role !== input.role;
        target.fullName = fullName;
        target.role = input.role;
        target.updatedAt = mockNow();
        // Permission changes take effect immediately (backend design §10).
        if (roleChanged && target.id !== actor.id) revokeSessions(target.id);
        commit();
        return staffDto(target);
      },

      async deactivate(id) {
        await latency(350, 600);
        const actor = authenticate();
        requirePermission(actor, "staff.manage");
        const target = index.staffById.get(id);
        if (!target) fail(404, "NOT_FOUND", msg("api.notFound"));
        if (target.id === actor.id) {
          fail(403, "FORBIDDEN", msg("staff.cantDeactivateSelf"));
        }
        if (target.isSuperAdmin) fail(403, "FORBIDDEN", msg("api.superAdminProtected"));
        const activeAdmins = db.staff.filter((s) => s.role === "ADMINISTRATOR" && s.isActive).length;
        if (target.role === "ADMINISTRATOR" && target.isActive && activeAdmins <= 1) {
          fail(409, "LAST_ADMINISTRATOR", msg("api.lastAdminShort"));
        }
        target.isActive = false;
        target.updatedAt = mockNow();
        revokeSessions(target.id);
        commit();
        return staffDto(target);
      },

      async activate(id) {
        await latency(350, 600);
        const actor = authenticate();
        requirePermission(actor, "staff.manage");
        const target = index.staffById.get(id);
        if (!target) fail(404, "NOT_FOUND", msg("api.notFound"));
        target.isActive = true;
        target.updatedAt = mockNow();
        commit();
        return staffDto(target);
      },
    },

    settings: {
      async get() {
        await latency();
        const staff = authenticate();
        requirePermission(staff, "settings.manage");
        return settingsDto();
      },

      async update(input) {
        await latency(400, 700);
        const staff = authenticate();
        requirePermission(staff, "settings.manage");
        const errors: Record<string, string> = {};
        const next = { ...db.settings };

        if (input.gymName !== undefined) {
          const name = clean(input.gymName);
          if (!name) errors.gymName = msg("settings.profile.errors.gymName");
          else if (name.length > 80) errors.gymName = msg("common.validation.maxLength", { max: 80 });
          else next.gymName = name;
        }
        if (input.phone !== undefined) {
          const raw = clean(input.phone);
          const phone = raw ? normalizeEthiopianPhone(raw, "any") : null;
          if (raw && !phone) errors.phone = msg("common.validation.phoneInvalid");
          else next.phone = phone;
        }
        if (input.email !== undefined) {
          const email = clean(input.email)?.toLowerCase() ?? null;
          if (email && !EMAIL_RE.test(email)) errors.email = msg("common.validation.emailInvalid");
          else next.email = email;
        }
        if (input.address !== undefined) {
          const address = clean(input.address);
          if (address && address.length > 200) errors.address = msg("common.validation.maxLength", { max: 200 });
          else next.address = address;
        }
        if (input.logoUrl !== undefined) next.logoUrl = input.logoUrl;
        if (input.expirationWarningDays !== undefined) {
          const days = Number(input.expirationWarningDays);
          if (!Number.isInteger(days) || days < 0 || days > 30) {
            errors.expirationWarningDays = msg("settings.membership.warningInvalid");
          } else next.expirationWarningDays = days;
        }
        if (input.enabledPaymentMethods !== undefined) {
          const methods = PAYMENT_METHODS.filter((m) => input.enabledPaymentMethods!.includes(m));
          if (methods.length === 0) errors.enabledPaymentMethods = msg("settings.payments.atLeastOne");
          else next.enabledPaymentMethods = methods;
        }
        if (Object.keys(errors).length > 0) invalid(errors);

        db.settings = { ...next, updatedAt: mockNow(), updatedBy: staff.id };
        commit();
        return settingsDto();
      },

      async uploadLogo(file) {
        await latency(500, 900);
        const staff = authenticate();
        requirePermission(staff, "settings.manage");
        let logoUrl: string;
        try {
          logoUrl = await readImage(file);
        } catch (error) {
          if (error instanceof ApiError) {
            fail(422, "VALIDATION_FAILED", error.message, {
              fieldErrors: { logo: error.fieldErrors.photo ?? error.message },
            });
          }
          throw error;
        }
        db.settings = { ...db.settings, logoUrl, updatedAt: mockNow(), updatedBy: staff.id };
        commit();
        return settingsDto();
      },
    },
  };

  function settingsDto(): GymSettings {
    const updatedBy = db.settings.updatedBy ? index.staffById.get(db.settings.updatedBy) : null;
    return {
      gymName: db.settings.gymName,
      phone: db.settings.phone,
      email: db.settings.email,
      address: db.settings.address,
      logoUrl: db.settings.logoUrl,
      currency: "ETB",
      timezone: "Africa/Addis_Ababa",
      expirationWarningDays: db.settings.expirationWarningDays,
      enabledPaymentMethods: [...db.settings.enabledPaymentMethods],
      updatedAt: db.settings.updatedAt,
      updatedBy: updatedBy ? { id: updatedBy.id, fullName: updatedBy.fullName } : null,
    };
  }
}
