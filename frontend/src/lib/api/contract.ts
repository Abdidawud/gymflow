/**
 * The GymFlow API surface used by the UI. One implementation talks to the
 * real backend over HTTP (`http-client.ts`); another runs an in-browser mock
 * with the same business rules (`mock/`), selected by NEXT_PUBLIC_API_MODE.
 *
 * Each method documents the backend endpoint it maps to (backend design §9).
 */

import type {
  AccountPreferences,
  ChangePasswordRequest,
  CreateStaffRequest,
  CurrentAccount,
  Dashboard,
  DateRangeQuery,
  DuplicatePhoneMatch,
  GymSettings,
  GymSettingsUpdate,
  LoginRequest,
  MemberDetail,
  MemberInput,
  MemberListQuery,
  MemberMembershipHistoryItem,
  MembershipList,
  MembershipListQuery,
  MembershipReport,
  MemberSummary,
  Paginated,
  PageQuery,
  PaymentDetail,
  PaymentList,
  PaymentListQuery,
  PaymentPreview,
  PaymentPreviewRequest,
  PaymentSummary,
  Plan,
  PlanInput,
  Receipt,
  RecordPaymentRequest,
  RecordPaymentResult,
  ResetPasswordRequest,
  RevenueReport,
  Session,
  StaffAccount,
  UpdateStaffRequest,
} from "./types";

export interface GymFlowApi {
  auth: {
    /** GET /auth/me */
    session(): Promise<Session>;
    /** POST /auth/login */
    login(input: LoginRequest): Promise<Session>;
    /** POST /auth/logout */
    logout(): Promise<void>;
    /** POST /auth/forgot-password — always resolves; never reveals whether the account exists. */
    forgotPassword(email: string): Promise<void>;
    /** POST /auth/reset-password */
    resetPassword(input: ResetPasswordRequest): Promise<void>;
  };
  account: {
    /** POST /account/change-password */
    changePassword(input: ChangePasswordRequest): Promise<void>;
    /** PATCH /account/preferences */
    updatePreferences(input: AccountPreferences): Promise<CurrentAccount>;
  };
  members: {
    /** GET /members */
    list(query: MemberListQuery): Promise<Paginated<MemberSummary>>;
    /** GET /members?phone= — exact match after normalization, for duplicate warnings. */
    findByPhone(phone: string, excludeId?: string): Promise<DuplicatePhoneMatch | null>;
    /** GET /members/{id} */
    get(id: string): Promise<MemberDetail>;
    /** POST /members */
    create(input: MemberInput): Promise<MemberDetail>;
    /** PATCH /members/{id} */
    update(id: string, input: MemberInput): Promise<MemberDetail>;
    /** POST /members/{id}/archive */
    archive(id: string): Promise<MemberDetail>;
    /** POST /members/{id}/reactivate */
    reactivate(id: string): Promise<MemberDetail>;
    /** GET /members/{id}/payments */
    payments(id: string, query: PageQuery): Promise<Paginated<PaymentSummary>>;
    /** GET /members/{id}/memberships */
    memberships(id: string, query: PageQuery): Promise<Paginated<MemberMembershipHistoryItem>>;
    /** POST /members/{id}/photo (multipart) */
    uploadPhoto(id: string, file: File): Promise<MemberDetail>;
    /** DELETE /members/{id}/photo */
    removePhoto(id: string): Promise<MemberDetail>;
  };
  memberships: {
    /** GET /memberships — one summary row per member. */
    list(query: MembershipListQuery): Promise<MembershipList>;
  };
  plans: {
    /** GET /plans */
    list(options?: { includeDisabled?: boolean }): Promise<Plan[]>;
    /** POST /plans */
    create(input: PlanInput): Promise<Plan>;
    /** PATCH /plans/{id} */
    update(id: string, input: PlanInput): Promise<Plan>;
    /** POST /plans/{id}/disable */
    disable(id: string): Promise<Plan>;
    /** POST /plans/{id}/enable */
    enable(id: string): Promise<Plan>;
  };
  payments: {
    /** POST /payments/preview — calculates price and coverage; no financial write. */
    preview(input: PaymentPreviewRequest): Promise<PaymentPreview>;
    /** POST /payments with an Idempotency-Key header. */
    record(input: RecordPaymentRequest, idempotencyKey: string): Promise<RecordPaymentResult>;
    /** GET /payments */
    list(query: PaymentListQuery): Promise<PaymentList>;
    /** GET /payments/{id} */
    get(id: string): Promise<PaymentDetail>;
    /** GET /payments/{id}/receipt */
    receipt(id: string): Promise<Receipt>;
  };
  dashboard: {
    /** GET /dashboard */
    get(): Promise<Dashboard>;
  };
  reports: {
    /** GET /reports/revenue */
    revenue(range: DateRangeQuery): Promise<RevenueReport>;
    /** GET /reports/memberships */
    memberships(range: DateRangeQuery): Promise<MembershipReport>;
  };
  users: {
    /** GET /users */
    list(): Promise<StaffAccount[]>;
    /** POST /users */
    create(input: CreateStaffRequest): Promise<StaffAccount>;
    /** PATCH /users/{id} */
    update(id: string, input: UpdateStaffRequest): Promise<StaffAccount>;
    /** POST /users/{id}/deactivate */
    deactivate(id: string): Promise<StaffAccount>;
    /** POST /users/{id}/activate */
    activate(id: string): Promise<StaffAccount>;
  };
  settings: {
    /** GET /settings */
    get(): Promise<GymSettings>;
    /** PATCH /settings */
    update(input: GymSettingsUpdate): Promise<GymSettings>;
    /** POST /settings/logo (multipart) */
    uploadLogo(file: File): Promise<GymSettings>;
  };
}
