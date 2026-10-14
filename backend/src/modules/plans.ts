/**
 * Membership plans (backend design §9). Plans used in purchases are disabled,
 * never deleted, and edits apply only to future purchases: every period keeps
 * its purchase-time name, price and duration.
 */

import type { Plan } from "@gymflow/shared/api/types";
import { parsePriceInput } from "@gymflow/shared/domain/money";
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import type { Db, Tx } from "../db";
import { can, type Env, type RequestContext } from "../http/context";
import { idParam } from "../http/params";
import { parse } from "../http/validation";
import { fail, FieldErrors, notFound } from "../lib/errors";
import { clean, cleanMultiline } from "../lib/text";
import { audit } from "../services/audit";

const PlanBody = z.strictObject({
  name: z.string().max(500),
  price: z.union([z.string().max(40), z.number()]),
  durationDays: z.union([z.number(), z.string().max(10)]),
  description: z.string().max(5000).nullable(),
  isEnabled: z.boolean(),
});

const ListQuery = z.strictObject({
  includeDisabled: z.enum(["true", "false"]).optional(),
});

type PlanRow = {
  id: string;
  name: string;
  price: string;
  duration_days: number;
  description: string | null;
  is_enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

async function planDtos(
  env: Env,
  db: Db | Tx,
  plans: PlanRow[],
): Promise<Plan[]> {
  if (plans.length === 0) return [];
  const today = env.clock.today();
  const ids = plans.map((p) => p.id);
  const [active, referenced] = await Promise.all([
    // Members whose period covering today was bought with the plan (archived members excluded).
    db
      .selectFrom("memberships as m")
      .innerJoin("members as mb", "mb.id", "m.member_id")
      .select([
        "m.plan_id",
        (eb) => eb.fn.count<string>("m.member_id").distinct().as("count"),
      ])
      .where("mb.is_archived", "=", false)
      .where("m.start_date", "<=", today)
      .where("m.end_date", ">=", today)
      .where(sql<boolean>`m.plan_id = any(${ids}::uuid[])`)
      .groupBy("m.plan_id")
      .execute(),
    db
      .selectFrom("memberships")
      .select("plan_id")
      .distinct()
      .where(sql<boolean>`plan_id = any(${ids}::uuid[])`)
      .execute(),
  ]);
  const activeBy = new Map(
    active.map((row) => [row.plan_id, Number(row.count)]),
  );
  const referencedSet = new Set(referenced.map((row) => row.plan_id));
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price,
    durationDays: plan.duration_days,
    description: plan.description,
    isEnabled: plan.is_enabled,
    activeMemberCount: activeBy.get(plan.id) ?? 0,
    isReferenced: referencedSet.has(plan.id),
    createdAt: plan.created_at.toISOString(),
    updatedAt: plan.updated_at.toISOString(),
  }));
}

async function validatePlan(
  db: Db | Tx,
  ctx: RequestContext,
  input: z.infer<typeof PlanBody>,
  excludeId?: string,
) {
  const { t } = ctx;
  const errors = new FieldErrors(t);
  const name = clean(input.name);
  if (!name) errors.add("name", t("planName"));
  else if (name.length > 60) errors.add("name", t("maxLength", { max: 60 }));
  const price = parsePriceInput(String(input.price ?? ""));
  if (!price || Number(price) >= 1e10) errors.add("price", t("planPrice"));
  const duration = Number(input.durationDays);
  if (!Number.isInteger(duration) || duration < 1 || duration > 3650)
    errors.add("durationDays", t("planDuration"));
  const description = cleanMultiline(input.description);
  if (description && description.length > 280)
    errors.add("description", t("maxLength", { max: 280 }));
  errors.throwIfAny();

  let duplicate = db
    .selectFrom("plans")
    .select("id")
    .where(sql<boolean>`lower(name) = lower(${name!})`);
  if (excludeId) duplicate = duplicate.where("id", "!=", excludeId);
  if (await duplicate.executeTakeFirst()) {
    fail(409, "DUPLICATE_PLAN_NAME", t("planNameTaken"), {
      fieldErrors: { name: t("planNameTaken") },
    });
  }
  return {
    name: name!,
    price: price!,
    duration_days: duration,
    description,
    is_enabled: input.isEnabled,
  };
}

