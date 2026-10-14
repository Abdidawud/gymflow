"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Banknote, FilterX, IdCard } from "lucide-react";
import Link from "next/link";
import { ToggleGroup } from "radix-ui";
import { useCallback, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadError } from "@/components/ui/feedback";
import { DateInput } from "@/components/ui/date-input";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableSkeletonRows, TD, TH, THead, TR } from "@/components/ui/table";
import { useI18n, type I18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { api } from "@/lib/api/client";
import type { MembershipCounts, MembershipStatus, MemberSummary } from "@gymflow/shared/api/types";
import { addDays, daysBetween, isDateOnly, type DateOnly } from "@gymflow/shared/domain/dates";
import { formatPhone } from "@gymflow/shared/domain/phone";
import { queryKeys } from "@/lib/query-keys";
import { toInt, useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/auth-provider";
import { usePlans } from "@/features/members/queries";
import { StatusBadge } from "@/features/members/status-badge";
import { usePaymentDrawer } from "@/features/payments/payment-drawer-provider";

const DEFAULTS = { q: "", status: "", plan: "", ends: "", from: "", to: "", page: "1", size: "10" };

type EndsPreset = "" | "next7" | "next30" | "past30" | "custom";

function endRange(
  preset: EndsPreset,
  today: DateOnly,
  from: string,
  to: string,
): { from?: DateOnly; to?: DateOnly; error?: "fromAfterTo" } {
  switch (preset) {
    case "":
      return {};
    case "next7":
      return { from: today, to: addDays(today, 7) };
    case "next30":
      return { from: today, to: addDays(today, 30) };
    case "past30":
      return { from: addDays(today, -30), to: addDays(today, -1) };
    case "custom": {
      const f = isDateOnly(from) ? from : undefined;
      const t = isDateOnly(to) ? to : undefined;
      if (f && t && f > t) return { error: "fromAfterTo" };
      return { from: f, to: t };
    }
  }
}

const TABS: { value: MembershipStatus | ""; label: MessageKey; count: (c: MembershipCounts) => number }[] = [
  { value: "", label: "memberships.all", count: (c) => c.all },
  { value: "ACTIVE", label: "labels.status.ACTIVE", count: (c) => c.active },
  { value: "EXPIRING_SOON", label: "labels.status.EXPIRING_SOON", count: (c) => c.expiringSoon },
  { value: "EXPIRED", label: "labels.status.EXPIRED", count: (c) => c.expired },
  { value: "SCHEDULED", label: "labels.status.SCHEDULED", count: (c) => c.scheduled },
  { value: "UNPAID", label: "labels.status.UNPAID", count: (c) => c.unpaid },
];

function displayPeriod(member: MemberSummary) {
  return member.membership.current ?? member.membership.next ?? member.membership.last;
}

/** "23 days left", "Expires today", "Ended 7 days ago", "Starts in 5 days", "No paid period". */
function timelineLabel({ t, f }: I18n, member: MemberSummary, today: DateOnly): { text: string; tone: string } {
  const m = member.membership;
  switch (m.status) {
    case "ACTIVE":
      return { text: t("labels.detail.daysLeft", { count: m.remainingDays ?? 0 }), tone: "text-success-fg" };
    case "EXPIRING_SOON":
      return {
        text:
          m.remainingDays === 0
            ? t("labels.detail.expiresToday")
            : t("labels.detail.daysLeft", { count: m.remainingDays ?? 0 }),
        tone: "text-warning-fg",
      };
    case "EXPIRED": {
      const ago = m.last ? daysBetween(m.last.endDate, today) : 0;
      return { text: t("memberships.endedAgo", { days: f.days(ago) }), tone: "text-error-fg" };
    }
    case "SCHEDULED":
      return { text: t("memberships.startsIn", { days: f.days(m.daysUntilStart ?? 0) }), tone: "text-info-fg" };
    case "UNPAID":
      return { text: t("memberships.noPaid"), tone: "text-fg-muted" };
  }
}

function RowAction({ member }: { member: MemberSummary }) {
  const { t } = useI18n();
  const { openPaymentDrawer } = usePaymentDrawer();
  const status = member.membership.status;
  if (status === "SCHEDULED") {
    return (
      <Button variant="secondary" size="sm" asChild>
        <Link href={`/members/${member.id}`}>{t("memberships.viewProfile")}</Link>
      </Button>
    );
  }
  const label =
    status === "UNPAID"
      ? t("memberships.firstPayment")
      : status === "EXPIRED"
        ? t("memberships.renewMembership")
        : t("memberships.renew");
  return (
    <Button
      variant={status === "ACTIVE" ? "secondary" : status === "EXPIRING_SOON" ? "primary" : "soft"}
      size="sm"
      onClick={() => openPaymentDrawer({ memberId: member.id })}
      aria-label={t("memberships.actionFor", { action: label, name: member.fullName })}
    >
      {label}
    </Button>
  );
}

export function MembershipsPage() {
  const i18n = useI18n();
  const { t, f } = i18n;
  const { gym } = useSession();
  const { openPaymentDrawer } = usePaymentDrawer();
  const [state, setState] = useUrlState(DEFAULTS);
  const [searchKey, setSearchKey] = useState(0);
  const plans = usePlans(true);

  const range = endRange(state.ends as EndsPreset, gym.today, state.from, state.to);
  const query = {
    search: state.q || undefined,
    status: (state.status || undefined) as MembershipStatus | undefined,
    planId: state.plan || undefined,
    endFrom: range.from,
    endTo: range.to,
    page: toInt(state.page, 1),
    pageSize: toInt(state.size, 10),
  };
  const list = useQuery({
    queryKey: queryKeys.memberships.list(query),
    queryFn: () => api.memberships.list(query),
    placeholderData: keepPreviousData,
    enabled: !range.error,
  });

  const onSearch = useCallback((q: string) => setState({ q, page: "1" }), [setState]);
  const filtersActive = Boolean(state.q || state.plan || state.ends);
  function clearFilters() {
    setState({ q: "", plan: "", ends: "", from: "", to: "", page: "1" });
    setSearchKey((k) => k + 1);
  }

  const data = list.data;
  const counts = data?.counts;

  return (
    <>
      <PageHeader
        title={t("memberships.title")}
        description={t("memberships.subtitle")}
        actions={
          <Button leftIcon={<Banknote aria-hidden />} onClick={() => openPaymentDrawer()}>
            {t("memberships.record")}
          </Button>
        }
      />

      <ToggleGroup.Root
        type="single"
        value={state.status || "ALL"}
        onValueChange={(value) => value && setState({ status: value === "ALL" ? "" : value, page: "1" })}
        aria-label={t("memberships.tabsLabel")}
        className="mb-4 flex scrollbar-thin gap-2 overflow-x-auto pb-1"
      >
        {TABS.map((tab) => (
          <ToggleGroup.Item
            key={tab.label}
            value={tab.value || "ALL"}
            className={cn(
              "group border-line bg-surface text-fg-muted shadow-card inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
              "hover:text-fg data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-on-primary",
            )}
          >
            {t(tab.label)}
            <span className="bg-tint text-fg tabular group-data-[state=on]:text-on-primary rounded-full px-2 py-0.5 text-xs group-data-[state=on]:bg-white/20">
              {counts ? tab.count(counts).toLocaleString("en-US") : "–"}
            </span>
            {tab.value === "ACTIVE" && counts ? (
              <span className="text-xs font-medium opacity-80">
                {t("memberships.inclExpiring", { count: counts.expiringSoon })}
              </span>
            ) : null}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      <Card className="mb-4 p-4">
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <SearchField
            key={searchKey}
            defaultValue={state.q}
            onSearch={onSearch}
            label={t("memberships.searchLabel")}
            placeholder={t("memberships.searchPlaceholder")}
            className="md:col-span-2 xl:col-span-1"
          />
          <Select
            aria-label={t("memberships.planFilter")}
            value={state.plan}
            onChange={(e) => setState({ plan: e.target.value, page: "1" })}
          >
            <option value="">{t("memberships.allPlans")}</option>
            {(plans.data ?? []).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {f.plan(plan.name, plan.durationDays)}
                {plan.isEnabled ? "" : t("common.disabledSuffix")}
              </option>
            ))}
          </Select>
          <div className="flex flex-col gap-2">
            <Select
              aria-label={t("memberships.endFilter")}
              value={state.ends}
              onChange={(e) => {
                const ends = e.target.value as EndsPreset;
                setState({
                  ends,
                  from: ends === "custom" ? gym.today : "",
                  to: ends === "custom" ? addDays(gym.today, 30) : "",
                  page: "1",
                });
              }}
            >
              <option value="">{t("memberships.endAny")}</option>
              <option value="next7">{t("memberships.endNext7")}</option>
              <option value="next30">{t("memberships.endNext30")}</option>
              <option value="past30">{t("memberships.endPast30")}</option>
              <option value="custom">{t("memberships.endCustom")}</option>
            </Select>
            {state.ends === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span id="ends-from-label" className="text-caption text-fg-muted font-semibold">
                    {t("common.from")}
                  </span>
                  <DateInput
                    value={state.from}
                    today={gym.today}
                    aria-labelledby="ends-from-label"
                    onChange={(date) => setState({ from: date, page: "1" })}
                    aria-invalid={range.error ? true : undefined}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span id="ends-to-label" className="text-caption text-fg-muted font-semibold">
                    {t("common.to")}
                  </span>
                  <DateInput
                    value={state.to}
                    today={gym.today}
                    aria-labelledby="ends-to-label"
                    onChange={(date) => setState({ to: date, page: "1" })}
                    aria-invalid={range.error ? true : undefined}
                  />
                </div>
                {range.error ? (
                  <p role="alert" className="text-caption text-danger col-span-2 font-medium">
                    {t("common.validation.fromAfterTo")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <Button variant="ghost" leftIcon={<FilterX aria-hidden />} onClick={clearFilters} disabled={!filtersActive}>
            {t("common.clearFilters")}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {list.isError && !data ? (
          <LoadError onRetry={() => void list.refetch()} retrying={list.isFetching} />
        ) : data && data.total === 0 ? (
          <EmptyState
            icon={<IdCard aria-hidden />}
            title={filtersActive || state.status ? t("memberships.noneTitle") : t("memberships.emptyTitle")}
            description={filtersActive || state.status ? t("memberships.noneText") : t("memberships.emptyText")}
            actions={
              filtersActive ? (
                <Button variant="secondary" leftIcon={<FilterX aria-hidden />} onClick={clearFilters}>
                  {t("common.clearFilters")}
                </Button>
              ) : null
            }
          />
        ) : (
          <div className={cn("transition-opacity", list.isPlaceholderData && "opacity-60")} aria-busy={list.isFetching}>
            <div className="hidden md:block">
              <Table caption={t("memberships.caption")}>
                <THead>
                  <tr>
                    <TH>{t("memberships.colMember")}</TH>
                    <TH className="hidden xl:table-cell">{t("memberships.colId")}</TH>
                    <TH className="hidden lg:table-cell">{t("memberships.colPlan")}</TH>
                    <TH className="hidden lg:table-cell">{t("memberships.colStart")}</TH>
                    <TH>{t("memberships.colEnd")}</TH>
                    <TH>{t("memberships.colRemaining")}</TH>
                    <TH>{t("memberships.colStatus")}</TH>
                    <TH align="right">{t("memberships.colAction")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {!data ? (
                    <TableSkeletonRows columns={8} />
                  ) : (
                    data.items.map((member) => {
                      const period = displayPeriod(member);
                      const timeline = timelineLabel(i18n, member, gym.today);
                      return (
                        <TR key={member.id} interactive>
                          <TD>
                            <div className="flex items-center gap-3">
                              <Avatar name={member.fullName} photoUrl={member.photoUrl} size="sm" />
                              <div className="min-w-0">
                                <Link href={`/members/${member.id}`} className="font-semibold hover:underline">
                                  {member.fullName}
                                </Link>
                                <p className="text-fg-muted tabular text-xs">{formatPhone(member.phone)}</p>
                              </div>
                            </div>
                          </TD>
                          <TD className="text-fg-muted hidden font-mono text-[13px] whitespace-nowrap xl:table-cell">
                            {member.memberCode}
                          </TD>
                          <TD className="hidden lg:table-cell">
                            {period ? f.plan(period.planName, period.durationDays) : "—"}
                          </TD>
                          <TD className="hidden whitespace-nowrap lg:table-cell">
                            {period ? f.date(period.startDate) : "—"}
                          </TD>
                          <TD className="whitespace-nowrap">
                            {member.membership.coverageEnd
                              ? f.date(member.membership.coverageEnd)
                              : period
                                ? f.date(period.endDate)
                                : "—"}
                          </TD>
                          <TD className={cn("font-medium whitespace-nowrap", timeline.tone)}>{timeline.text}</TD>
                          <TD>
                            <StatusBadge state={member.membership} detail="none" />
                          </TD>
                          <TD align="right">
                            <RowAction member={member} />
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </div>

            <ul className="divide-line divide-y md:hidden">
              {!data
                ? Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="p-4">
                      <Skeleton className="h-16 w-full" />
                    </li>
                  ))
                : data.items.map((member) => {
                    const period = displayPeriod(member);
                    const timeline = timelineLabel(i18n, member, gym.today);
                    return (
                      <li key={member.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <Avatar name={member.fullName} photoUrl={member.photoUrl} size="sm" />
                          <div className="min-w-0 flex-1">
                            <Link href={`/members/${member.id}`} className="font-semibold hover:underline">
                              {member.fullName}
                            </Link>
                            <p className="text-fg-muted text-xs">
                              {member.memberCode} ·{" "}
                              {period ? f.plan(period.planName, period.durationDays) : t("memberships.noPlan")}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <StatusBadge state={member.membership} detail="none" />
                              <span className={cn("text-sm font-medium", timeline.tone)}>{timeline.text}</span>
                            </div>
                          </div>
                          <RowAction member={member} />
                        </div>
                      </li>
                    );
                  })}
            </ul>

            {data ? (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                noun="members"
                onPageChange={(next) => setState({ page: String(next) })}
                onPageSizeChange={(size) => setState({ size: String(size), page: "1" })}
              />
            ) : null}
          </div>
        )}
      </Card>
    </>
  );
}
