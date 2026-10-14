"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CalendarX,
  CircleCheck,
  Dumbbell,
  Hourglass,
  Plus,
  TrendingUp,
  UserPlus,
  UserRoundX,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RevenueChart, type ChartPoint } from "@/components/charts/revenue-chart";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, LoadError } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatCardSkeleton } from "@/components/ui/stat-card";
import { SegmentedControl } from "@/components/ui/tabs";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useI18n, type I18n } from "@/i18n/provider";
import { api } from "@/lib/api/client";
import type { Dashboard, MemberSummary, PaymentSummary, RevenuePoint } from "@gymflow/shared/api/types";
import { sumMoney, toCents } from "@gymflow/shared/domain/money";
import { formatPhone } from "@gymflow/shared/domain/phone";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/auth-provider";
import { PaidBadge } from "@/features/members/status-badge";
import { usePaymentDrawer } from "@/features/payments/payment-drawer-provider";
import { PaymentMethodLabel } from "@/features/payments/payment-methods";

export function DashboardPage() {
  const { t, f } = useI18n();
  const { gym, can } = useSession();
  const { openPaymentDrawer } = usePaymentDrawer();
  const dashboard = useQuery({ queryKey: queryKeys.dashboard, queryFn: () => api.dashboard.get() });

  const header = (
    <PageHeader
      title={t("dashboard.title")}
      description={
        <>
          {t("dashboard.subtitle")}{" "}
          <span className="text-fg font-medium">
            {f.weekday(gym.today)}, {f.longDate(gym.today)}
          </span>
        </>
      }
      actions={
        <>
          <Button variant="secondary" leftIcon={<Banknote aria-hidden />} onClick={() => openPaymentDrawer()}>
            {t("dashboard.recordPayment")}
          </Button>
          <Button asChild>
            <Link href="/members/new">
              <UserPlus aria-hidden />
              {t("dashboard.addMember")}
            </Link>
          </Button>
        </>
      }
    />
  );

  if (dashboard.isPending)
    return (
      <>
        {header}
        <DashboardSkeleton admin={can("revenue.view")} />
      </>
    );
  if (dashboard.isError) {
    return (
      <>
        {header}
        <Card>
          <LoadError onRetry={() => void dashboard.refetch()} retrying={dashboard.isFetching} />
        </Card>
      </>
    );
  }

  const data = dashboard.data;

  if (!data.hasMembers && !data.hasPlans) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<Dumbbell aria-hidden />}
            title={t("dashboard.firstRun.title")}
            description={can("plans.manage") ? t("dashboard.firstRun.admin") : t("dashboard.firstRun.reception")}
            actions={
              <>
                {can("plans.manage") ? (
                  <Button asChild>
                    <Link href="/plans">
                      <Plus aria-hidden />
                      {t("dashboard.createPlan")}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant={can("plans.manage") ? "secondary" : "primary"}>
                  <Link href="/members/new">
                    <UserPlus aria-hidden />
                    {t("dashboard.addMember")}
                  </Link>
                </Button>
              </>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <MembershipCards data={data} />
      {data.revenue ? <RevenueCards revenue={data.revenue} /> : null}

      <div className={cn("mt-6 grid gap-6", data.revenue && "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
        {data.revenue ? <RevenueOverview series={data.revenue.last30Days} today={data.today} /> : null}
        <ExpiringSoon
          members={data.expiringSoon}
          total={data.counts.expiringSoon}
          warningDays={gym.expirationWarningDays}
        />
      </div>

      <RecentPayments payments={data.recentPayments} />
    </>
  );
}

function StatLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group block rounded-xl transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
    >
      {children}
    </Link>
  );
}

function MembershipCards({ data }: { data: Dashboard }) {
  const { t, f } = useI18n();
  const { counts } = data;
  return (
    <section
      aria-label={t("dashboard.counts.label")}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      <StatLink href="/members">
        <StatCard
          label={t("dashboard.counts.total")}
          value={f.number(counts.all)}
          icon={<Users aria-hidden />}
          helper={
            counts.scheduled > 0
              ? t("dashboard.counts.totalHelperScheduled", { count: counts.scheduled })
              : t("dashboard.counts.totalHelper")
          }
          className="group-hover:border-line-strong h-full"
        />
      </StatLink>
      <StatLink href="/memberships?status=ACTIVE">
        <StatCard
          label={t("dashboard.counts.active")}
          value={f.number(counts.active)}
          tone="success"
          icon={<CircleCheck aria-hidden />}
          helper={t("dashboard.counts.activeHelper", { count: counts.expiringSoon })}
          className="group-hover:border-line-strong h-full"
        />
      </StatLink>
      <StatLink href="/memberships?status=EXPIRING_SOON">
        <StatCard
          label={t("dashboard.counts.expiring")}
          value={f.number(counts.expiringSoon)}
          tone="warning"
          icon={<Hourglass aria-hidden />}
          helper={t("dashboard.counts.expiringHelper")}
          className="group-hover:border-line-strong h-full"
        />
      </StatLink>
      <StatLink href="/memberships?status=EXPIRED">
        <StatCard
          label={t("dashboard.counts.expired")}
          value={f.number(counts.expired)}
          tone="error"
          icon={<CalendarX aria-hidden />}
          helper={t("dashboard.counts.expiredHelper")}
          className="group-hover:border-line-strong h-full"
        />
      </StatLink>
      <StatLink href="/memberships?status=UNPAID">
        <StatCard
          label={t("dashboard.counts.unpaid")}
          value={f.number(counts.unpaid)}
          tone="neutral"
          icon={<UserRoundX aria-hidden />}
          helper={t("dashboard.counts.unpaidHelper")}
          className="group-hover:border-line-strong h-full"
        />
      </StatLink>
    </section>
  );
}

function RevenueCards({ revenue }: { revenue: NonNullable<Dashboard["revenue"]> }) {
  const { t, f } = useI18n();
  return (
    <section aria-label={t("dashboard.revenue.label")} className="mt-4 grid gap-4 md:grid-cols-2">
      <StatCard
        label={t("dashboard.revenue.today")}
        size="lg"
        value={f.amount(revenue.today.amount)}
        unit={f.currency}
        icon={<Wallet aria-hidden />}
        helper={t("dashboard.revenue.helper", {
          period: f.date(revenue.month.to),
          payments: t("common.paymentsCount", { count: revenue.today.transactions }),
        })}
      />
      <StatCard
        label={t("dashboard.revenue.month")}
        size="lg"
        value={f.amount(revenue.month.amount)}
        unit={f.currency}
        tone="success"
        icon={<TrendingUp aria-hidden />}
        helper={t("dashboard.revenue.helper", {
          period: f.dateRange(revenue.month.from, revenue.month.to),
          payments: t("common.paymentsCount", { count: revenue.month.transactions }),
        })}
      />
    </section>
  );
}

function toChartPoints({ t, f }: I18n, series: RevenuePoint[], today: string): ChartPoint[] {
  return series.map((point) => ({
    key: point.date,
    label: f.date(point.date),
    axisLabel: point.date === today ? t("common.today") : f.shortDate(point.date),
    amount: point.amount,
    value: toCents(point.amount) / 100,
    transactions: point.transactions,
    highlight: point.date === today,
  }));
}

function RevenueOverview({ series, today }: { series: RevenuePoint[]; today: string }) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const [range, setRange] = useState<"7" | "30">("7");
  const visible = range === "7" ? series.slice(-7) : series;
  const total = sumMoney(visible.map((p) => p.amount));
  const count = visible.reduce((sum, p) => sum + p.transactions, 0);

  return (
    <Card className="min-w-0">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {t("dashboard.overview.title")} <Badge tone="primary">{f.currency}</Badge>
          </span>
        }
        description={t("dashboard.overview.description")}
        action={
          <SegmentedControl
            label={t("dashboard.overview.range")}
            size="sm"
            value={range}
            onValueChange={setRange}
            options={[
              { value: "7", label: t("dashboard.overview.days7") },
              { value: "30", label: t("dashboard.overview.days30") },
            ]}
          />
        }
      />
      <div className="px-5 pt-4 pb-5 sm:px-6">
        <div className="bg-tint mb-4 flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-4 py-3">
          <div>
            <p className="text-fg-muted text-xs font-semibold tracking-[0.08em] uppercase">
              {t("dashboard.overview.total", { days: range })}
            </p>
            <p className="text-fg text-xl font-bold">{f.money(total)}</p>
          </div>
          <p className="text-fg-muted text-sm">
            {t("dashboard.overview.summary", {
              payments: t("common.paymentsCount", { count }),
              range: f.dateRange(visible[0].date, visible[visible.length - 1].date),
            })}
          </p>
        </div>
        <RevenueChart
          points={toChartPoints(i18n, visible, today)}
          variant="area"
          height={280}
          label={t("dashboard.overview.chartLabel", { days: range })}
        />
      </div>
    </Card>
  );
}

