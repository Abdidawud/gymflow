"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Mail, MailCheck, Send } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useDocumentTitle, useI18n } from "@/i18n/provider";
import { api, API_MODE } from "@/lib/api/client";

function readDemoLink(): string | null {
  try {
    return window.sessionStorage.getItem("gymflow:mock-last-reset-link");
  } catch {
    return null;
  }
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [demoLink, setDemoLink] = useState<string | null>(null);
  useDocumentTitle(t("auth.forgot.pageTitle"));

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("auth.login.emailRequired")).email(t("common.validation.emailInvalid")),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: Values) {
    setFailed(false);
    try {
      await api.auth.forgotPassword(values.email);
      setSent(true);
      if (API_MODE === "mock") setDemoLink(readDemoLink());
    } catch {
      setFailed(true);
    }
  }

  if (sent) {
    return (
      <div role="status">
        <span className="bg-primary-soft text-primary-soft-fg flex size-12 items-center justify-center rounded-2xl">
          <MailCheck aria-hidden className="size-6" />
        </span>
        <h2 className="text-page-sm text-fg mt-5">{t("auth.forgot.sentTitle")}</h2>
        <p className="text-fg-muted mt-2 text-base">{t("auth.forgot.sentText")}</p>
        {demoLink ? (
          <Alert tone="info" className="mt-6" title={t("auth.forgot.demoTitle")}>
            {t("auth.forgot.demoText")}{" "}
            <a href={demoLink} className="font-semibold underline">
              {t("auth.forgot.demoLink")}
            </a>
          </Alert>
        ) : null}
        <Button asChild variant="secondary" className="mt-8 w-full">
          <Link href="/login">
            <ArrowLeft aria-hidden />
            {t("auth.forgot.back")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-page-sm text-fg md:text-page">{t("auth.forgot.heading")}</h2>
      <p className="text-fg-muted mt-1.5 text-base">{t("auth.forgot.description")}</p>
      {failed ? (
        <Alert tone="error" live className="mt-6" title={t("auth.forgot.failedTitle")}>
          {t("auth.forgot.failedText")}
        </Alert>
      ) : null}
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5">
        <Field label={t("auth.login.email")} required id="forgot-email" error={errors.email?.message}>
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
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingText={t("auth.forgot.submitting")}
          leftIcon={<Send aria-hidden />}
        >
          {t("auth.forgot.submit")}
        </Button>
      </form>
      <Link
        href="/login"
        className="text-link mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("auth.forgot.back")}
      </Link>
    </div>
  );
}
