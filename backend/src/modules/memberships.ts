/**
 * GET /memberships — one summary row per current member for monitoring
 * (design.md §14), with status counts for the tabs. Counts ignore the status
 * filter but respect search, plan and end-date filters.
 */

import type { MemberSummary } from "@gymflow/shared/api/types";
import { isDateOnly } from "@gymflow/shared/domain/dates";
import {
  compareByAttention,
  countStatuses,
  displayPeriod,
  matchesMemberSearch,
  matchesStatusFilter,
  paginate,
} from "@gymflow/shared/domain/member-list";
import { MEMBERSHIP_STATUSES } from "@gymflow/shared/domain/membership";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../http/context";
import { parse } from "../http/validation";
import { loadRelevantPeriods, memberSummaryDto, selectMembers } from "../services/members";
import { readSettings } from "../services/settings";

const date = z.string().refine(isDateOnly);

const ListQuery = z.strictObject({
  search: z.string().max(200).optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
  planId: z.string().max(64).optional(),
  endFrom: date.optional(),
  endTo: date.optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function membershipRoutes(app: FastifyInstance, env: Env) {
  app.get("/memberships", async (request) => {
    const query = parse(ListQuery, request.query, request.ctx.t);
    const today = env.clock.today();
    const settings = await readSettings(env.db);

    const members = (await selectMembers(env.db).where("members.is_archived", "=", false).execute()).filter((m) =>
      matchesMemberSearch(
        {
          memberCode: m.member_code,
          phone: m.phone,
          firstName: m.first_name,
          lastName: m.last_name,
          email: m.email,
        },
        query.search,
      ),
    );
    const periods = await loadRelevantPeriods(
      env.db,
      today,
      members.map((m) => m.id),
    );

    const inEndRange = (row: MemberSummary) => {
      if (!query.endFrom && !query.endTo) return true;
      const period = displayPeriod(row.membership);
      if (!period) return false;
      const end = row.membership.coverageEnd ?? period.endDate;
      return (!query.endFrom || end >= query.endFrom) && (!query.endTo || end <= query.endTo);
    };

    const base = members
      .map((m) => memberSummaryDto(env, m, periods.get(m.id) ?? [], today, settings.expirationWarningDays))
      .filter((row) => !query.planId || displayPeriod(row.membership)?.planId === query.planId)
      .filter(inEndRange);
    const counts = countStatuses(base.map((row) => row.membership.status));
    const rows = base
      .filter((row) => matchesStatusFilter(row.membership.status, query.status))
      .sort(compareByAttention);
    return { ...paginate(rows, query.page, query.pageSize), counts };
  });
}
