"use client";

import { Banknote, CreditCard, Landmark, Smartphone, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import type { PaymentMethod } from "@gymflow/shared/api/types";
import { cn } from "@/lib/utils";

/** Icons per recording method; labels and hints live in the label catalog (labels.methods.*). */
export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  CASH: Banknote,
  BANK_TRANSFER: Landmark,
  CARD: CreditCard,
  MOBILE_PAYMENT: Smartphone,
};

export function PaymentMethodLabel({ method, className }: { method: PaymentMethod; className?: string }) {
  const { t } = useI18n();
  const Icon = PAYMENT_METHOD_ICONS[method];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <Icon aria-hidden className="text-fg-muted size-4 shrink-0" />
      {t(`labels.methods.${method}.label`)}
    </span>
  );
}
