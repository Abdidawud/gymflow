"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CircleCheck, KeyRound, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/input";
import { useDocumentTitle, useI18n } from "@/i18n/provider";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { newPasswordSchema, PasswordRequirements, type NewPasswordValues } from "./password-fields";

export function ResetPasswordForm() {
  const { t } = useI18n();
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"form" | "invalid" | "done">(token ? "form" : "invalid");
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(t("auth.reset.pageTitle"));

  const schema = useMemo(() => newPasswordSchema(t), [t]);
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const password = useWatch({ control: form.control, name: "newPassword" });

  async function onSubmit(values: NewPasswordValues) {
    setError(null);
    try {
      await api.auth.resetPassword({ token: token ?? "", newPassword: values.newPassword });
      setState("done");
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_RESET_TOKEN") setState("invalid");
      else if (err instanceof ApiError && err.fieldErrors.newPassword) {
        form.setError("newPassword", { message: err.fieldErrors.newPassword });
      } else setError(t("auth.reset.failed"));
    }
  }

  if (state === "invalid") {
    return (
      <div role="alert">
        <span className="bg-error-bg text-error-fg flex size-12 items-center justify-center rounded-2xl">
          <LinkIcon aria-hidden className="size-6" />
        </span>
        <h2 className="text-page-sm text-fg mt-5">{t("auth.reset.invalidTitle")}</h2>
        <p className="text-fg-muted mt-2 text-base">{t("auth.reset.invalidText")}</p>
        <Button asChild className="mt-8 w-full">
          <Link href="/forgot-password">{t("auth.reset.requestNew")}</Link>
        </Button>
        <Link
          href="/login"
          className="text-link mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("auth.forgot.back")}
        </Link>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div role="status">
        <span className="bg-success-bg text-success-fg flex size-12 items-center justify-center rounded-2xl">
          <CircleCheck aria-hidden className="size-6" />
        </span>
        <h2 className="text-page-sm text-fg mt-5">{t("auth.reset.doneTitle")}</h2>
        <p className="text-fg-muted mt-2 text-base">{t("auth.reset.doneText")}</p>
        <Button asChild className="mt-8 w-full">
          <Link href="/login?reason=password-reset">{t("auth.reset.signIn")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-page-sm text-fg md:text-page">{t("auth.reset.heading")}</h2>
      <p className="text-fg-muted mt-1.5 text-base">{t("auth.reset.description")}</p>
      {error ? (
        <Alert tone="error" live className="mt-6">
          {error}
        </Alert>
      ) : null}
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5">
        <Field label={t("auth.reset.newPassword")} required id="reset-new" error={errors.newPassword?.message}>
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="new-password"
              aria-describedby={[control["aria-describedby"], "reset-requirements"].filter(Boolean).join(" ")}
              autoFocus
              {...form.register("newPassword")}
            />
          )}
        </Field>
        <PasswordRequirements password={password} id="reset-requirements" />
        <Field
          label={t("auth.reset.confirmPassword")}
          required
          id="reset-confirm"
          error={errors.confirmPassword?.message}
        >
          {(control) => (
            <PasswordInput {...control} autoComplete="new-password" {...form.register("confirmPassword")} />
          )}
        </Field>
        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          loadingText={t("auth.reset.submitting")}
          leftIcon={<KeyRound aria-hidden />}
        >
          {t("auth.reset.submit")}
        </Button>
      </form>
    </div>
  );
}
