"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle, useI18n } from "@/i18n/provider";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { meetsPasswordPolicy } from "@gymflow/shared/domain/password";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";
import { PasswordRequirements } from "./password-fields";

/** Forced password change on first sign-in with a temporary password (design.md §17). */
export function FirstLoginForm() {
  const { t } = useI18n();
  const { status, account, signOut } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(t("auth.firstLogin.pageTitle"));

  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t("auth.firstLogin.temporaryRequired")),
          newPassword: z.string().refine(meetsPasswordPolicy, t("common.validation.passwordPolicy")),
          confirmPassword: z.string().min(1, t("common.validation.confirmPassword")),
        })
        .refine((v) => v.newPassword === v.confirmPassword, {
          path: ["confirmPassword"],
          message: t("common.validation.passwordsMismatch"),
        }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const password = useWatch({ control: form.control, name: "newPassword" });

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    else if (status === "authenticated" && account && !account.mustChangePassword) router.replace("/dashboard");
  }, [status, account, router]);

  async function onSubmit(values: Values) {
    setError(null);
    try {
      await api.account.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      toast.success(t("auth.firstLogin.success"));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (field === "currentPassword" || field === "newPassword") form.setError(field, { message });
        }
      } else {
        setError(t("auth.firstLogin.failed"));
      }
    }
  }

  if (status !== "authenticated" || !account?.mustChangePassword) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-4">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-page-sm text-fg md:text-page">{t("auth.firstLogin.heading")}</h2>
      <p className="text-fg-muted mt-1.5 text-base">{t("auth.firstLogin.description", { name: account.fullName })}</p>
      {error ? (
        <Alert tone="error" live className="mt-6">
          {error}
        </Alert>
      ) : null}
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5">
        <Field
          label={t("auth.firstLogin.temporary")}
          required
          id="first-current"
          error={errors.currentPassword?.message}
        >
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="current-password"
              autoFocus
              {...form.register("currentPassword")}
            />
          )}
        </Field>
        <Field label={t("auth.firstLogin.newPassword")} required id="first-new" error={errors.newPassword?.message}>
          {(control) => <PasswordInput {...control} autoComplete="new-password" {...form.register("newPassword")} />}
        </Field>
        <PasswordRequirements password={password} />
        <Field
          label={t("auth.firstLogin.confirmPassword")}
          required
          id="first-confirm"
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
          {t("auth.firstLogin.submit")}
        </Button>
      </form>
      <Button variant="ghost" className="mt-4" leftIcon={<LogOut aria-hidden />} onClick={() => void signOut()}>
        {t("auth.firstLogin.signOut")}
      </Button>
    </div>
  );
}
