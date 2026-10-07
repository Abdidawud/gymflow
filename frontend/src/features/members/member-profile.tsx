"use client";

import {
  Archive,
  ArchiveRestore,
  Banknote,
  CalendarClock,
  CalendarX,
  CircleCheck,
  ContactRound,
  History,
  IdCard,
  Mail,
  NotebookPen,
  Pencil,
  Phone,
  ReceiptText,
  RefreshCw,
  UserRound,
  UserRoundX,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, DetailItem } from "@/components/ui/card";
import { Alert, EmptyState, LoadError, StatusScreen } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableSkeletonRows, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { validitySentence } from "@/i18n/membership";
import { useI18n } from "@/i18n/provider";
import { isApiError } from "@/lib/api/errors";
import type { MemberDetail, MemberMembershipHistoryItem } from "@/lib/api/types";
import { daysBetween } from "@/lib/domain/dates";
import { formatPhone } from "@/lib/domain/phone";
import { listReturnUrl, useUrlState } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/auth-provider";
import { usePaymentDrawer } from "@/features/payments/payment-drawer-provider";
import { PaymentMethodLabel } from "@/features/payments/payment-methods";
import { ArchiveMemberDialog, paymentActionLabel } from "./member-actions";
import { useMember, useMemberMemberships, useMemberPayments } from "./queries";
import { ArchivedBadge, PaidBadge, StatusBadge } from "./status-badge";

const TAB_DEFAULTS = { tab: "overview", ppage: "1", mpage: "1" };

export function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const member = useMember(id);
  const membersHref = listReturnUrl("/members");

  if (member.isPending) return <ProfileSkeleton />;
  if (member.isError) {
    if (isApiError(member.error, "NOT_FOUND")) {
      return <StatusScreen kind="not-found" backHref={membersHref} backLabel={t("members.list.backToList")} />;
    }
    return (
      <Card>
        <LoadError onRetry={() => void member.refetch()} retrying={member.isFetching} />
      </Card>
    );
  }
  return <Profile member={member.data} membersHref={membersHref} />;
}

function Profile({ member, membersHref }: { member: MemberDetail; membersHref: string }) {
  const { t, f } = useI18n();
  const { can } = useSession();
  const { openPaymentDrawer } = usePaymentDrawer();
  const params = useSearchParams();
  const [state, setState] = useUrlState(TAB_DEFAULTS);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [registeredDismissed, setRegisteredDismissed] = useState(false);
  const justRegistered = params.get("registered") === "1" && !registeredDismissed;

  const paymentLabel = paymentActionLabel(member);
  const canPay = member.permittedActions.recordPayment;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: t("members.list.title"), href: membersHref }, { label: member.fullName }]}
        title={member.fullName}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            {member.isArchived ? <ArchivedBadge /> : null}
            <StatusBadge state={member.membership} detail="long" />
          </div>
        }
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href={`/members/${member.id}/edit`}>
                <Pencil aria-hidden />
                {t("members.actions.edit")}
              </Link>
            </Button>
            {member.permittedActions.archive ? (
              <Button variant="ghost" leftIcon={<Archive aria-hidden />} onClick={() => setArchiveOpen(true)}>
                {t("members.actions.archiveShort")}
              </Button>
            ) : null}
            {!member.isArchived ? (
              <Button
                leftIcon={member.membership.hasPaidMembership ? <RefreshCw aria-hidden /> : <Banknote aria-hidden />}
                onClick={() => openPaymentDrawer({ memberId: member.id })}
                disabled={!canPay}
              >
                {t(paymentLabel)}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {justRegistered ? (
          <Alert
            tone="success"
            live
            title={t("members.profile.registeredTitle")}
            action={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => openPaymentDrawer({ memberId: member.id })}
                  leftIcon={<Banknote aria-hidden />}
                >
                  {t("members.actions.firstPayment")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRegisteredDismissed(true)}>
                  {t("common.dismiss")}
                </Button>
              </div>
            }
          >
            {t("members.profile.registeredText", { name: member.fullName, code: member.memberCode })}
          </Alert>
        ) : null}

        {member.isArchived ? (
          <Alert
            tone="warning"
            icon={<Archive aria-hidden />}
            title={t("members.profile.archivedTitle")}
            action={
              member.permittedActions.reactivate ? (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<ArchiveRestore aria-hidden />}
                  onClick={() => setArchiveOpen(true)}
                >
                  {t("members.actions.reactivateShort")}
                </Button>
              ) : null
            }
          >
            {member.archivedAt ? `${t("members.profile.archivedOn", { date: f.timestamp(member.archivedAt) })} ` : ""}
            {member.permittedActions.reactivate
              ? t("members.profile.archivedTextYou")
              : t("members.profile.archivedTextAdmin")}
          </Alert>
        ) : null}

        <IdentityCard member={member} />
        <MembershipCard member={member} />

        <Tabs value={state.tab} onValueChange={(tab) => setState({ tab })}>
          <TabsList aria-label={t("members.profile.tabsLabel")}>
            <TabsTrigger value="overview" icon={<UserRound aria-hidden />}>
              {t("members.profile.tabOverview")}
            </TabsTrigger>
            <TabsTrigger value="payments" icon={<ReceiptText aria-hidden />} count={member.paymentCount}>
              {t("members.profile.tabPayments")}
            </TabsTrigger>
            <TabsTrigger value="memberships" icon={<History aria-hidden />} count={member.membershipCount}>
              {t("members.profile.tabMemberships")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4 focus-visible:outline-none">
            <OverviewTab member={member} />
          </TabsContent>
          <TabsContent value="payments" className="mt-4 focus-visible:outline-none">
            <PaymentHistoryTab
              member={member}
              page={Number(state.ppage) || 1}
              onPage={(p) => setState({ ppage: String(p) })}
            />
          </TabsContent>
          <TabsContent value="memberships" className="mt-4 focus-visible:outline-none">
            <MembershipHistoryTab
              member={member}
              page={Number(state.mpage) || 1}
              onPage={(p) => setState({ mpage: String(p) })}
            />
          </TabsContent>
        </Tabs>
      </div>

      {can("members.archive") ? (
        <ArchiveMemberDialog member={archiveOpen ? member : null} onOpenChange={setArchiveOpen} />
      ) : null}
    </>
  );
}

