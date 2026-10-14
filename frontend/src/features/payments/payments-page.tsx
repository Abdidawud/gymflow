"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Banknote, Ellipsis, FilterX, Printer, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangeFilter, RANGE_LABELS, resolveRange, type RangePreset } from "@/components/ui/date-range";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, LoadError } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { SortableTH, Table, TableSkeletonRows, TD, TH, THead, TR } from "@/components/ui/table";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api/client";
import {
  PAYMENT_METHODS,
  type PaymentMethod,
  type PaymentSortField,
  type PaymentSummary,
  type SortOrder,
} from "@gymflow/shared/api/types";
import { queryKeys } from "@/lib/query-keys";
import { toInt, useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/auth-provider";
import { usePlans } from "@/features/members/queries";
import { PaidBadge } from "@/features/members/status-badge";
import { usePaymentDrawer } from "./payment-drawer-provider";
import { PaymentMethodLabel } from "./payment-methods";

const DEFAULTS = {
  q: "",
  range: "all",
  from: "",
  to: "",
  method: "",
  plan: "",
  page: "1",
  size: "10",
  sort: "receivedDate",
  order: "desc",
};

function RowActions({ payment }: { payment: PaymentSummary }) {
  const { t } = useI18n();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <IconButton label={t("common.actionsFor", { name: payment.paymentCode })} className="md:size-9">
          <Ellipsis aria-hidden />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href={`/payments/${payment.id}`}>
            <ReceiptText aria-hidden />
            {t("payments.list.viewDetails")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/payments/${payment.id}?print=1`}>
            <Printer aria-hidden />
            {t("payments.list.printReceipt")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PaymentsPage() {
  const { t, f } = useI18n();
  const { gym, can } = useSession();
  const { openPaymentDrawer } = usePaymentDrawer();
  const [state, setState] = useUrlState(DEFAULTS);
  const [searchKey, setSearchKey] = useState(0);
  const plans = usePlans(true);

  const preset = state.range as RangePreset;
  const range = resolveRange(preset, gym.today, state.from, state.to);
  const page = toInt(state.page, 1);
  const pageSize = toInt(state.size, 10);
  const sort = state.sort as PaymentSortField;
  const order = state.order as SortOrder;
  const query = {
    search: state.q || undefined,
    from: range.from,
    to: range.to,
    method: (state.method || undefined) as PaymentMethod | undefined,
    planId: state.plan || undefined,
    sort,
    order,
    page,
    pageSize,
  };
  const payments = useQuery({
    queryKey: queryKeys.payments.list(query),
    queryFn: () => api.payments.list(query),
    placeholderData: keepPreviousData,
    enabled: !range.error,
  });

  const filtersActive = Boolean(state.q || preset !== "all" || state.method || state.plan);
  const onSearch = useCallback((q: string) => setState({ q, page: "1" }), [setState]);

  function clearFilters() {
    setState({ q: "", range: "all", from: "", to: "", method: "", plan: "", page: "1" });
    setSearchKey((k) => k + 1);
  }

  function toggleSort(field: PaymentSortField) {
    setState({ sort: field, order: sort === field && order === "desc" ? "asc" : "desc", page: "1" });
  }

  const data = payments.data;
  const rangeLabel =
    range.from && range.to
      ? range.from === range.to
        ? f.date(range.from)
        : f.dateRange(range.from, range.to)
      : t(RANGE_LABELS[preset]);

  return (
    <>
      <PageHeader
        title={t("payments.list.title")}
        description={t("payments.list.subtitle")}
        actions={
          <Button leftIcon={<Banknote aria-hidden />} onClick={() => openPaymentDrawer()}>
            {t("payments.list.record")}
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
          <SearchField
            key={searchKey}
            defaultValue={state.q}
            onSearch={onSearch}
            label={t("payments.list.searchLabel")}
            placeholder={t("payments.list.searchPlaceholder")}
            className="md:col-span-2 xl:col-span-1"
          />
          <DateRangeFilter
            preset={preset}
            from={state.from}
            to={state.to}
            today={gym.today}
            error={range.error ? t("common.validation.fromAfterTo") : undefined}
            onChange={(next) => setState({ range: next.preset, from: next.from, to: next.to, page: "1" })}
          />
          <Select
            aria-label={t("payments.list.methodFilter")}
            value={state.method}
            onChange={(e) => setState({ method: e.target.value, page: "1" })}
          >
            <option value="">{t("payments.list.allMethods")}</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {t(`labels.methods.${method}.label`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("payments.list.planFilter")}
            value={state.plan}
            onChange={(e) => setState({ plan: e.target.value, page: "1" })}
          >
            <option value="">{t("payments.list.allPlans")}</option>
            {(plans.data ?? []).map((plan) => (
              <option key={plan.id} value={plan.id}>
                {f.plan(plan.name, plan.durationDays)}
                {plan.isEnabled ? "" : t("common.disabledSuffix")}
              </option>
            ))}
          </Select>
          <Button variant="ghost" leftIcon={<FilterX aria-hidden />} onClick={clearFilters} disabled={!filtersActive}>
            {t("common.clearFilters")}
          </Button>
        </div>
      </Card>

      {can("revenue.view") ? (
        <section aria-label={t("payments.list.totals")} className="mb-4 grid gap-4 sm:grid-cols-2">
          {data?.summary ? (
            <>
              <StatCard
                label={t("payments.list.totalRevenue")}
                value={f.amount(data.summary.totalRevenue)}
                unit={f.currency}
                icon={<Wallet aria-hidden />}
                helper={
                  state.q || state.method || state.plan
                    ? t("payments.list.filtered", { range: rangeLabel })
                    : rangeLabel
                }
                className={cn(payments.isPlaceholderData && "opacity-60")}
              />
              <StatCard
                label={t("payments.list.transactions")}
                value={f.number(data.summary.transactions)}
                tone="success"
                icon={<ReceiptText aria-hidden />}
                helper={t("payments.list.allPaid", { range: rangeLabel })}
                className={cn(payments.isPlaceholderData && "opacity-60")}
              />
            </>
          ) : (
            <>
              <Skeleton className="h-[132px] rounded-xl" />
              <Skeleton className="h-[132px] rounded-xl" />
            </>
          )}
        </section>
      ) : null}

      <Card className="overflow-hidden">
        {payments.isError && !data ? (
          <LoadError onRetry={() => void payments.refetch()} retrying={payments.isFetching} />
        ) : data && data.total === 0 ? (
          filtersActive ? (
            <EmptyState
              title={t("payments.list.noneTitle")}
              description={t("payments.list.noneText")}
              actions={
                <Button variant="secondary" leftIcon={<FilterX aria-hidden />} onClick={clearFilters}>
                  {t("common.clearFilters")}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Banknote aria-hidden />}
              title={t("payments.list.emptyTitle")}
              description={t("payments.list.emptyText")}
              actions={
                <Button leftIcon={<Banknote aria-hidden />} onClick={() => openPaymentDrawer()}>
                  {t("payments.list.record")}
                </Button>
              }
            />
          )
        ) : (
          <div
            className={cn("transition-opacity", payments.isPlaceholderData && "opacity-60")}
            aria-busy={payments.isFetching}
          >
            <div className="hidden md:block">
              <Table caption={t("payments.list.caption")}>
                <THead>
                  <tr>
                    <TH>{t("payments.list.colId")}</TH>
                    <TH>{t("payments.list.colMember")}</TH>
                    <TH className="hidden xl:table-cell">{t("payments.list.colPlan")}</TH>
                    <SortableTH
                      align="right"
                      active={sort === "amount"}
                      direction={order}
                      onSort={() => toggleSort("amount")}
                    >
                      {t("payments.list.colAmount")}
                    </SortableTH>
                    <TH className="hidden lg:table-cell">{t("payments.list.colMethod")}</TH>
                    <SortableTH
                      active={sort === "receivedDate"}
                      direction={order}
                      onSort={() => toggleSort("receivedDate")}
                    >
                      {t("payments.list.colDate")}
                    </SortableTH>
                    <TH className="hidden 2xl:table-cell">{t("payments.list.colRecordedBy")}</TH>
                    <TH align="right">
                      <span className="sr-only">{t("payments.list.colActions")}</span>
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {!data ? (
                    <TableSkeletonRows columns={8} />
                  ) : (
                    data.items.map((payment) => (
                      <TR key={payment.id} interactive>
                        <TD>
                          <Link
                            href={`/payments/${payment.id}`}
                            className="text-link font-mono text-sm font-semibold hover:underline"
                          >
                            {payment.paymentCode}
                          </Link>
                          <div className="mt-1">
                            <PaidBadge />
                          </div>
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
                        <TD className="hidden xl:table-cell">{f.plan(payment.plan.name, payment.plan.durationDays)}</TD>
                        <TD align="right" className="tabular font-semibold whitespace-nowrap">
                          {f.money(payment.amount)}
                        </TD>
                        <TD className="hidden lg:table-cell">
                          <PaymentMethodLabel method={payment.method} />
                          {payment.reference ? (
                            <p className="text-fg-muted mt-0.5 font-mono text-xs">{payment.reference}</p>
                          ) : null}
                        </TD>
                        <TD className="whitespace-nowrap">
                          {f.date(payment.receivedDate)}
                          <p className="text-fg-muted text-xs">
                            {t("payments.list.entered", { timestamp: f.timestamp(payment.createdAt) })}
                          </p>
                        </TD>
                        <TD className="text-fg-muted hidden whitespace-nowrap 2xl:table-cell">
                          {payment.recordedBy.fullName}
                        </TD>
                        <TD align="right">
                          <RowActions payment={payment} />
                        </TD>
                      </TR>
                    ))
                  )}
                </tbody>
              </Table>
            </div>

            <ul className="divide-line divide-y md:hidden">
              {!data
                ? Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="p-4">
                      <Skeleton className="h-14 w-full" />
                    </li>
                  ))
                : data.items.map((payment) => (
                    <li key={payment.id} className="flex items-start gap-3 p-4">
                      <Avatar name={payment.member.fullName} photoUrl={payment.member.photoUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/payments/${payment.id}`} className="text-fg font-semibold hover:underline">
                          {payment.member.fullName}
                        </Link>
                        <p className="text-fg-muted text-xs">
                          {payment.paymentCode} · {payment.plan.name} · {t(`labels.methods.${payment.method}.label`)}
                        </p>
                        <p className="text-fg-muted text-xs">
                          {t("payments.list.paidOn", { date: f.date(payment.receivedDate) })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className="text-sm font-semibold whitespace-nowrap">{f.money(payment.amount)}</p>
                        <RowActions payment={payment} />
                      </div>
                    </li>
                  ))}
            </ul>

            {data ? (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                noun="payments"
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