function selectPlans(db: Db | Tx) {
  return db
    .selectFrom("plans")
    .select([
      "id",
      "name",
      "price",
      "duration_days",
      "description",
      "is_enabled",
      "created_at",
      "updated_at",
    ]);
}

async function getPlan(
  db: Db | Tx,
  ctx: RequestContext,
  id: string,
  lock = false,
): Promise<PlanRow> {
  let query = selectPlans(db).where("id", "=", id);
  if (lock) query = query.forUpdate();
  const plan = await query.executeTakeFirst();
  if (!plan) notFound(ctx.t);
  return plan;
}

export async function planRoutes(app: FastifyInstance, env: Env) {
  app.get("/plans", async (request) => {
    const query = parse(ListQuery, request.query, request.ctx.t);
    // Reception only ever sees plans that can be purchased.
    const includeDisabled =
      query.includeDisabled === "true" && can(request.ctx, "plans.manage");
    let plans = selectPlans(env.db);
    if (!includeDisabled) plans = plans.where("is_enabled", "=", true);
    return planDtos(
      env,
      env.db,
      await plans.orderBy("duration_days").orderBy("name").execute(),
    );
  });

  app.post(
    "/plans",
    { config: { permission: "plans.manage" } },
    async (request, reply) => {
      const ctx = request.ctx;
      const values = await validatePlan(
        env.db,
        ctx,
        parse(PlanBody, request.body, ctx.t),
      );
      const plan = await env.db.transaction().execute(async (tx) => {
        const now = env.clock.now();
        const row = await tx
          .insertInto("plans")
          .values({ ...values, created_at: now, updated_at: now })
          .returning([
            "id",
            "name",
            "price",
            "duration_days",
            "description",
            "is_enabled",
            "created_at",
            "updated_at",
          ])
          .executeTakeFirstOrThrow();
        await audit(
          tx,
          ctx,
          "plan.create",
          { type: "plan", id: row.id },
          { name: row.name, price: row.price },
          now,
        );
        return row;
      });
      return reply.code(201).send((await planDtos(env, env.db, [plan]))[0]);
    },
  );

  app.patch(
    "/plans/:id",
    { config: { permission: "plans.manage" } },
    async (request) => {
      const ctx = request.ctx;
      const id = idParam(request.params, ctx.t);
      const body = parse(PlanBody, request.body, ctx.t);
      const plan = await env.db.transaction().execute(async (tx) => {
        const before = await getPlan(tx, ctx, id, true);
        const values = await validatePlan(tx, ctx, body, id);
        const now = env.clock.now();
        const row = await tx
          .updateTable("plans")
          .set({ ...values, updated_at: now })
          .where("id", "=", id)
          .returning([
            "id",
            "name",
            "price",
            "duration_days",
            "description",
            "is_enabled",
            "created_at",
            "updated_at",
          ])
          .executeTakeFirstOrThrow();
        const changed = Object.fromEntries(
          (
            [
              "name",
              "price",
              "duration_days",
              "description",
              "is_enabled",
            ] as const
          )
            .filter((key) => before[key] !== row[key])
            .map((key) => [key, { from: before[key], to: row[key] }]),
        );
        if (Object.keys(changed).length > 0)
          await audit(
            tx,
            ctx,
            "plan.update",
            { type: "plan", id },
            changed,
            now,
          );
        return row;
      });
      return (await planDtos(env, env.db, [plan]))[0];
    },
  );

  for (const action of ["disable", "enable"] as const) {
    app.post(
      `/plans/:id/${action}`,
      { config: { permission: "plans.manage" } },
      async (request) => {
        const ctx = request.ctx;
        const id = idParam(request.params, ctx.t);
        const plan = await env.db.transaction().execute(async (tx) => {
          const before = await getPlan(tx, ctx, id, true);
          const enabled = action === "enable";
          if (before.is_enabled === enabled) return before;
          const now = env.clock.now();
          const row = await tx
            .updateTable("plans")
            .set({ is_enabled: enabled, updated_at: now })
            .where("id", "=", id)
            .returning([
              "id",
              "name",
              "price",
              "duration_days",
              "description",
              "is_enabled",
              "created_at",
              "updated_at",
            ])
            .executeTakeFirstOrThrow();
          await audit(
            tx,
            ctx,
            enabled ? "plan.enable" : "plan.disable",
            { type: "plan", id },
            { name: row.name },
            now,
          );
          return row;
        });
        return (await planDtos(env, env.db, [plan]))[0];
      },
    );
  }
}
