"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Camera, CreditCard, Hourglass, Info, Lock, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert, LoadError } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/provider";
import type { Translator } from "@/i18n/translator";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import {
  PAYMENT_METHODS,
  type GymSettings,
  type GymSettingsUpdate,
  type PaymentMethod,
} from "@gymflow/shared/api/types";
import { addDays } from "@gymflow/shared/domain/dates";
import { formatPhone, normalizeEthiopianPhone } from "@gymflow/shared/domain/phone";
import { queryKeys } from "@/lib/query-keys";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes";
import { shrinkImage } from "@/lib/images";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/auth-provider";
import { PAYMENT_METHOD_ICONS } from "@/features/payments/payment-methods";

type TabKey = "profile" | "membership" | "payments";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function useSaveSettings() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  return async (update: GymSettingsUpdate) => {
    const saved = await api.settings.update(update);
    queryClient.setQueryData(queryKeys.settings, saved);
    // Gym name, warning days and methods feed the shell, statuses and the payment drawer.
    for (const key of [queryKeys.session, queryKeys.dashboard, queryKeys.members.all, queryKeys.memberships.all]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    toast.success(t("settings.saved"));
    return saved;
  };
}

/** Applies server field errors to the form, or returns a general message. */
function applyServerErrors<T extends Record<string, unknown>>(
  form: UseFormReturn<T>,
  error: unknown,
  t: Translator["t"],
): string | null {
  if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
    for (const [field, message] of Object.entries(error.fieldErrors)) {
      form.setError(field as Parameters<typeof form.setError>[0], { message });
    }
    return null;
  }
  return errorMessage(error, t("settings.saveFailed"));
}

export function SettingsPage() {
  const { t, f } = useI18n();
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: () => api.settings.get() });
  const [tab, setTab] = useState<TabKey>("profile");
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null);
  const [dirty, setDirty] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const { dialog } = useUnsavedChangesGuard(dirty);

  function changeTab(next: string) {
    if (dirty) setPendingTab(next as TabKey);
    else setTab(next as TabKey);
  }

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
      {settings.isPending ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <span className="sr-only">{t("settings.loading")}</span>
          <Skeleton className="h-12 w-96 max-w-full rounded-xl" />
          <Skeleton className="h-96 max-w-4xl rounded-xl" />
        </div>
      ) : settings.isError ? (
        <Card>
          <LoadError onRetry={() => void settings.refetch()} retrying={settings.isFetching} />
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList aria-label={t("settings.tabsLabel")}>
            <TabsTrigger value="profile" icon={<Building2 aria-hidden />}>
              {t("settings.tabs.profile")}
            </TabsTrigger>
            <TabsTrigger value="membership" icon={<Hourglass aria-hidden />}>
              {t("settings.tabs.membership")}
            </TabsTrigger>
            <TabsTrigger value="payments" icon={<CreditCard aria-hidden />}>
              {t("settings.tabs.payments")}
            </TabsTrigger>
          </TabsList>
          <div className="mt-5 max-w-4xl">
            <TabsContent value="profile" className="focus-visible:outline-none">
              <ProfileTab key={`profile-${resetKey}`} settings={settings.data} onDirtyChange={setDirty} />
            </TabsContent>
            <TabsContent value="membership" className="focus-visible:outline-none">
              <MembershipTab key={`membership-${resetKey}`} settings={settings.data} onDirtyChange={setDirty} />
            </TabsContent>
            <TabsContent value="payments" className="focus-visible:outline-none">
              <PaymentsTab key={`payments-${resetKey}`} settings={settings.data} onDirtyChange={setDirty} />
            </TabsContent>
            <p className="text-fg-muted mt-4 text-sm">
              {settings.data.updatedBy
                ? t("settings.lastUpdatedBy", {
                    timestamp: f.timestamp(settings.data.updatedAt),
                    name: settings.data.updatedBy.fullName,
                  })
                : t("settings.lastUpdated", { timestamp: f.timestamp(settings.data.updatedAt) })}
            </p>
          </div>
        </Tabs>
      )}

      <ConfirmDialog
        open={pendingTab !== null}
        onOpenChange={(open) => !open && setPendingTab(null)}
        title={t("common.unsaved.title")}
        description={t("common.unsaved.tabDescription")}
        cancelLabel={t("common.stay")}
        confirmLabel={t("common.discardChanges")}
        onConfirm={() => {
          setDirty(false);
          setResetKey((k) => k + 1);
          if (pendingTab) setTab(pendingTab);
          setPendingTab(null);
        }}
      />
      {dialog}
    </>
  );
}