function ExpiringSoon({
  members,
  total,
  warningDays,
}: {
  members: MemberSummary[];
  total: number;
  warningDays: number;
}) {
  const { t, f } = useI18n();
  const { openPaymentDrawer } = usePaymentDrawer();
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {t("dashboard.expiring.title")} <Badge tone="warning">{t("common.membersCount", { count: total })}</Badge>
          </span>
        }
        description={t("dashboard.expiring.description", { days: f.days(warningDays) })}
      />
      {members.length === 0 ? (
        <EmptyState
          icon={<CalendarClock aria-hidden />}
          title={t("dashboard.expiring.emptyTitle")}
          description={t("dashboard.expiring.emptyText", { days: f.days(warningDays) })}
          className="py-10"
        />
      ) : (
        <ul className="divide-line mt-3 flex-1 divide-y px-5 sm:px-6">
          {members.map((member) => {
            const period = member.membership.current;
            const left = member.membership.remainingDays ?? 0;
            return (
              <li key={member.id} className="flex items-center gap-3 py-3">
                <Avatar name={member.fullName} photoUrl={member.photoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/members/${member.id}`} className="text-fg block truncate font-semibold hover:underline">
                    {member.fullName}
                  </Link>
                  <p className="text-fg-muted truncate text-sm">
                    {formatPhone(member.phone)}
                    {period ? ` · ${f.plan(period.planName, period.durationDays)}` : ""}
                  </p>
                  {member.membership.coverageEnd ? (
                    <p className="text-fg-muted text-xs">
                      {t("dashboard.expiring.expires", { date: f.date(member.membership.coverageEnd) })}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone="warning">
                    {left === 0 ? t("labels.detail.expiresToday") : t("labels.detail.daysLeft", { count: left })}
                  </Badge>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => openPaymentDrawer({ memberId: member.id })}
                    aria-label={t("dashboard.expiring.renewFor", { name: member.fullName })}
                  >
                    {t("dashboard.expiring.renew")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-line mt-auto border-t px-5 py-3 sm:px-6">
        <Link
          href="/memberships?status=EXPIRING_SOON"
          className="text-link inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold hover:underline md:min-h-8"
        >
          {t("dashboard.expiring.viewAll")} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

function RecentPayments({ payments }: { payments: PaymentSummary[] }) {
  const { t, f } = useI18n();
  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader
        title={t("dashboard.recent.title")}
        description={t("dashboard.recent.description")}
        action={
          <Link
            href="/payments"
            className="text-link inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold hover:underline md:min-h-8"
          >
            {t("dashboard.recent.viewAll")} <ArrowRight aria-hidden className="size-4" />
          </Link>
        }
        className="pb-4"
      />
      {payments.length === 0 ? (
        <EmptyState icon={<Banknote aria-hidden />} title={t("dashboard.recent.empty")} className="py-10" />
      ) : (
        <>
          <div className="hidden md:block">
            <Table caption={t("dashboard.recent.caption")}>
              <THead>
                <tr>
                  <TH>{t("dashboard.recent.paymentId")}</TH>
                  <TH>{t("dashboard.recent.member")}</TH>
                  <TH className="hidden lg:table-cell">{t("dashboard.recent.plan")}</TH>
                  <TH align="right">{t("dashboard.recent.amount")}</TH>
                  <TH className="hidden lg:table-cell">{t("dashboard.recent.method")}</TH>
                  <TH>{t("dashboard.recent.date")}</TH>
                  <TH>{t("dashboard.recent.status")}</TH>
                </tr>
              </THead>
              <tbody>
                {payments.map((payment) => (
                  <TR key={payment.id} interactive>
                    <TD>
                      <Link
                        href={`/payments/${payment.id}`}
                        className="text-link font-mono text-sm font-semibold hover:underline"
                      >
                        {payment.paymentCode}
                      </Link>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={payment.member.fullName} photoUrl={payment.member.photoUrl} size="sm" />
                        <div className="min-w-0">
                          <Link href={`/members/${payment.member.id}`} className="font-semibold hover:underline">
                            {payment.member.fullName}
                          </Link>
                          <p className="text-fg-muted text-xs">{payment.member.memberCode}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden lg:table-cell">{f.plan(payment.plan.name, payment.plan.durationDays)}</TD>
                    <TD align="right" className="tabular font-semibold whitespace-nowrap">
                      {f.money(payment.amount)}
                    </TD>
                    <TD className="hidden lg:table-cell">
                      <PaymentMethodLabel method={payment.method} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      {f.date(payment.receivedDate)}
                      <p className="text-fg-muted text-xs">
                        {t("dashboard.recent.entered", { time: f.time(payment.createdAt) })}
                      </p>
                    </TD>
                    <TD>
                      <PaidBadge />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="divide-line border-line divide-y border-t md:hidden">
            {payments.map((payment) => (
              <li key={payment.id}>
                <Link
                  href={`/payments/${payment.id}`}
                  className="hover:bg-row-hover flex items-center gap-3 px-5 py-3.5"
                >
                  <Avatar name={payment.member.fullName} photoUrl={payment.member.photoUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg truncate font-semibold">{payment.member.fullName}</p>
                    <p className="text-fg-muted truncate text-xs">
                      {payment.paymentCode} · {payment.plan.name} · {f.shortDate(payment.receivedDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-fg text-sm font-semibold whitespace-nowrap">{f.money(payment.amount)}</p>
                    <PaidBadge />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function DashboardSkeleton({ admin }: { admin: boolean }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t("dashboard.loading")}</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      {admin ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        {admin ? <Skeleton className="h-96 rounded-xl" /> : null}
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <Skeleton className="mt-6 h-72 rounded-xl" />
    </div>
  );
}
