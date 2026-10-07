import type {
  DateRangeQuery,
  MemberListQuery,
  MembershipListQuery,
  PageQuery,
  PaymentListQuery,
  PaymentPreviewRequest,
} from "@/lib/api/types";

/** Query key factory: one place to keep cache keys and invalidation consistent. */
export const queryKeys = {
  session: ["session"] as const,
  dashboard: ["dashboard"] as const,
  members: {
    all: ["members"] as const,
    list: (query: MemberListQuery) => ["members", "list", query] as const,
    lookup: (search: string) => ["members", "lookup", search] as const,
    detail: (id: string) => ["members", "detail", id] as const,
    payments: (id: string, query: PageQuery) => ["members", "payments", id, query] as const,
    memberships: (id: string, query: PageQuery) => ["members", "memberships", id, query] as const,
  },
  memberships: {
    all: ["memberships"] as const,
    list: (query: MembershipListQuery) => ["memberships", "list", query] as const,
  },
  plans: {
    all: ["plans"] as const,
    list: (includeDisabled: boolean) => ["plans", { includeDisabled }] as const,
  },
  payments: {
    all: ["payments"] as const,
    list: (query: PaymentListQuery) => ["payments", "list", query] as const,
    detail: (id: string) => ["payments", "detail", id] as const,
    receipt: (id: string) => ["payments", "receipt", id] as const,
    preview: (request: PaymentPreviewRequest) => ["payments", "preview", request] as const,
  },
  reports: {
    all: ["reports"] as const,
    revenue: (range: DateRangeQuery) => ["reports", "revenue", range] as const,
    memberships: (range: DateRangeQuery) => ["reports", "memberships", range] as const,
  },
  users: ["users"] as const,
  settings: ["settings"] as const,
};