function IdentityCard({ member }: { member: MemberDetail }) {
  const { t, f } = useI18n();
  return (
    <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
      <Avatar name={member.fullName} photoUrl={member.photoUrl} size="xl" />
      <dl className="grid flex-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-2.5">
          <IdCard aria-hidden className="text-fg-subtle size-[18px]" />
          <div>
            <dt className="text-fg-muted text-xs">{t("members.profile.memberId")}</dt>
            <dd className="text-fg font-mono font-semibold">{member.memberCode}</dd>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Phone aria-hidden className="text-fg-subtle size-[18px]" />
          <div>
            <dt className="text-fg-muted text-xs">{t("members.profile.phone")}</dt>
            <dd className="text-fg font-semibold">
              <a href={`tel:${member.phone}`} className="hover:underline">
                {formatPhone(member.phone)}
              </a>
            </dd>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <Mail aria-hidden className="text-fg-subtle size-[18px] shrink-0" />
          <div className="min-w-0">
            <dt className="text-fg-muted text-xs">{t("members.profile.email")}</dt>
            <dd className="text-fg truncate font-semibold">
              {member.email ?? <span className="text-fg-muted font-normal">{t("common.notProvided")}</span>}
            </dd>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <CalendarClock aria-hidden className="text-fg-subtle size-[18px]" />
          <div>
            <dt className="text-fg-muted text-xs">{t("members.profile.registered")}</dt>
            <dd className="text-fg font-semibold">{f.date(member.registrationDate)}</dd>
          </div>
        </div>
      </dl>
    </Card>
  );
}