function SaveBar({ dirty, saving, onReset }: { dirty: boolean; saving: boolean; onReset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="border-line flex flex-col-reverse items-stretch gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-fg-muted text-sm" aria-live="polite">
        {dirty ? t("settings.unsaved") : t("settings.allSaved")}
      </p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button variant="secondary" onClick={onReset} disabled={!dirty || saving}>
          {t("common.discardChanges")}
        </Button>
        <Button
          type="submit"
          loading={saving}
          loadingText={t("common.saving")}
          disabled={!dirty}
          leftIcon={<Save aria-hidden />}
        >
          {t("common.saveChanges")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gym profile
// ---------------------------------------------------------------------------

function buildProfileSchema(t: Translator["t"]) {
  return z.object({
    gymName: z
      .string()
      .trim()
      .min(1, t("settings.profile.errors.gymName"))
      .max(80, t("common.validation.maxLength", { max: 80 })),
    phone: z
      .string()
      .trim()
      .refine((v) => !v || normalizeEthiopianPhone(v, "any") !== null, t("common.validation.phoneInvalid")),
    email: z
      .string()
      .trim()
      .refine((v) => !v || EMAIL_RE.test(v), t("common.validation.emailInvalid")),
    address: z
      .string()
      .trim()
      .max(200, t("common.validation.maxLength", { max: 200 })),
  });
}
type ProfileValues = z.infer<ReturnType<typeof buildProfileSchema>>;

function ProfileTab({ settings, onDirtyChange }: { settings: GymSettings; onDirtyChange: (dirty: boolean) => void }) {
  const { t } = useI18n();
  const save = useSaveSettings();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const schema = useMemo(() => buildProfileSchema(t), [t]);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      gymName: settings.gymName,
      phone: settings.phone ? formatPhone(settings.phone) : "",
      email: settings.email ?? "",
      address: settings.address ?? "",
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  async function onSubmit(values: ProfileValues) {
    setError(null);
    try {
      const saved = await save({
        gymName: values.gymName,
        phone: values.phone || null,
        email: values.email || null,
        address: values.address || null,
      });
      form.reset({
        gymName: saved.gymName,
        phone: saved.phone ? formatPhone(saved.phone) : "",
        email: saved.email ?? "",
        address: saved.address ?? "",
      });
    } catch (err) {
      setError(applyServerErrors(form, err, t));
    }
  }

  async function changeLogo(file: File | null) {
    setLogoError(null);
    setLogoBusy(true);
    try {
      const prepared = file ? await shrinkImage(file, { maxSize: 1024, type: "image/png" }) : null;
      const saved = prepared ? await api.settings.uploadLogo(prepared) : await api.settings.update({ logoUrl: null });
      queryClient.setQueryData(queryKeys.settings, saved);
      toast.success(file ? t("settings.profile.logoUpdated") : t("settings.profile.logoRemoved"));
    } catch (err) {
      setLogoError(err instanceof ApiError ? (err.fieldErrors.logo ?? err.message) : t("settings.profile.logoFailed"));
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <Card>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-6 p-5 sm:p-6">
          {error ? (
            <Alert tone="error" live>
              {error}
            </Alert>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="bg-primary text-on-primary flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl text-2xl font-bold">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded gym logo
                <img src={settings.logoUrl} alt={t("settings.profile.logoAlt")} className="size-full object-cover" />
              ) : (
                settings.gymName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-fg text-sm font-semibold">
                {t("settings.profile.logo")}{" "}
                <span className="text-fg-subtle font-normal">{t("settings.profile.logoOptional")}</span>
              </p>
              <p className="text-caption text-fg-muted">{t("settings.profile.logoHint")}</p>
              {logoError ? (
                <p role="alert" className="text-caption text-danger mt-1 font-medium">
                  {logoError}
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label={t("settings.profile.uploadLabel")}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void changeLogo(file);
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  loading={logoBusy}
                  leftIcon={<Camera aria-hidden />}
                  onClick={() => fileRef.current?.click()}
                >
                  {settings.logoUrl ? t("settings.profile.replaceLogo") : t("settings.profile.uploadLogo")}
                </Button>
                {settings.logoUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 aria-hidden />}
                    onClick={() => void changeLogo(null)}
                    disabled={logoBusy}
                  >
                    {t("common.remove")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <Field
            label={t("settings.profile.gymName")}
            required
            id="settings-gym-name"
            error={errors.gymName?.message}
            hint={t("settings.profile.gymNameHint")}
          >
            {(c) => <Input {...c} {...form.register("gymName")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("settings.profile.phone")} optional id="settings-phone" error={errors.phone?.message}>
              {(c) => <Input {...c} type="tel" inputMode="tel" {...form.register("phone")} />}
            </Field>
            <Field label={t("settings.profile.email")} optional id="settings-email" error={errors.email?.message}>
              {(c) => <Input {...c} type="email" {...form.register("email")} />}
            </Field>
          </div>
          <Field label={t("settings.profile.address")} optional id="settings-address" error={errors.address?.message}>
            {(c) => <Input {...c} {...form.register("address")} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-tint rounded-lg p-4">
              <p className="text-fg flex items-center justify-between text-sm font-semibold">
                {t("settings.profile.currency")}{" "}
                <Badge tone="neutral" icon={<Lock aria-hidden />}>
                  {t("settings.profile.fixed")}
                </Badge>
              </p>
              <p className="text-fg mt-1 text-base font-semibold">{t("settings.profile.currencyValue")}</p>
            </div>
            <div className="bg-tint rounded-lg p-4">
              <p className="text-fg flex items-center justify-between text-sm font-semibold">
                {t("settings.profile.timezone")}{" "}
                <Badge tone="neutral" icon={<Lock aria-hidden />}>
                  {t("settings.profile.fixed")}
                </Badge>
              </p>
              <p className="text-fg mt-1 text-base font-semibold">{settings.timezone} (UTC+3)</p>
            </div>
          </div>
        </div>
        <SaveBar dirty={isDirty} saving={isSubmitting} onReset={() => form.reset()} />
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

function buildMembershipSchema(t: Translator["t"]) {
  return z.object({
    expirationWarningDays: z
      .string()
      .trim()
      .refine((v) => /^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 30, t("settings.membership.warningInvalid")),
  });
}
type MembershipValues = z.infer<ReturnType<typeof buildMembershipSchema>>;

function MembershipTab({
  settings,
  onDirtyChange,
}: {
  settings: GymSettings;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, f, rich } = useI18n();
  const { gym } = useSession();
  const save = useSaveSettings();
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => buildMembershipSchema(t), [t]);
  const form = useForm<MembershipValues>({
    resolver: zodResolver(schema),
    defaultValues: { expirationWarningDays: String(settings.expirationWarningDays) },
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  const raw = useWatch({ control: form.control, name: "expirationWarningDays" });
  const days = /^\d+$/.test(raw) && Number(raw) <= 30 ? Number(raw) : null;

  async function onSubmit(values: MembershipValues) {
    setError(null);
    try {
      const saved = await save({ expirationWarningDays: Number(values.expirationWarningDays) });
      form.reset({ expirationWarningDays: String(saved.expirationWarningDays) });
    } catch (err) {
      setError(applyServerErrors(form, err, t));
    }
  }

  return (
    <Card>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          {error ? (
            <Alert tone="error" live>
              {error}
            </Alert>
          ) : null}
          <Field
            label={t("settings.membership.warningDays")}
            required
            id="settings-warning-days"
            error={errors.expirationWarningDays?.message}
            hint={t("settings.membership.warningHint")}
          >
            {(c) => (
              <Input
                {...c}
                inputMode="numeric"
                suffix={t("settings.membership.daysSuffix")}
                className="max-w-48"
                {...form.register("expirationWarningDays")}
              />
            )}
          </Field>
          <Alert tone="info" icon={<Info aria-hidden />}>
            {rich("settings.membership.explain", { b: (chunks) => <strong>{chunks}</strong> })}
            {days !== null
              ? ` ${t("settings.membership.example", { count: days, date: f.date(addDays(gym.today, days)) })}`
              : null}
          </Alert>
          <p className="text-fg-muted text-sm">{t("settings.membership.earlyRenewal")}</p>
        </div>
        <SaveBar dirty={isDirty} saving={isSubmitting} onReset={() => form.reset()} />
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function buildPaymentsSchema(t: Translator["t"]) {
  return z.object({
    enabledPaymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1, t("settings.payments.atLeastOne")),
  });
}
type PaymentsValues = z.infer<ReturnType<typeof buildPaymentsSchema>>;

function PaymentsTab({ settings, onDirtyChange }: { settings: GymSettings; onDirtyChange: (dirty: boolean) => void }) {
  const { t } = useI18n();
  const save = useSaveSettings();
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => buildPaymentsSchema(t), [t]);
  const form = useForm<PaymentsValues>({
    resolver: zodResolver(schema),
    defaultValues: { enabledPaymentMethods: settings.enabledPaymentMethods },
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  async function onSubmit(values: PaymentsValues) {
    setError(null);
    try {
      const saved = await save({ enabledPaymentMethods: values.enabledPaymentMethods });
      form.reset({ enabledPaymentMethods: saved.enabledPaymentMethods });
    } catch (err) {
      setError(applyServerErrors(form, err, t));
    }
  }

  return (
    <Card>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          {error ? (
            <Alert tone="error" live>
              {error}
            </Alert>
          ) : null}
          <Controller
            control={form.control}
            name="enabledPaymentMethods"
            render={({ field }) => (
              <fieldset aria-describedby="methods-help">
                <legend className="text-fg text-sm font-semibold">{t("settings.payments.legend")}</legend>
                <p id="methods-help" className="text-fg-muted mt-0.5 text-sm">
                  {t("settings.payments.help")}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = PAYMENT_METHOD_ICONS[method];
                    const checked = field.value.includes(method);
                    return (
                      <label
                        key={method}
                        className={cn(
                          "border-line hover:bg-tint/60 flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                          checked && "border-primary bg-primary-soft/50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          className="mt-0.5"
                          onChange={(e) =>
                            field.onChange(
                              e.target.checked
                                ? PAYMENT_METHODS.filter((m) => m === method || field.value.includes(m))
                                : field.value.filter((m: PaymentMethod) => m !== method),
                            )
                          }
                        />
                        <Icon aria-hidden className="text-fg-muted mt-0.5 size-5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="text-fg flex flex-wrap items-center gap-2 text-sm font-semibold">
                            {t(`labels.methods.${method}.label`)}
                            <Badge tone="neutral">
                              {method !== "CASH"
                                ? t("settings.payments.referenceRequired")
                                : t("settings.payments.referenceOptional")}
                            </Badge>
                          </span>
                          <span className="text-fg-muted mt-0.5 block text-sm">
                            {t(`labels.methods.${method}.description`)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
          />
          {errors.enabledPaymentMethods ? (
            <p role="alert" className="text-caption text-danger font-medium">
              {errors.enabledPaymentMethods.message}
            </p>
          ) : null}
          <p className="text-fg-muted text-sm">{t("settings.payments.existingKeep")}</p>
        </div>
        <SaveBar dirty={isDirty} saving={isSubmitting} onReset={() => form.reset()} />
      </form>
    </Card>
  );
}
