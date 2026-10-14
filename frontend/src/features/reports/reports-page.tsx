"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarSearch, Calculator, Info, ReceiptText, RefreshCw, UserPlus, Wallet } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { RevenueChart, type ChartPoint } from "@/components/charts/revenue-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { resolveRange } from "@/components/ui/date-range";
import { EmptyState, LoadError } from "@/components/ui/feedback";
import { DateInput } from "@/components/ui/date-input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatCardSkeleton } from "@/components/ui/stat-card";
import { SegmentedControl } from "@/components/ui/tabs";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useI18n } from "@/i18n/provider";
import type { Translator } from "@/i18n/translator";
import { api } from "@/lib/api/client";
import type { MembershipReport, RevenuePoint, RevenueReport } from "@gymflow/shared/api/types";
import { daysBetween, isDateOnly, type DateOnly } from "@gymflow/shared/domain/dates";
import { fromCents, toCents } from "@gymflow/shared/domain/money";
import { queryKeys } from "@/lib/query-keys";
import { useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/auth-provider";
import { PaymentMethodLabel } from "@/features/payments/payment-methods";

type Preset = "today" | "7d" | "month" | "custom";
const DEFAULTS = { range: "month", from: "", to: "" };

function share(part: string, total: string): string {
  const t = toCents(total);
  if (t === 0) return "0%";
  return `${((toCents(part) / t) * 100).toFixed(1)}%`;
}

/** Daily bars up to ~2 months; weekly buckets for longer ranges keep bars readable. */
function chartPoints(
  series: RevenuePoint[],
  today: DateOnly,
  { t, f }: Pick<Translator, "t" | "f">,
): { points: ChartPoint[]; weekly: boolean } {
  const weekly = series.length > 62;
  if (!weekly) {
    return {
      weekly,
      points: series.map((p) => ({
        key: p.date,
        label: f.date(p.date),
        axisLabel: p.date === today ? t("common.today") : f.shortDate(p.date),
        amount: p.amount,
        value: toCents(p.amount) / 100,
        transactions: p.transactions,
        highlight: p.date === today,
      })),
    };
  }
  const points: ChartPoint[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const week = series.slice(i, i + 7);
    const cents = week.reduce((sum, p) => sum + toCents(p.amount), 0);
    const first = week[0].date;
    const last = week[week.length - 1].date;
    points.push({
      key: first,
      label: t("reports.weekOf", { range: f.dateRange(first, last) }),
      axisLabel: f.shortDate(first),
      amount: fromCents(cents),
      value: cents / 100,
      transactions: week.reduce((sum, p) => sum + p.transactions, 0),
    });
  }
  return { points, weekly };
}

export function ReportsPage() {
  const { t } = useI18n();
  const { gym } = useSession();
  const [state, setState] = useUrlState(DEFAULTS);
  const preset = state.range as Preset;
  const applied =
    preset === "custom" ? resolveRange("custom", gym.today, state.from, state.to) : resolveRange(preset, gym.today);
  const range = applied.from && applied.to && !applied.error ? { from: applied.from, to: applied.to } : null;

  const revenue = useQuery({
    queryKey: queryKeys.reports.revenue(range ?? { from: "", to: "" }),
    queryFn: () => api.reports.revenue(range!),
    enabled: Boolean(range),
    placeholderData: keepPreviousData,
  });
  const memberships = useQuery({
    queryKey: queryKeys.reports.memberships(range ?? { from: "", to: "" }),
    queryFn: () => api.reports.memberships(range!),
    enabled: Boolean(range),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title={t("reports.title")} description={t("reports.subtitle")} />
      <DateSelector
        preset={preset}
        from={range?.from ?? state.from}
        to={range?.to ?? state.to}
        today={gym.today}
        onApply={(next) => setState(next)}
      />

      {!range ? (
        <Card>
          <EmptyState
            icon={<CalendarSearch aria-hidden />}
            title={t("reports.chooseRangeTitle")}
            description={t("reports.chooseRangeText")}
          />
        </Card>
      ) : revenue.isError && !revenue.data ? (
        <Card>
          <LoadError onRetry={() => void revenue.refetch()} retrying={revenue.isFetching} />
        </Card>
      ) : !revenue.data ? (
        <ReportSkeleton />
      ) : (
        <div className={cn("flex flex-col gap-6 transition-opacity", revenue.isPlaceholderData && "opacity-60")}>
          <RevenueSection
            report={revenue.data}
            today={gym.today}
            onChangeRange={() => setState({ range: "month", from: "", to: "" })}
          />
          {memberships.data ? (
            <MembershipSection report={memberships.data} />
          ) : memberships.isError ? (
            <Card>
              <LoadError onRetry={() => void memberships.refetch()} />
            </Card>
          ) : (
            <Skeleton className="h-56 rounded-xl" />
          )}
        </div>
      )}
    </>
  );
}

function DateSelector({
  preset,
  from,
  to,
  today,
  onApply,
}: {
  preset: Preset;
  from: string;
  to: string;
  today: DateOnly;
  onApply: (next: { range: Preset; from: string; to: string }) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ from, to });
  const [error, setError] = useState<string | null>(null);
  const fromId = useId();
  const toId = useId();

  function choose(next: Preset) {
    setError(null);
    if (next === "custom") {
      onApply({ range: "custom", from: draft.from || from, to: draft.to || to });
      return;
    }
    const resolved = resolveRange(next, today);
    setDraft({ from: resolved.from ?? "", to: resolved.to ?? "" });
    onApply({ range: next, from: "", to: "" });
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!isDateOnly(draft.from) || !isDateOnly(draft.to)) return setError(t("reports.errors.bothDates"));
    if (draft.from > draft.to) return setError(t("common.validation.fromAfterTo"));
    if (draft.to > today) return setError(t("reports.errors.futureTo"));
    if (daysBetween(draft.from, draft.to) > 366) return setError(t("reports.errors.tooLong"));
    setError(null);
    onApply({ range: "custom", from: draft.from, to: draft.to });
  }

  return (
    <Card className="mb-6 p-4">
      <form noValidate onSubmit={apply} className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SegmentedControl
          label={t("reports.period")}
          value={preset}
          onValueChange={choose}
          className="self-start"
          options={[
            { value: "today", label: t("reports.presets.today") },
            { value: "7d", label: t("reports.presets.last7") },
            { value: "month", label: t("reports.presets.month") },
            { value: "custom", label: t("reports.presets.custom") },
          ]}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label id={`${fromId}-label`} htmlFor={fromId} className="text-caption text-fg-muted font-semibold">
              {t("common.from")}
            </label>
            <DateInput
              id={fromId}
              max={today}
              today={today}
              value={draft.from || from}
              aria-invalid={error ? true : undefined}
              onChange={(date) => setDraft({ from: date, to: draft.to || to })}
              className="w-52"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label id={`${toId}-label`} htmlFor={toId} className="text-caption text-fg-muted font-semibold">
              {t("common.to")}
            </label>
            <DateInput
              id={toId}
              max={today}
              today={today}
              value={draft.to || to}
              aria-invalid={error ? true : undefined}
              onChange={(date) => setDraft({ from: draft.from || from, to: date })}
              className="w-52"
            />
          </div>
          <Button type="submit">{t("common.apply")}</Button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="text-caption text-danger mt-2 font-medium lg:text-right">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

function RevenueSection({
  report,
  today,
  onChangeRange,
}: {
  report: RevenueReport;
  today: DateOnly;
  onChangeRange: () => void;
}) {
  const { t, f } = useI18n();
  const { points, weekly } = chartPoints(report.series, today, { t, f });
  const rangeText = report.from === report.to ? f.date(report.from) : f.dateRange(report.from, report.to);

  return (
    <>
      <p className="text-fg-muted -mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Info aria-hidden className="size-4" />
        <span className="text-fg font-semibold">{rangeText}</span>· {t("reports.basis")} · Africa/Addis_Ababa ·{" "}
        {f.currency} · {t("reports.updated", { time: f.time(report.generatedAt) })}
      </p>
      <section aria-label={t("reports.summaryLabel")} className="grid gap-4 md:grid-cols-3">
        <StatCard
          label={t("reports.totalRevenue")}
          size="lg"
          value={f.amount(report.totalRevenue)}
          unit={f.currency}
          icon={<Wallet aria-hidden />}
        />
        <StatCard
          label={t("reports.transactions")}
          size="lg"
          value={f.number(report.transactions)}
          tone="success"
          icon={<ReceiptText aria-hidden />}
          helper={t("reports.transactionsHelper")}
        />
        <StatCard
          label={t("reports.averagePayment")}
          size="lg"
          value={f.amount(report.averagePayment)}
          unit={f.currency}
          tone="neutral"
          icon={<Calculator aria-hidden />}
          helper={t("reports.averageHelper")}
        />
      </section>

      {report.transactions === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarSearch aria-hidden />}
            title={t("reports.emptyTitle")}
            description={t("reports.emptyText")}
            actions={
              <Button variant="secondary" onClick={onChangeRange}>
                {t("reports.changeRange")}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={t("reports.chartTitle")}
              description={weekly ? t("reports.chartWeekly") : t("reports.chartDaily")}
            />
            <div className="px-5 pt-4 pb-5 sm:px-6">
              <RevenueChart
                points={points}
                variant="column"
                height={280}
                label={t(weekly ? "reports.chartLabelWeekly" : "reports.chartLabelDaily", { range: rangeText })}
              />
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader
                title={t("reports.byPlanTitle")}
                description={t("reports.byPlanDescription")}
                className="pb-4"
              />
              <Table caption={t("reports.byPlanCaption")}>
                <THead>
                  <tr>
                    <TH>{t("reports.colPlan")}</TH>
                    <TH align="right">{t("reports.colTransactions")}</TH>
                    <TH align="right">{t("reports.colRevenue")}</TH>
                    <TH align="right">{t("reports.colShare")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {report.byPlan.map((row) => (
                    <TR key={`${row.planId}-${row.planName}`}>
                      <TD className="font-medium">{f.plan(row.planName, row.durationDays)}</TD>
                      <TD align="right" className="tabular">
                        {row.transactions}
                      </TD>
                      <TD align="right" className="tabular font-semibold whitespace-nowrap">
                        {f.money(row.revenue)}
                      </TD>
                      <TD align="right" className="text-fg-muted tabular">
                        {share(row.revenue, report.totalRevenue)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card className="overflow-hidden">
              <CardHeader
                title={t("reports.byMethodTitle")}
                description={t("reports.byMethodDescription")}
                className="pb-4"
              />
              <Table caption={t("reports.byMethodCaption")}>
                <THead>
                  <tr>
                    <TH>{t("reports.colMethod")}</TH>
                    <TH align="right">{t("reports.colTransactions")}</TH>
                    <TH align="right">{t("reports.colRevenue")}</TH>
                    <TH align="right">{t("reports.colShare")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {report.byMethod.map((row) => (
                    <TR key={row.method}>
                      <TD>
                        <PaymentMethodLabel method={row.method} className="font-medium" />
                      </TD>
                      <TD align="right" className="tabular">
                        {row.transactions}
                      </TD>
                      <TD align="right" className="tabular font-semibold whitespace-nowrap">
                        {f.money(row.revenue)}
                      </TD>
                      <TD align="right" className="text-fg-muted tabular">
                        {share(row.revenue, report.totalRevenue)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const { f } = useI18n();
  return (
    <div className="bg-tint rounded-lg p-4">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className={cn("text-fg mt-1 text-2xl font-bold", tone)}>{f.number(value)}</dd>
    </div>
  );
}

function MembershipSection({ report }: { report: MembershipReport }) {
  const { t, f } = useI18n();
  return (
    <Card>
      <CardHeader title={t("reports.membershipTitle")} description={t("reports.membershipDescription")} />
      <div className="grid gap-6 px-5 py-5 sm:px-6 xl:grid-cols-[2fr_5fr]">
        <section aria-labelledby="range-heading">
          <h3 id="range-heading" className="text-fg mb-3 flex items-center gap-2 text-sm font-semibold">
            <UserPlus aria-hidden className="text-fg-muted size-4" />
            {t("reports.inRange")}
          </h3>
          <dl className="grid grid-cols-2 gap-3">
            <Count label={t("reports.newRegistrations")} value={report.newRegistrations} />
            <Count label={t("reports.renewals")} value={report.renewals} />
          </dl>
          <p className="text-fg-muted mt-2 text-xs">{t("reports.renewalNote", { count: report.firstPurchases })}</p>
        </section>
        <section aria-labelledby="today-heading">
          <h3 id="today-heading" className="text-fg mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
            <RefreshCw aria-hidden className="text-fg-muted size-4" />
            {t("reports.asOfToday")}
            <Badge tone="primary">{f.date(report.current.asOf)}</Badge>
            <span className="text-fg-muted text-xs font-normal">{t("reports.currentNote")}</span>
          </h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Count label={t("labels.status.ACTIVE")} value={report.current.active} tone="text-success-fg" />
            <Count
              label={t("labels.status.EXPIRING_SOON")}
              value={report.current.expiringSoon}
              tone="text-warning-fg"
            />
            <Count label={t("labels.status.EXPIRED")} value={report.current.expired} tone="text-error-fg" />
            <Count label={t("labels.status.UNPAID")} value={report.current.unpaid} />
            <Count label={t("labels.status.SCHEDULED")} value={report.current.scheduled} tone="text-info-fg" />
          </dl>
          <p className="text-fg-muted mt-2 text-xs">{t("reports.activeIncludes")}</p>
        </section>
      </div>
    </Card>
  );
}

function ReportSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{t("reports.loading")}</span>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
