"use client";

import { useI18n } from "@/i18n/provider";
import type { Receipt } from "@/lib/api/types";
import { formatPhone } from "@/lib/domain/phone";
import { cn } from "@/lib/utils";

function Line({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-1.5 text-sm">
      <dt className="text-[#475569]">{label}</dt>
      <dd className={cn("text-right text-[#0f172a]", strong ? "font-bold" : "font-medium")}>{children}</dd>
    </div>
  );
}

/**
 * Printable membership payment receipt (design.md §13), in the staff member's
 * language. Always white paper and dark ink, independent of the current theme
 * or viewport; built from the purchase-time snapshot returned by the backend.
 */
export function ReceiptLayout({ receipt, className }: { receipt: Receipt; className?: string }) {
  const { t, f } = useI18n();
  const { gym, payment } = receipt;
  return (
    <article
      aria-label={t("payments.receipt.label", { code: payment.paymentCode })}
      className={cn(
        "theme-light mx-auto w-full max-w-[420px] bg-white p-7 text-[#0f172a] print:max-w-[560px] print:p-0",
        className,
      )}
    >
      <header className="text-center">
        {gym.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- gym logo uploaded in settings
          <img src={gym.logoUrl} alt="" className="mx-auto mb-2 size-14 rounded-lg object-cover" />
        ) : (
          <span className="mx-auto mb-2 flex size-11 items-center justify-center rounded-lg bg-[#4338ca] text-lg font-bold text-white print:border print:border-[#4338ca]">
            {gym.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <p className="text-lg font-bold tracking-tight">{gym.name}</p>
        {gym.address ? <p className="text-xs text-[#475569]">{gym.address}</p> : null}
        <p className="text-xs text-[#475569]">
          {[gym.phone ? formatPhone(gym.phone) : null, gym.email].filter(Boolean).join(" · ")}
        </p>
      </header>

      <div className="my-5 border-t border-dashed border-[#cbd5e1]" />

      <h2 className="text-center text-sm font-bold tracking-[0.12em] uppercase">{t("payments.receipt.heading")}</h2>

      <dl className="mt-4">
        <Line label={t("payments.receipt.receiptId")}>
          <span className="font-mono">{payment.paymentCode}</span>
        </Line>
        <Line label={t("payments.receipt.date")}>{f.date(payment.receivedDate)}</Line>
        <Line label={t("payments.receipt.member")}>{payment.member.fullName}</Line>
        <Line label={t("payments.receipt.memberId")}>
          <span className="font-mono">{payment.member.memberCode}</span>
        </Line>
      </dl>

      <div className="my-4 rounded-lg bg-[#f1f5f9] p-3 print:border print:border-[#cbd5e1] print:bg-white">
        <dl>
          <Line label={t("payments.receipt.plan")}>
            {f.plan(payment.membership.planName, payment.membership.durationDays)}
          </Line>
          <Line label={t("payments.receipt.from")}>{f.date(payment.membership.startDate)}</Line>
          <Line label={t("payments.receipt.through")}>{f.date(payment.membership.endDate)}</Line>
          <Line label={t("payments.receipt.method")}>
            {t(`labels.methods.${payment.method}.label`)}
            {payment.reference ? (
              <span className="block font-mono text-xs text-[#475569]">{payment.reference}</span>
            ) : null}
          </Line>
        </dl>
      </div>

      <div className="flex items-end justify-between gap-4 border-t border-[#0f172a] pt-3">
        <span className="text-sm font-bold uppercase">{t("payments.receipt.amountPaid")}</span>
        <span className="text-2xl font-bold">{f.money(payment.amount)}</span>
      </div>

      <div className="mt-5 flex justify-center">
        <span className="-rotate-3 rounded-md border-[3px] border-[#166534] px-5 py-1 text-2xl font-black tracking-[0.25em] text-[#166534]">
          {t("payments.receipt.paid")}
        </span>
      </div>

      <dl className="mt-5">
        <Line label={t("payments.receipt.recordedBy")}>{payment.recordedBy.fullName}</Line>
        <Line label={t("payments.receipt.entered")}>{f.timestamp(payment.createdAt)}</Line>
      </dl>

      <div className="my-5 border-t border-dashed border-[#cbd5e1]" />
      <p className="text-center text-sm font-semibold">{t("payments.receipt.thanks", { gym: gym.name })}</p>
      <p className="mt-1 text-center text-[11px] text-[#475569]">{t("payments.receipt.footer")}</p>
    </article>
  );
}
