"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Lock, Printer, ReceiptText, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, DetailItem } from "@/components/ui/card";
import { Alert, LoadError, StatusScreen } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/provider";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { formatPhone } from "@gymflow/shared/domain/phone";
import { queryKeys } from "@/lib/query-keys";
import { listReturnUrl } from "@/lib/url-state";
import { ArchivedBadge, PaidBadge } from "@/features/members/status-badge";
import { PaymentMethodLabel } from "./payment-methods";
import { ReceiptLayout } from "./receipt";

/** Read-only payment details with printable receipt (design.md §13). No edit/delete on posted payments. */
export function PaymentDetailsPage() {
  const { t, f } = useI18n();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const receipt = useQuery({ queryKey: queryKeys.payments.receipt(id), queryFn: () => api.payments.receipt(id) });
  const printed = useRef(false);
  const paymentsHref = listReturnUrl("/payments");

  // "Print Receipt" from the payments list opens this page with ?print=1.
  useEffect(() => {
    if (params.get("print") === "1" && receipt.isSuccess && !printed.current) {
      printed.current = true;
      router.replace(`/payments/${id}`, { scroll: false });
      const timer = setTimeout(() => window.print(), 250);
      return () => clearTimeout(timer);
    }
  }, [params, receipt.isSuccess, router, id]);

  if (receipt.isPending) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-6">
        <span className="sr-only">{t("payments.details.loading")}</span>
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          <Skeleton className="h-[520px] rounded-xl" />
          <Skeleton className="h-[640px] rounded-xl" />
        </div>
      </div>
    );
  }
  if (receipt.isError) {
    if (isApiError(receipt.error, "NOT_FOUND")) {
      return <StatusScreen kind="not-found" backHref={paymentsHref} backLabel={t("payments.details.back")} />;
    }
    return (
      <Card>
        <LoadError onRetry={() => void receipt.refetch()} retrying={receipt.isFetching} />
      </Card>
    );
  }

  const { payment } = receipt.data;
  const sameDay = f.date(payment.receivedDate) === f.timestamp(payment.createdAt).split(" · ")[0];

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          breadcrumbs={[{ label: t("payments.list.title"), href: paymentsHref }, { label: payment.paymentCode }]}
          title={t("payments.details.title")}
          badge={
            <div className="flex items-center gap-2">
              <PaidBadge />
              <Badge tone="neutral" icon={<Lock aria-hidden />}>
                {t("labels.readOnly")}
              </Badge>
            </div>
          }
          actions={
            <>
              <Button variant="secondary" asChild>
                <Link href={paymentsHref}>
                  <ArrowLeft aria-hidden />
                  {t("payments.details.back")}
                </Link>
              </Button>
              <Button leftIcon={<Printer aria-hidden />} onClick={() => window.print()}>
                {t("payments.details.print")}
              </Button>
            </>
          }
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px] print:block">
        <div className="flex flex-col gap-6 print:hidden">
          <Alert tone="info" icon={<Lock aria-hidden />}>
            {t("payments.details.notice")}
          </Alert>

          <Card>
            <div className="border-line flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5 sm:px-6">
              <div>
                <p className="text-fg-muted text-xs font-semibold tracking-[0.08em] uppercase">
                  {t("payments.details.paymentId")}
                </p>
                <p className="text-fg mt-1 font-mono text-2xl font-bold">{payment.paymentCode}</p>
              </div>
              <div className="text-right">
                <p className="text-fg-muted text-xs font-semibold tracking-[0.08em] uppercase">
                  {t("payments.details.amountReceived")}
                </p>
                <p className="text-metric-sm text-fg mt-1">{f.money(payment.amount)}</p>
              </div>
            </div>
            <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
              <DetailItem label={t("payments.details.method")}>
                <PaymentMethodLabel method={payment.method} />
              </DetailItem>
              <DetailItem label={t("payments.details.receivedDate")}>{f.date(payment.receivedDate)}</DetailItem>
              <DetailItem label={t("payments.details.entered")}>
                {f.timestamp(payment.createdAt)}
                {!sameDay ? (
                  <span className="text-fg-muted block text-xs font-normal">{t("payments.details.enteredLate")}</span>
                ) : null}
              </DetailItem>
              <DetailItem label={t("payments.details.reference")}>
                {payment.reference ? <span className="font-mono">{payment.reference}</span> : "—"}
              </DetailItem>
              <DetailItem label={t("payments.details.recordedBy")}>{payment.recordedBy.fullName}</DetailItem>
              <DetailItem label={t("payments.details.status")}>
                <PaidBadge />
              </DetailItem>
              <DetailItem label={t("payments.details.notes")} className="sm:col-span-2 lg:col-span-3">
                {payment.notes ? <span className="whitespace-pre-line">{payment.notes}</span> : "—"}
              </DetailItem>
            </dl>
          </Card>

          <Card>
            <CardHeader
              icon={<UserRound aria-hidden />}
              title={t("payments.details.member")}
              titleAs="h2"
              action={
                <Button variant="link" asChild>
                  <Link href={`/members/${payment.member.id}`}>
                    {t("payments.details.viewMember")} <ExternalLink aria-hidden className="size-4" />
                  </Link>
                </Button>
              }
            />
            <div className="flex items-center gap-4 px-5 py-5 sm:px-6">
              <Avatar name={payment.member.fullName} photoUrl={payment.member.photoUrl} size="lg" />
              <div className="min-w-0">
                <p className="text-fg flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {payment.member.fullName}
                  {payment.member.isArchived ? <ArchivedBadge /> : null}
                </p>
                <p className="text-fg-muted text-sm">
                  <span className="font-mono">{payment.member.memberCode}</span> · {formatPhone(payment.member.phone)}
                  {payment.member.email ? ` · ${payment.member.email}` : ""}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<ReceiptText aria-hidden />}
              title={t("payments.details.coverage")}
              description={t("payments.details.coverageDescription")}
              titleAs="h2"
              action={
                <Badge tone="primary">
                  {payment.membership.isRenewal ? t("payments.details.renewal") : t("payments.details.firstPurchase")}
                </Badge>
              }
            />
            <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
              <DetailItem label={t("payments.details.plan")}>{payment.membership.planName}</DetailItem>
              <DetailItem label={t("payments.details.duration")}>{f.days(payment.membership.durationDays)}</DetailItem>
              <DetailItem label={t("payments.details.planPrice")}>{f.money(payment.membership.price)}</DetailItem>
              <DetailItem label={t("payments.details.period")}>
                {f.dateRange(payment.membership.startDate, payment.membership.endDate)}
              </DetailItem>
            </dl>
            <p className="border-line text-fg-muted border-t px-5 py-3 text-sm sm:px-6">
              {t("payments.details.coversText", {
                plan: f.plan(payment.membership.planName, payment.membership.durationDays),
                start: f.date(payment.membership.startDate),
                end: f.date(payment.membership.endDate),
              })}
            </p>
          </Card>
        </div>

        <section
          aria-label={t("payments.details.receiptPreview")}
          className="flex flex-col gap-3 xl:sticky xl:top-[96px]"
        >
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-fg text-base font-semibold">{t("payments.details.receiptPreview")}</h2>
            <span className="text-fg-muted text-xs">{t("payments.details.printsWhite")}</span>
          </div>
          <div className="border-line shadow-card overflow-hidden rounded-xl border print:rounded-none print:border-0 print:shadow-none">
            <ReceiptLayout receipt={receipt.data} />
          </div>
          <Button
            variant="secondary"
            className="print:hidden"
            leftIcon={<Printer aria-hidden />}
            onClick={() => window.print()}
          >
            {t("payments.details.print")}
          </Button>
        </section>
      </div>
    </>
  );
}
