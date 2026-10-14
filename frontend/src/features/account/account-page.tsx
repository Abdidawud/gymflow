"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DatabaseZap, KeyRound, Languages, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { LOCALE_LABELS, LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { Translator } from "@/i18n/translator";
import { api, API_MODE } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { Appearance } from "@gymflow/shared/api/types";
import { meetsPasswordPolicy, PASSWORD_MAX_LENGTH } from "@gymflow/shared/domain/password";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuth, useSession } from "@/providers/auth-provider";
import { PasswordRequirements } from "@/features/auth/password-fields";

function buildPasswordSchema(t: Translator["t"]) {
  return z
    .object({
      currentPassword: z.string().min(1, t("account.password.errors.current")),
      newPassword: z
        .string()
        .max(PASSWORD_MAX_LENGTH, t("common.validation.maxLength", { max: PASSWORD_MAX_LENGTH }))
        .refine(meetsPasswordPolicy, t("common.validation.passwordPolicy")),
      confirmPassword: z.string().min(1, t("common.validation.confirmPassword")),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ["confirmPassword"],
      message: t("common.validation.passwordsMismatch"),
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
      path: ["newPassword"],
      message: t("account.password.errors.same"),
    });
}
type PasswordValues = z.infer<ReturnType<typeof buildPasswordSchema>>;

const APPEARANCES: { value: Appearance; icon: typeof Sun }[] = [
  { value: "LIGHT", icon: Sun },
  { value: "DARK", icon: Moon },
  { value: "SYSTEM", icon: Monitor },
];

const OPTION_CLASS = cn(
  "border-line hover:bg-tint/60 flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-3 py-4 text-center transition-colors",
  "has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:ring-primary has-[:checked]:ring-1",
  "has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
);

export function AccountPage() {
  const { t } = useI18n();
  const { account } = useSession();
  const { signOut } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <>
      <PageHeader title={t("account.title")} description={t("account.subtitle")} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex items-center gap-4 p-5 sm:p-6">
              <Avatar
                name={account.fullName}
                size="lg"
                className="bg-primary text-on-primary dark:bg-primary dark:text-on-primary"
              />
              <div className="min-w-0">
                <p className="text-fg text-lg font-semibold">{account.fullName}</p>
                <p className="text-fg-muted truncate text-sm">{account.email}</p>
                <Badge tone="primary" className="mt-1.5" icon={<ShieldCheck aria-hidden />}>
                  {t(`labels.roles.${account.role}.label`)}
                </Badge>
              </div>
            </div>
            <p className="border-line text-fg-muted border-t px-5 py-3 text-sm sm:px-6">
              {t(`labels.roles.${account.role}.description`)} {t("account.managedNote")}
            </p>
          </Card>
          <LanguageCard />
          <AppearanceCard />
          <Card>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="text-fg text-lg font-semibold">{t("account.signOut.title")}</h2>
                <p className="text-fg-muted text-sm">{t("account.signOut.description")}</p>
              </div>
              <Button variant="danger-soft" leftIcon={<LogOut aria-hidden />} onClick={() => void signOut()}>
                {t("account.signOut.button")}
              </Button>
            </div>
          </Card>
          {API_MODE === "mock" ? (
            <Card>
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <h2 className="text-fg flex items-center gap-2 text-lg font-semibold">
                    {t("account.demo.title")} <Badge tone="warning">{t("account.demo.badge")}</Badge>
                  </h2>
                  <p className="text-fg-muted text-sm">{t("account.demo.description")}</p>
                </div>
                <Button variant="secondary" leftIcon={<DatabaseZap aria-hidden />} onClick={() => setResetOpen(true)}>
                  {t("account.demo.button")}
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
        <ChangePasswordCard />
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t("account.demo.confirmTitle")}
        description={t("account.demo.confirmText")}
        confirmLabel={t("account.demo.button")}
        onConfirm={() => window.__gymflowMock?.reset()}
      />
    </>
  );
}

/** Interface language (Amharic / English), saved to the staff account and applied on every device. */
function LanguageCard() {
  const { t, locale } = useI18n();
  const { updateLanguage } = useAuth();
  return (
    <Card>
      <CardHeader
        icon={<Languages aria-hidden />}
        title={t("account.language.title")}
        description={t("account.language.description")}
      />
      <fieldset className="p-5 sm:p-6">
        <legend className="sr-only">{t("account.language.title")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {LOCALES.map((value) => (
            <label key={value} className={OPTION_CLASS}>
              <input
                type="radio"
                name="language"
                value={value}
                checked={locale === value}
                onChange={() => updateLanguage(value)}
                className="sr-only"
              />
              <span lang={value} className="text-fg text-base font-semibold">
                {LOCALE_LABELS[value]}
              </span>
              <span className="text-fg-muted text-xs">{t(`account.language.hints.${value}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

function AppearanceCard() {
  const { t } = useI18n();
  const { preference } = useTheme();
  const { updateAppearance } = useAuth();
  const current = preference.toUpperCase() as Appearance;
  return (
    <Card>
      <CardHeader
        icon={<Palette aria-hidden />}
        title={t("account.appearance.title")}
        description={t("account.appearance.description")}
      />
      <fieldset className="p-5 sm:p-6">
        <legend className="sr-only">{t("account.appearance.title")}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {APPEARANCES.map(({ value, icon: Icon }) => (
            <label key={value} className={OPTION_CLASS}>
              <input
                type="radio"
                name="appearance"
                value={value}
                checked={current === value}
                onChange={() => updateAppearance(value)}
                className="sr-only"
              />
              <Icon aria-hidden className="text-primary size-6" />
              <span className="text-fg text-sm font-semibold">{t(`account.appearance.${value}.label`)}</span>
              <span className="text-fg-muted text-xs">{t(`account.appearance.${value}.description`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

function ChangePasswordCard() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => buildPasswordSchema(t), [t]);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const password = useWatch({ control: form.control, name: "newPassword" });

  async function onSubmit(values: PasswordValues) {
    setError(null);
    try {
      await api.account.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      form.reset();
      toast.success(t("account.password.updated"), { description: t("account.password.updatedHint") });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (field === "currentPassword" || field === "newPassword")
            form.setError(field, { message }, { shouldFocus: true });
        }
      } else setError(errorMessage(err, t("account.password.failed")));
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<KeyRound aria-hidden />}
        title={t("account.password.title")}
        description={t("account.password.description")}
      />
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 p-5 sm:p-6">
        {error ? (
          <Alert tone="error" live>
            {error}
          </Alert>
        ) : null}
        <Field
          label={t("account.password.current")}
          required
          id="account-current"
          error={errors.currentPassword?.message}
        >
          {(c) => <PasswordInput {...c} autoComplete="current-password" {...form.register("currentPassword")} />}
        </Field>
        <Field label={t("account.password.new")} required id="account-new" error={errors.newPassword?.message}>
          {(c) => <PasswordInput {...c} autoComplete="new-password" {...form.register("newPassword")} />}
        </Field>
        <PasswordRequirements password={password} />
        <Field
          label={t("account.password.confirm")}
          required
          id="account-confirm"
          error={errors.confirmPassword?.message}
        >
          {(c) => <PasswordInput {...c} autoComplete="new-password" {...form.register("confirmPassword")} />}
        </Field>
        <div className="flex justify-end">
          <Button
            type="submit"
            loading={isSubmitting}
            loadingText={t("account.password.updating")}
            leftIcon={<KeyRound aria-hidden />}
          >
            {t("account.password.submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
