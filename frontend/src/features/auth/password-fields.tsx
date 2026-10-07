"use client";

import { Check, Circle } from "lucide-react";
import { z } from "zod";
import { useI18n } from "@/i18n/provider";
import type { Translator } from "@/i18n/translator";
import { meetsPasswordPolicy, PASSWORD_MAX_LENGTH, PASSWORD_REQUIREMENTS } from "@/lib/domain/password";
import { cn } from "@/lib/utils";

/** Requirements shown before submission and ticked live (design.md §7). */
export function PasswordRequirements({ password, id }: { password: string; id?: string }) {
  const { t } = useI18n();
  return (
    <div id={id} className="bg-tint rounded-lg p-3">
      <p className="text-fg-muted text-xs font-semibold tracking-wider uppercase">{t("auth.password.requirements")}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {PASSWORD_REQUIREMENTS.map((requirement) => {
          const met = requirement.test(password);
          return (
            <li
              key={requirement.id}
              className={cn("flex items-center gap-2 text-sm", met ? "text-success-fg" : "text-fg-muted")}
            >
              {met ? <Check aria-hidden className="size-4" /> : <Circle aria-hidden className="size-4" />}
              {t(`auth.password.${requirement.id}`)}
              <span className="sr-only">{met ? t("auth.password.met") : t("auth.password.notMet")}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** New password + confirmation, with messages in the current language. */
export function newPasswordSchema(t: Translator["t"]) {
  return z
    .object({
      newPassword: z
        .string()
        .max(PASSWORD_MAX_LENGTH, t("common.validation.maxLength", { max: PASSWORD_MAX_LENGTH }))
        .refine(meetsPasswordPolicy, t("common.validation.passwordPolicy")),
      confirmPassword: z.string().min(1, t("common.validation.confirmPassword")),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      path: ["confirmPassword"],
      message: t("common.validation.passwordsMismatch"),
    });
}

export type NewPasswordValues = z.infer<ReturnType<typeof newPasswordSchema>>;
