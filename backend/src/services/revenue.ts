/**
 * Revenue by received date (backend design §11): money stays exact decimal
 * end to end; days without payments appear as zero.
 */

import type { RevenuePoint } from "@gymflow/shared/api/types";
import type { DateOnly } from "@gymflow/shared/domain/dates";
import { sql } from "kysely";
import type { Db } from "../db";

export async function revenueTotals(db: Db, from: DateOnly, to: DateOnly) {
  const row = await db
    .selectFrom("payments")
    .select([
      sql<string>`coalesce(sum(amount), 0)::numeric(14, 2)`.as("amount"),
      sql<string>`count(*)`.as("count"),
    ])
    .where("received_date", ">=", from)
    .where("received_date", "<=", to)
    .executeTakeFirstOrThrow();
  return { amount: row.amount, transactions: Number(row.count) };
}

export async function revenueSeries(
  db: Db,
  from: DateOnly,
  to: DateOnly,
): Promise<RevenuePoint[]> {
  const result = await sql<{
    date: string;
    amount: string;
    transactions: string;
  }>`
    SELECT d::date AS date,
           coalesce(sum(p.amount), 0)::numeric(14, 2) AS amount,
           count(p.id) AS transactions
    FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d
    LEFT JOIN payments p ON p.received_date = d::date
    GROUP BY d
    ORDER BY d`.execute(db);
  return result.rows.map((row) => ({
    date: row.date,
    amount: row.amount,
    transactions: Number(row.transactions),
  }));
}
