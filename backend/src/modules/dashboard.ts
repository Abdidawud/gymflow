/**
 * GET /dashboard — operational counts, members expiring soon and recent
 * payments for everyone; gym-wide revenue for administrators only.
 */

import type { Dashboard } from "@gymflow/shared/api/types";
import { addDays } from "@gymflow/shared/domain/dates";
import { startOfEthiopianMonth } from "@gymflow/shared/domain/ethiopian-calendar";
import { countStatuses } from "@gymflow/shared/domain/member-list";
import type { FastifyInstance } from "fastify";
import { can, type Env } from "../http/context";
import {
  loadRelevantPeriods,
  memberSummaryDto,
  selectMembers,
} from "../services/members";
import { paymentSummaryDto, selectPayments } from "../services/payments";
import { revenueSeries, revenueTotals } from "../services/revenue";
import { hasEnabledPlans, readSettings } from "../services/settings";

export async function dashboardRoutes(app: FastifyInstance, env: Env) {
  app.get("/dashboard", async (request): Promise<Dashboard> => {
    const ctx = request.ctx;
    const today = env.clock.today();
    const [settings, hasPlans, members, recent] = await Promise.all([
      readSettings(env.db),
      hasEnabledPlans(env.db),
      selectMembers(env.db).where("members.is_archived", "=", false).execute(),
      selectPayments(env.db)
        .orderBy("p.created_at", "desc")
        .orderBy("p.id")
        .limit(5)
        .execute(),
    ]);
    const periods = await loadRelevantPeriods(
      env.db,
      today,
      members.map((m) => m.id),
    );
    const rows = members.map((m) =>
      memberSummaryDto(
        env,
        m,
        periods.get(m.id) ?? [],
        today,
        settings.expirationWarningDays,
      ),
    );

    let revenue: Dashboard["revenue"] = null;
    if (can(ctx, "revenue.view")) {
      // "This month" is the current Ethiopian month.
      const monthFrom = startOfEthiopianMonth(today);
      const [day, month, last30Days] = await Promise.all([
        revenueTotals(env.db, today, today),
        revenueTotals(env.db, monthFrom, today),
        revenueSeries(env.db, addDays(today, -29), today),
      ]);
      revenue = {
        today: day,
        month: { from: monthFrom, to: today, ...month },
        last30Days,
      };
    }

    return {
      today,
      counts: countStatuses(rows.map((row) => row.membership.status)),
      expiringSoon: rows
        .filter((row) => row.membership.status === "EXPIRING_SOON")
        .sort(
          (a, b) =>
            (a.membership.remainingDays ?? 0) -
              (b.membership.remainingDays ?? 0) ||
            a.fullName.localeCompare(b.fullName),
        )
        .slice(0, 5),
      recentPayments: recent.map((row) => paymentSummaryDto(env, ctx, row)),
      hasPlans,
      hasMembers: rows.length > 0,
      revenue,
    };
  });
}
