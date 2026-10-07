"use client";

import { CalendarRange } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import type { PaymentMethod, PaymentPreview } from "@/lib/api/types";
import type { DateOnly } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className={cn("text-fg text-right text-sm", strong ? "font-bold" : "font-medium")}>{children}</dd>
    </div>
  );
}

/** Review before confirmation (design.md §12): what will be recorded and the dates it covers. */
export function MembershipPreview({
  preview,
  method,
  receivedDate,
  updating,
  today,
}: {
  preview: PaymentPreview;
  method: PaymentMethod | "";
  receivedDate: DateOnly;
  updating: boolean;
  today: DateOnly;
}) {
  const { t, f } = useI18n();
  return (
    <section
      aria-labelledby="payment-preview-heading"
      aria-busy={updating}
      className={cn("border-line bg-tint/60 rounded-xl border p-4 transition-opacity", updating && "opacity-60")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="payment-preview-heading" className="text-fg flex items-center gap-2 text-sm font-semibold">
          <CalendarRange aria-hidden className="text-primary size-[18px]" />
          {t("payments.preview.title")}
        </h3>
        {updating ? <span className="text-fg-muted text-xs">{t("payments.preview.updating")}</span> : null}
      </div>
      <dl className="divide-line divide-y">
        <Row label={t("payments.preview.member")}>
          {preview.member.fullName} <span className="text-fg-muted">· {preview.member.memberCode}</span>
        </Row>
        <Row label={t("payments.preview.plan")}>{f.plan(preview.plan.name, preview.plan.durationDays)}</Row>
        <Row label={t("payments.preview.amount")} strong>
          {f.money(preview.amount)}
        </Row>
        <Row label={t("payments.preview.method")}>{method ? t(`labels.methods.${method}.label`) : "—"}</Row>
        <Row label={t("payments.preview.date")}>{receivedDate ? f.date(receivedDate) : "—"}</Row>
        <Row label={t("payments.preview.start")} strong>
          {f.date(preview.startDate)}
        </Row>
        <Row label={t("payments.preview.end")} strong>
          {f.date(preview.endDate)}
        </Row>
      </dl>

      {preview.existingCoverage.length > 0 ? (
        <div className="bg-surface mt-3 rounded-lg p-3">
          <p className="text-fg-muted text-xs font-semibold tracking-wider uppercase">
            {t("payments.preview.coverage")}
          </p>
          <ul className="mt-1.5 space-y-1">
            {preview.existingCoverage.map((period) => (
              <li key={period.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-fg">{f.plan(period.planName, period.durationDays)}</span>
                <span className="text-fg-muted tabular text-right">
                  {f.dateRange(period.startDate, period.endDate)} ·{" "}
                  {period.startDate > today ? t("payments.preview.scheduled") : t("payments.preview.current")}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-fg-muted mt-2 text-xs">{t("payments.preview.noOverlap")}</p>
        </div>
      ) : null}
    </section>
  );
}