/** Current membership, validity in plain language, and scheduled periods (design.md §11). */
function MembershipCard({ member }: { member: MemberDetail }) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const { gym } = useSession();
  const { openPaymentDrawer } = usePaymentDrawer();
  const m = member.membership;
  const sentence = validitySentence(i18n, m);
  const canPay = member.permittedActions.recordPayment;
  const payButton = canPay ? (
    <Button onClick={() => openPaymentDrawer({ memberId: member.id })} leftIcon={<Banknote aria-hidden />}>
      {t(paymentActionLabel(member))}
    </Button>
  ) : null;

  if (m.status === "UNPAID") {
    return (
      <Card>
        <EmptyState
          icon={<UserRoundX aria-hidden />}
          title={t("members.profile.noPaidTitle")}
          description={t("members.profile.noPaidText")}
          actions={payButton}
        />
      </Card>
    );
  }

  if (m.status === "EXPIRED" && m.last) {
    return (
      <Card className="border-error-bg">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span className="bg-error-bg text-error-fg flex size-11 shrink-0 items-center justify-center rounded-xl">
              <CalendarX aria-hidden className="size-6" />
            </span>
            <div>
              <h2 className="text-fg text-lg font-semibold">
                {t("members.profile.expiredTitle", { date: f.date(m.last.endDate) })}
              </h2>
              <p className="text-fg-muted mt-0.5 text-sm">
                {t("members.profile.expiredText", {
                  plan: f.plan(m.last.planName, m.last.durationDays),
                  range: f.dateRange(m.last.startDate, m.last.endDate),
                })}
              </p>
            </div>
          </div>
          {payButton}
        </div>
      </Card>
    );
  }

  if (m.status === "SCHEDULED" && m.next) {
    return (
      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span className="bg-info-bg text-info-fg flex size-11 shrink-0 items-center justify-center rounded-xl">
              <CalendarClock aria-hidden className="size-6" />
            </span>
            <div>
              <h2 className="text-fg text-lg font-semibold">
                {t("members.profile.scheduledTitle", { date: f.date(m.next.startDate) })}
              </h2>
              <p className="text-fg-muted mt-0.5 text-sm">
                {t("members.profile.scheduledText", {
                  plan: f.plan(m.next.planName, m.next.durationDays),
                  range: f.dateRange(m.next.startDate, m.next.endDate),
                })}
              </p>
            </div>
          </div>
          {payButton}
        </div>
        <UpcomingList member={member} />
      </Card>
    );
  }

  const current = m.current!;
  const totalDays = current.durationDays;
  const usedDays = Math.min(totalDays, daysBetween(current.startDate, gym.today) + 1);
  const leftInPeriod = totalDays - usedDays;
  const percent = Math.round((usedDays / totalDays) * 1000) / 10;
  const expiring = m.status === "EXPIRING_SOON";

  return (
    <Card>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              expiring ? "bg-warning-bg text-warning-fg" : "bg-success-bg text-success-fg",
            )}
          >
            <CircleCheck aria-hidden className="size-6" />
          </span>
          <div>
            <p className="text-fg-muted text-sm">{t("members.profile.currentPlan")}</p>
            <h2 className="text-fg text-lg font-semibold">{f.plan(current.planName, current.durationDays)}</h2>
            <p className="text-fg-muted mt-0.5 text-sm">{sentence}</p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className={cn("text-metric-sm", expiring ? "text-warning-fg" : "text-success-fg")}>
            {m.remainingDays === 0 ? t("members.profile.expiresToday") : f.days(m.remainingDays ?? 0)}
          </p>
          <p className="text-fg-muted text-sm">
            {m.remainingDays === 0 ? t("members.profile.validEndOfDay") : t("members.profile.remaining")}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          <DetailItem label={t("members.profile.startDate")}>{f.date(current.startDate)}</DetailItem>
          <DetailItem label={t("members.profile.endDate")}>{f.date(current.endDate)}</DetailItem>
          <DetailItem label={t("members.profile.periodRemaining")}>
            {leftInPeriod === 0 ? t("members.profile.endsToday") : f.days(leftInPeriod)}
          </DetailItem>
        </dl>
        <div className="bg-tint mt-5 rounded-lg p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg font-medium">
              {t("members.profile.dayOf", { day: usedDays, total: totalDays })}
            </span>
            <span className="text-fg-muted">
              {leftInPeriod === 0 ? t("members.profile.lastDay") : t("labels.detail.daysLeft", { count: leftInPeriod })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t("members.profile.progressLabel")}
            aria-valuemin={0}
            aria-valuemax={totalDays}
            aria-valuenow={usedDays}
            aria-valuetext={t("members.profile.dayOf", { day: usedDays, total: totalDays })}
            className="bg-tint-strong mt-2 h-2.5 overflow-hidden rounded-full"
          >
            <div
              className={cn("h-full rounded-full", expiring ? "bg-warning-fg" : "bg-primary")}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-fg-muted mt-2 flex justify-between text-xs">
            <span>{f.date(current.startDate)}</span>
            <span>{t("members.profile.todayLabel", { date: f.date(gym.today) })}</span>
            <span>{f.date(current.endDate)}</span>
          </div>
        </div>
      </div>
      <UpcomingList member={member} />
    </Card>
  );
}

