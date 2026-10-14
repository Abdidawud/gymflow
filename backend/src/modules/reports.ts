/**
 * Administrator reports (backend design §11): revenue by received date with
 * breakdowns by purchase-time plan and by method, and membership activity.
 * Current status counts are "as of today", not historical.
 */

import type {
  MembershipReport,
  PaymentMethod,
  RevenueReport,
} from "@gymflow/shared/api/types";
import {
  daysBetween,
  isDateOnly,
  type DateOnly,
} from "@gymflow/shared/domain/dates";
import { countStatuses } from "@gymflow/shared/domain/member-list";
import { averageMoney } from "@gymflow/shared/domain/money";
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import type { Env, RequestContext } from "../http/context";
import { parse } from "../http/validation";
import { invalid } from "../lib/errors";
import {
  loadRelevantPeriods,
  memberSummaryDto,
  selectMembers,
} from "../services/members";
import { revenueSeries, revenueTotals } from "../services/revenue";
import { readSettings } from "../services/settings";

const RangeQuery = z.strictObject({
  from: z.string().max(20),
  to: z.string().max(20),
});

function validateRange(
  ctx: RequestContext,
  query: z.infer<typeof RangeQuery>,
): { from: DateOnly; to: DateOnly } {
  const { t } = ctx;
  if (!isDateOnly(query.from) || !isDateOnly(query.to))
    invalid(t, { from: t("validDates") });
  if (query.from > query.to) invalid(t, { from: t("fromAfterTo") });
  if (daysBetween(query.from, query.to) > 366)
    invalid(t, { from: t("rangeTooLong") });
  return { from: query.from, to: query.to };
}

export async function reportRoutes(app: FastifyInstance, env: Env) {
  const config = { permission: "reports.view" as const };

  app.get(
    "/reports/revenue",
    { config },
    async (request): Promise<RevenueReport> => {
      const { from, to } = validateRange(
        request.ctx,
        parse(RangeQuery, request.query, request.ctx.t),
      );
      const [totals, series, byPlan, byMethod] = await Promise.all([
        revenueTotals(env.db, from, to),
        revenueSeries(env.db, from, to),
        // Grouped by the purchase-time snapshot so renamed plans don't rewrite history.
        env.db
          .selectFrom("payments as p")
          .innerJoin("memberships as ms", "ms.id", "p.membership_id")
          .select([
            "ms.plan_id",
            "ms.plan_name_snapshot",
            "ms.duration_days_snapshot",
            sql<string>`count(*)`.as("transactions"),
            sql<string>`sum(p.amount)::numeric(14, 2)`.as("revenue"),
          ])
          .where("p.received_date", ">=", from)
          .where("p.received_date", "<=", to)
          .groupBy([
            "ms.plan_id",
            "ms.plan_name_snapshot",
            "ms.duration_days_snapshot",
          ])
          .orderBy(sql`sum(p.amount)`, "desc")
          .orderBy("ms.plan_name_snapshot")
          .execute(),
        env.db
          .selectFrom("payments")
          .select([
            "method",
            sql<string>`count(*)`.as("transactions"),
            sql<string>`sum(amount)::numeric(14, 2)`.as("revenue"),
          ])
          .where("received_date", ">=", from)
          .where("received_date", "<=", to)
          .groupBy("method")
          .orderBy(sql`sum(amount)`, "desc")
          .execute(),
      ]);
      return {
        from,
        to,
        totalRevenue: totals.amount,
        transactions: totals.transactions,
        averagePayment: averageMoney(totals.amount, totals.transactions),
        series,
        byPlan: byPlan.map((row) => ({
          planId: row.plan_id,
          planName: row.plan_name_snapshot,
          durationDays: row.duration_days_snapshot,
          transactions: Number(row.transactions),
          revenue: row.revenue,
        })),
        byMethod: byMethod.map((row) => ({
          method: row.method as PaymentMethod,
          transactions: Number(row.transactions),
          revenue: row.revenue,
        })),
        generatedAt: env.clock.now().toISOString(),
      };
    },
  );

  app.get(
    "/reports/memberships",
    { config },
    async (request): Promise<MembershipReport> => {
      const { from, to } = validateRange(
        request.ctx,
        parse(RangeQuery, request.query, request.ctx.t),
      );
      const today = env.clock.today();
      const [registrations, purchases, settings, members] = await Promise.all([
        env.db
          .selectFrom("members")
          .select(sql<string>`count(*)`.as("count"))
          .where("registration_date", ">=", from)
          .where("registration_date", "<=", to)
          .executeTakeFirstOrThrow(),
        env.db
          .selectFrom("payments as p")
          .innerJoin("memberships as ms", "ms.id", "p.membership_id")
          .select([
            sql<string>`count(*) FILTER (WHERE ms.is_renewal)`.as("renewals"),
            sql<string>`count(*) FILTER (WHERE NOT ms.is_renewal)`.as("first"),
          ])
          .where("p.received_date", ">=", from)
          .where("p.received_date", "<=", to)
          .executeTakeFirstOrThrow(),
        readSettings(env.db),
        selectMembers(env.db)
          .where("members.is_archived", "=", false)
          .execute(),
      ]);
      const periods = await loadRelevantPeriods(
        env.db,
        today,
        members.map((m) => m.id),
      );
      const counts = countStatuses(
        members.map(
          (m) =>
            memberSummaryDto(
              env,
              m,
              periods.get(m.id) ?? [],
              today,
              settings.expirationWarningDays,
            ).membership.status,
        ),
      );
      return {
        from,
        to,
        newRegistrations: Number(registrations.count),
        renewals: Number(purchases.renewals),
        firstPurchases: Number(purchases.first),
        current: {
          asOf: today,
          active: counts.active,
          expiringSoon: counts.expiringSoon,
          expired: counts.expired,
          scheduled: counts.scheduled,
          unpaid: counts.unpaid,
        },
        generatedAt: env.clock.now().toISOString(),
      };
    },
  );
}
