"use client";

import { Banknote, FilterX, Plus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadError } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableTH, Table, TableSkeletonRows, TD, TH, THead, TR } from "@/components/ui/table";
import { useI18n, type I18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import type { MemberSortField, MemberSummary, MembershipStatus, SortOrder } from "@gymflow/shared/api/types";
import { formatPhone } from "@gymflow/shared/domain/phone";
import { toInt, useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { usePaymentDrawer } from "@/features/payments/payment-drawer-provider";
import { ArchiveMemberDialog, MemberActions, paymentActionLabel } from "./member-actions";
import { useMembers, usePlans } from "./queries";
import { ArchivedBadge, StatusBadge } from "./status-badge";

const DEFAULTS = {
  q: "",
  status: "",
  plan: "",
  account: "current",
  page: "1",
  size: "10",
  sort: "name",
  order: "asc",
};

export const STATUS_FILTER_OPTIONS: { value: MembershipStatus | ""; label: MessageKey }[] = [
  { value: "", label: "members.list.allStatuses" },
  { value: "ACTIVE", label: "members.list.activeIncl" },
  { value: "EXPIRING_SOON", label: "labels.status.EXPIRING_SOON" },
  { value: "EXPIRED", label: "labels.status.EXPIRED" },
  { value: "SCHEDULED", label: "labels.status.SCHEDULED" },
  { value: "UNPAID", label: "labels.status.UNPAID" },
];

/** The plan column shows current, else next, else last plan; em dash when unpaid. */
function planCell({ f }: I18n, member: MemberSummary) {
  const period = member.membership.current ?? member.membership.next ?? member.membership.last;
  return period ? f.plan(period.planName, period.durationDays) : "—";
}

/** Membership end, or "Starts …" with the scheduled range. */
function endCell({ t, f }: I18n, member: MemberSummary) {
  const m = member.membership;
  if (m.status === "SCHEDULED" && m.next) {
    return t("members.list.starts", { date: f.dateRange(m.next.startDate, m.next.endDate) });
  }
  if (m.coverageEnd) return f.date(m.coverageEnd);
  if (m.last) return f.date(m.last.endDate);
  return "—";
}

export function MembersPage() {
  const i18n = useI18n();
  const { t } = i18n;
  const [state, setState] = useUrlState(DEFAULTS);
  const [searchKey, setSearchKey] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<MemberSummary | null>(null);
  const { openPaymentDrawer } = usePaymentDrawer();

  const page = toInt(state.page, 1);
  const pageSize = toInt(state.size, 10);
  const sort = state.sort as MemberSortField;
  const order = state.order as SortOrder;
  const members = useMembers({
    search: state.q || undefined,
    status: (state.status || undefined) as MembershipStatus | undefined,
    planId: state.plan || undefined,
    archived: state.account === "archived",
    sort,
    order,
    page,
    pageSize,
  });
  const plans = usePlans(true);

  const filtersActive = Boolean(state.q || state.status || state.plan || state.account !== "current");
  const onSearch = useCallback((q: string) => setState({ q, page: "1" }), [setState]);

  function clearFilters() {
    setState({ q: "", status: "", plan: "", account: "current", page: "1" });
    setSearchKey((key) => key + 1);
  }

  function toggleSort(field: MemberSortField) {
    setState({ sort: field, order: sort === field && order === "asc" ? "desc" : "asc", page: "1" });
  }

  const data = members.data;
  const rows = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t("members.list.title")}
        description={t("members.list.subtitle")}
        actions={
          <Button asChild>
            <Link href="/members/new">
              <Plus aria-hidden />
              {t("members.list.add")}
            </Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
          <SearchField
            key={searchKey}
            defaultValue={state.q}
            onSearch={onSearch}
            label={t("members.list.searchLabel")}
            placeholder={t("members.list.searchPlaceholder")}
            className="md:col-span-2 xl:col-span-1"
          />
          <Select
            aria-label={t("members.list.statusFilter")}
            value={state.status}
            onChange={(event) => setState({ status: event.target.value, page: "1" })}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("members.list.planFilter")}
            value={state.plan}
            onChange={(event) => setState({ plan: event.target.value, page: "1" })}
          >
            <option value="">{t("members.list.allPlans")}</option>
            {(plans.data ?? []).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {i18n.f.plan(plan.name, plan.durationDays)}
                {plan.isEnabled ? "" : t("common.disabledSuffix")}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("members.list.accountFilter")}
            value={state.account}
            onChange={(event) => setState({ account: event.target.value, page: "1" })}
          >
            <option value="current">{t("members.list.current")}</option>
            <option value="archived">{t("members.list.archived")}</option>
          </Select>
          <Button variant="ghost" leftIcon={<FilterX aria-hidden />} onClick={clearFilters} disabled={!filtersActive}>
            {t("common.clearFilters")}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {members.isError && !data ? (
          <LoadError onRetry={() => void members.refetch()} retrying={members.isFetching} />
        ) : data && data.total === 0 ? (
          filtersActive ? (
            <EmptyState
              title={t("members.list.noneTitle")}
              description={t("members.list.noneText")}
              actions={
                <>
                  <Button variant="secondary" leftIcon={<FilterX aria-hidden />} onClick={clearFilters}>
                    {t("common.clearFilters")}
                  </Button>
                  <Button asChild>
                    <Link href="/members/new">
                      <UserPlus aria-hidden />
                      {t("members.list.add")}
                    </Link>
                  </Button>
                </>
              }
            />
          ) : (
            <EmptyState
              icon={<Users aria-hidden />}
              title={t("members.list.emptyTitle")}
              description={t("members.list.emptyText")}
              actions={
                <Button asChild>
                  <Link href="/members/new">
                    <UserPlus aria-hidden />
                    {t("members.list.add")}
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <div
            className={cn("transition-opacity", members.isPlaceholderData && "opacity-60")}
            aria-busy={members.isFetching}
          >
            {/* Desktop and tablet: table */}
            <div className="hidden md:block">
              <Table caption={t("members.list.caption")}>
                <THead>
                  <tr>
                    <SortableTH active={sort === "name"} direction={order} onSort={() => toggleSort("name")}>
                      {t("members.list.colMember")}
                    </SortableTH>
                    <SortableTH
                      active={sort === "memberCode"}
                      direction={order}
                      onSort={() => toggleSort("memberCode")}
                    >
                      {t("members.list.colId")}
                    </SortableTH>
                    <TH className="hidden lg:table-cell">{t("members.list.colPhone")}</TH>
                    <TH className="hidden xl:table-cell">{t("members.list.colPlan")}</TH>
                    <SortableTH active={sort === "endDate"} direction={order} onSort={() => toggleSort("endDate")}>
                      {t("members.list.colEnd")}
                    </SortableTH>
                    <TH>{t("members.list.colStatus")}</TH>
                    <TH align="right">
                      <span className="sr-only">{t("members.list.colActions")}</span>
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {!data ? (
                    <TableSkeletonRows columns={7} rows={pageSize > 10 ? 10 : pageSize} />
                  ) : (
                    rows.map((member) => (
                      <TR key={member.id} interactive>
                        <TD>
                          <div className="flex items-center gap-3">
                            <Avatar name={member.fullName} photoUrl={member.photoUrl} />
                            <div className="min-w-0">
                              <Link href={`/members/${member.id}`} className="text-fg font-semibold hover:underline">
                                {member.fullName}
                              </Link>
                              {member.email ? (
                                <p className="text-fg-muted max-w-56 truncate text-xs">{member.email}</p>
                              ) : null}
                            </div>
                          </div>
                        </TD>
                        <TD className="text-fg-muted font-mono text-[13px] whitespace-nowrap">{member.memberCode}</TD>
                        <TD className="tabular hidden whitespace-nowrap lg:table-cell">{formatPhone(member.phone)}</TD>
                        <TD className="hidden xl:table-cell">{planCell(i18n, member)}</TD>
                        <TD className="whitespace-nowrap">{endCell(i18n, member)}</TD>
                        <TD>
                          {member.isArchived ? (
                            <div className="flex flex-col items-start gap-1">
                              <ArchivedBadge />
                              <StatusBadge state={member.membership} detail="none" />
                            </div>
                          ) : (
                            <StatusBadge state={member.membership} />
                          )}
                        </TD>
                        <TD align="right">
                          <MemberActions member={member} onArchiveToggle={setArchiveTarget} />
                        </TD>
                      </TR>
                    ))
                  )}
                </tbody>
              </Table>
            </div>

            {/* Mobile: member cards with status near every name (design.md §19) */}
            <ul className="divide-line divide-y md:hidden">
              {!data
                ? Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="p-4">
                      <Skeleton className="h-16 w-full" />
                    </li>
                  ))
                : rows.map((member) => (
                    <li key={member.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar name={member.fullName} photoUrl={member.photoUrl} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/members/${member.id}`} className="text-fg font-semibold hover:underline">
                            {member.fullName}
                          </Link>
                          <p className="text-fg-muted text-sm">
                            {member.memberCode} · {formatPhone(member.phone)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {member.isArchived ? <ArchivedBadge /> : null}
                            <StatusBadge state={member.membership} />
                          </div>
                          <p className="text-fg-muted mt-1.5 text-xs">
                            {planCell(i18n, member)} ·{" "}
                            {member.membership.status === "SCHEDULED"
                              ? endCell(i18n, member)
                              : t("members.list.ends", { date: endCell(i18n, member) })}
                          </p>
                        </div>
                        <MemberActions member={member} onArchiveToggle={setArchiveTarget} />
                      </div>
                      {!member.isArchived ? (
                        <Button
                          variant={member.membership.status === "ACTIVE" ? "secondary" : "soft"}
                          className="mt-3 w-full"
                          leftIcon={<Banknote aria-hidden />}
                          onClick={() => openPaymentDrawer({ memberId: member.id })}
                        >
                          {t(paymentActionLabel(member))}
                        </Button>
                      ) : null}
                    </li>
                  ))}
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

      <ArchiveMemberDialog member={archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)} />
    </>
  );
}
