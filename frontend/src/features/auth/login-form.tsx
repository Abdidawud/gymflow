"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";
import { useDocumentTitle, useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { API_MODE } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { safeReturnPath } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

const REASON_MESSAGES: Record<string, { tone: "warning" | "success"; text: MessageKey }> = {
  "session-expired": { tone: "warning", text: "auth.login.reasonExpired" },
  deactivated: { tone: "warning", text: "auth.login.reasonDeactivated" },
  "password-reset": { tone: "success", text: "auth.login.reasonReset" },
};

const DEMO_ACCOUNTS: { label: MessageKey; email: string; password: string }[] = [
  { label: "auth.login.demoAdmin", email: "abdi@adamafitness.com", password: "GymFlow#2026" },
  { label: "auth.login.demoReception", email: "tigist@adamafitness.com", password: "GymFlow#2026" },
  { label: "auth.login.demoFirstSignIn", email: "selam@adamafitness.com", password: "Welcome#2026" },
];

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { status, account, signIn } = useAuth();
  const [error, setError] = useState<{ title: MessageKey; detail?: MessageKey } | null>(null);
  const next = safeReturnPath(params.get("next"));
  const reason = REASON_MESSAGES[params.get("reason") ?? ""];
  useDocumentTitle(t("auth.login.pageTitle"));

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("auth.login.emailRequired")).email(t("common.validation.emailInvalid")),
        password: z.string().min(1, t("auth.login.passwordRequired")),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  // Already signed in (e.g. back button): continue to the app.
  useEffect(() => {
    if (status === "authenticated" && account) {
      router.replace(account.mustChangePassword ? "/change-password" : next);
    }
  }, [status, account, next, router]);

  async function onSubmit(values: Values) {
    setError(null);
    try {
      const session = await signIn(values);
      router.replace(session.account.mustChangePassword ? "/change-password" : next);
    } catch (err) {
      form.setValue("password", "");
      if (err instanceof ApiError && err.code === "INVALID_CREDENTIALS") {
        // Never reveal whether the account exists (design.md §7).
        setError({ title: "auth.login.invalid" });
      } else if (err instanceof ApiError && err.code === "ACCOUNT_DEACTIVATED") {
        setError({ title: "auth.login.deactivatedTitle", detail: "auth.login.contactAdmin" });
      } else if (err instanceof ApiError && err.code === "RATE_LIMITED") {
        setError({ title: "auth.login.rateLimitedTitle", detail: "auth.login.rateLimitedText" });
      } else {
        setError({ title: "auth.login.failedTitle", detail: "auth.login.failedText" });
      }
      form.setFocus("password");
    }
  }

  return (
    <div>
      <h2 className="text-page-sm text-fg md:text-page">{t("auth.login.heading")}</h2>
      <p className="text-fg-muted mt-1.5 text-base">{t("auth.login.description")}</p>

      {reason && !error ? (
        <Alert tone={reason.tone} live className="mt-6">
          {t(reason.text)}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" title={t(error.title)} live className="mt-6">
          {error.detail ? t(error.detail) : null}
        </Alert>
      ) : null}

      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5">
        <Field label={t("auth.login.email")} required id="login-email" error={errors.email?.message}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              leftIcon={<Mail aria-hidden />}
              {...form.register("email")}
            />
          )}
        </Field>
        <Field
          label={t("auth.login.password")}
          required
          id="login-password"
          error={errors.password?.message}
          labelAside={
            <Link href="/forgot-password" className="text-link text-sm font-semibold hover:underline">
              {t("auth.login.forgot")}
            </Link>
          }
        >
          {(control) => <PasswordInput {...control} autoComplete="current-password" {...form.register("password")} />}
        </Field>
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingText={t("auth.login.submitting")}
          rightIcon={<ArrowRight aria-hidden />}
        >
          {t("auth.login.submit")}
        </Button>
      </form>

      <p className="text-fg-muted mt-6 text-sm">{t("auth.login.staffNote")}</p>

      {API_MODE === "mock" ? (
        <div className="border-line-strong mt-8 rounded-xl border border-dashed p-4">
          <p className="text-fg-muted text-xs font-semibold tracking-wider uppercase">{t("auth.login.demoTitle")}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {DEMO_ACCOUNTS.map((demo) => (
              <li key={demo.email}>
                <button
                  type="button"
                  className="hover:bg-tint flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 text-left text-sm md:min-h-9"
                  onClick={() => {
                    form.setValue("email", demo.email);
                    form.setValue("password", demo.password);
                  }}
                >
                  <span className="text-fg font-semibold">{t(demo.label)}</span>
                  <span className="text-fg-muted truncate">{demo.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