function UpcomingList({ member }: { member: MemberDetail }) {
  const { t, f } = useI18n();
  if (member.upcoming.length === 0) return null;
  return (
    <div className="border-line border-t px-5 py-4 sm:px-6">
      <h3 className="text-fg text-sm font-semibold">{t("members.profile.scheduledPeriods")}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {member.upcoming.map((period) => (
          <li
            key={period.id}
            className="bg-info-bg/50 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <span className="text-fg font-medium">{f.plan(period.planName, period.durationDays)}</span>
            <span className="text-fg-muted">
              {f.dateRange(period.startDate, period.endDate)} ·{" "}
              <Link href={`/payments/${period.paymentId}`} className="text-link font-mono hover:underline">
                {period.paymentCode}
              </Link>
            </span>
            <Badge tone="info">{t("labels.periodStatus.UPCOMING")}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OverviewTab({ member }: { member: MemberDetail }) {
  const { t, f } = useI18n();
  const gender = member.gender ? t(`labels.gender.${member.gender}`) : t("labels.gender.unspecified");
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader icon={<UserRound aria-hidden />} title={t("members.profile.personal")} titleAs="h3" />
        <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-3">
          <DetailItem label={t("members.profile.firstName")}>{member.firstName}</DetailItem>
          <DetailItem label={t("members.profile.lastName")}>{member.lastName}</DetailItem>
          <DetailItem label={t("members.profile.memberId")}>
            <span className="font-mono">{member.memberCode}</span>
          </DetailItem>
          <DetailItem label={t("members.profile.phoneNumber")}>{formatPhone(member.phone)}</DetailItem>
          <DetailItem label={t("members.profile.email")}>{member.email ?? "—"}</DetailItem>
          <DetailItem label={t("members.profile.gender")}>{gender}</DetailItem>
          <DetailItem label={t("members.profile.registrationDate")}>{f.date(member.registrationDate)}</DetailItem>
          <DetailItem label={t("members.profile.lastUpdated")}>{f.timestamp(member.updatedAt)}</DetailItem>
        </dl>
      </Card>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<ContactRound aria-hidden />} title={t("members.profile.emergency")} titleAs="h3" />
          {member.emergencyName ? (
            <dl className="grid gap-5 px-5 py-5 sm:px-6">
              <DetailItem label={t("members.profile.contactName")}>{member.emergencyName}</DetailItem>
              <DetailItem label={t("members.profile.relationship")}>{member.emergencyRelationship ?? "—"}</DetailItem>
              <DetailItem label={t("members.profile.contactPhone")}>
                {member.emergencyPhone ? (
                  <a href={`tel:${member.emergencyPhone}`} className="text-link hover:underline">
                    {formatPhone(member.emergencyPhone)}
                  </a>
                ) : (
                  "—"
                )}
              </DetailItem>
            </dl>
          ) : (
            <p className="text-fg-muted px-5 py-5 text-sm sm:px-6">{t("members.profile.noEmergency")}</p>
          )}
        </Card>
        <Card>
          <CardHeader icon={<NotebookPen aria-hidden />} title={t("members.profile.additional")} titleAs="h3" />
          <dl className="grid gap-5 px-5 py-5 sm:px-6">
            <DetailItem label={t("members.profile.address")}>{member.address ?? "—"}</DetailItem>
            <DetailItem label={t("members.profile.notes")}>
              {member.notes ? <span className="whitespace-pre-line">{member.notes}</span> : "—"}
            </DetailItem>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function PaymentHistoryTab({
  member,
  page,
  onPage,
}: {
  member: MemberDetail;
  page: number;
  onPage: (p: number) => void;
}) {
  const { t, f } = useI18n();
  const { openPaymentDrawer } = usePaymentDrawer();
  const payments = useMemberPayments(member.id, page);
  const data = payments.data;

  return (
    <Card className="overflow-hidden">
      {payments.isError && !data ? (
        <LoadError onRetry={() => void payments.refetch()} />
      ) : data && data.total === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden />}
          title={t("members.profile.payments.emptyTitle")}
          description={t("members.profile.payments.emptyText")}
          actions={
            member.permittedActions.recordPayment ? (
              <Button onClick={() => openPaymentDrawer({ memberId: member.id })} leftIcon={<Banknote aria-hidden />}>
                {t("members.actions.firstPayment")}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className={cn(payments.isPlaceholderData && "opacity-60")}>
          <Table caption={t("members.profile.payments.caption", { name: member.fullName })}>
            <THead>
              <tr>
                <TH>{t("members.profile.payments.paymentId")}</TH>
                <TH>{t("members.profile.payments.date")}</TH>
                <TH>{t("members.profile.payments.plan")}</TH>
                <TH className="hidden md:table-cell">{t("members.profile.payments.method")}</TH>
                <TH align="right">{t("members.profile.payments.amount")}</TH>
                <TH className="hidden sm:table-cell">{t("members.profile.payments.status")}</TH>
                <TH align="right">{t("members.profile.payments.receipt")}</TH>
              </tr>
            </THead>
            <tbody>
              {!data ? (
                <TableSkeletonRows columns={7} rows={4} />
              ) : (
                data.items.map((payment) => (
                  <TR key={payment.id} interactive>
                    <TD className="font-mono text-sm font-semibold whitespace-nowrap">{payment.paymentCode}</TD>
                    <TD className="whitespace-nowrap">{f.date(payment.receivedDate)}</TD>
                    <TD>{f.plan(payment.plan.name, payment.plan.durationDays)}</TD>
                    <TD className="hidden md:table-cell">
                      <PaymentMethodLabel method={payment.method} />
                    </TD>
                    <TD align="right" className="tabular font-semibold whitespace-nowrap">
                      {f.money(payment.amount)}
                    </TD>
                    <TD className="hidden sm:table-cell">
                      <PaidBadge />
                    </TD>
                    <TD align="right">
                      <Button variant="link" size="sm" asChild>
                        <Link href={`/payments/${payment.id}`}>{t("members.profile.payments.viewReceipt")}</Link>
                      </Button>
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
          {data ? (
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              noun="payments"
              onPageChange={onPage}
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}

const PERIOD_TONE: Record<MemberMembershipHistoryItem["periodStatus"], "success" | "info" | "neutral"> = {
  CURRENT: "success",
  UPCOMING: "info",
  ENDED: "neutral",
};

function MembershipHistoryTab({
  member,
  page,
  onPage,
}: {
  member: MemberDetail;
  page: number;
  onPage: (p: number) => void;
}) {
  const { t, f } = useI18n();
  const history = useMemberMemberships(member.id, page);
  const data = history.data;

  return (
    <Card className="overflow-hidden">
      {history.isError && !data ? (
        <LoadError onRetry={() => void history.refetch()} />
      ) : data && data.total === 0 ? (
        <EmptyState
          icon={<History aria-hidden />}
          title={t("members.profile.history.emptyTitle")}
          description={t("members.profile.history.emptyText")}
        />
      ) : (
        <div className={cn(history.isPlaceholderData && "opacity-60")}>
          <Table caption={t("members.profile.history.caption", { name: member.fullName })}>
            <THead>
              <tr>
                <TH>{t("members.profile.history.plan")}</TH>
                <TH>{t("members.profile.history.start")}</TH>
                <TH>{t("members.profile.history.end")}</TH>
                <TH>{t("members.profile.history.status")}</TH>
                <TH className="hidden md:table-cell">{t("members.profile.history.type")}</TH>
                <TH align="right">{t("members.profile.history.payment")}</TH>
              </tr>
            </THead>
            <tbody>
              {!data ? (
                <TableSkeletonRows columns={6} rows={4} />
              ) : (
                data.items.map((period) => {
                  const tone = PERIOD_TONE[period.periodStatus];
                  return (
                    <TR key={period.id} interactive>
                      <TD>
                        <p className="font-medium">{f.plan(period.planName, period.durationDays)}</p>
                        <p className="text-fg-muted text-xs">{f.money(period.price)}</p>
                      </TD>
                      <TD className="whitespace-nowrap">{f.date(period.startDate)}</TD>
                      <TD className="whitespace-nowrap">{f.date(period.endDate)}</TD>
                      <TD>
                        <Badge tone={tone}>{t(`labels.periodStatus.${period.periodStatus}`)}</Badge>
                      </TD>
                      <TD className="text-fg-muted hidden md:table-cell">
                        {period.isRenewal ? t("members.profile.history.renewal") : t("members.profile.history.first")}
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/payments/${period.paymentId}`}
                          className="text-link font-mono text-sm font-semibold hover:underline"
                        >
                          {period.paymentCode}
                        </Link>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
          {data ? (
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              noun="periods"
              onPageChange={onPage}
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}

function ProfileSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{t("members.profile.loading")}</span>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-12 w-96 max-w-full rounded-xl" />
    </div>
  );
}
