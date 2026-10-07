"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CirclePause, CirclePlay, Info, Pencil, Plus, Tag, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Alert, EmptyState, LoadError } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/provider";
import type { Translator } from "@/i18n/translator";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { Plan, PlanInput } from "@/lib/api/types";
import { formatAmount, parsePriceInput } from "@/lib/domain/money";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { usePlans } from "@/features/members/queries";

function useInvalidatePlans() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.plans.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.session });
  };
}

export function PlansPage() {
  const { t } = useI18n();
  const plans = usePlans(true);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [disabling, setDisabling] = useState<Plan | null>(null);
  const invalidate = useInvalidatePlans();

  const enable = useMutation({
    mutationFn: (plan: Plan) => api.plans.enable(plan.id),
    onSuccess: (plan) => {
      invalidate();
      toast.success(t("plans.enabledToast", { name: plan.name }));
    },
    onError: (error) => toast.error(errorMessage(error, t("plans.enableFailed"))),
  });

  const list = plans.data ?? [];
  const enabledCount = list.filter((p) => p.isEnabled).length;

  return (
    <>
      <PageHeader
        title={t("plans.title")}
        description={t("plans.subtitle")}
        badge={plans.data ? <Badge tone="success">{t("plans.enabledCount", { count: enabledCount })}</Badge> : null}
        actions={
          <Button leftIcon={<Plus aria-hidden />} onClick={() => setEditing("new")}>
            {t("plans.add")}
          </Button>
        }
      />

      <Alert tone="info" className="mb-6" icon={<Info aria-hidden />}>
        {t("plans.info")}
      </Alert>

      {plans.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : plans.isError ? (
        <Card>
          <LoadError onRetry={() => void plans.refetch()} retrying={plans.isFetching} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Tag aria-hidden />}
            title={t("plans.emptyTitle")}
            description={t("plans.emptyText")}
            actions={
              <Button leftIcon={<Plus aria-hidden />} onClick={() => setEditing("new")}>
                {t("plans.create")}
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[...list]
            .sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled) || a.durationDays - b.durationDays)
            .map((plan) => (
              <li key={plan.id}>
                <PlanCard
                  plan={plan}
                  onEdit={() => setEditing(plan)}
                  onDisable={() => setDisabling(plan)}
                  onEnable={() => enable.mutate(plan)}
                  enabling={enable.isPending && enable.variables?.id === plan.id}
                />
              </li>
            ))}
        </ul>
      )}

      <PlanDialog plan={editing} onClose={() => setEditing(null)} existing={list} />

      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(open) => !open && setDisabling(null)}
        icon={<CirclePause aria-hidden />}
        title={t("plans.disableTitle", { name: disabling?.name ?? "" })}
        description={t("plans.disableText")}
        confirmLabel={t("plans.disableConfirm")}
        pendingLabel={t("plans.disabling")}
        onConfirm={async () => {
          if (!disabling) return;
          await api.plans.disable(disabling.id);
          invalidate();
          toast.success(t("plans.disabledToast", { name: disabling.name }));
        }}
      >
        {disabling && disabling.activeMemberCount > 0 ? (
          <p className="text-fg-muted text-sm">{t("plans.disableKeep", { count: disabling.activeMemberCount })}</p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function PlanCard({
  plan,
  onEdit,
  onDisable,
  onEnable,
  enabling,
}: {
  plan: Plan;
  onEdit: () => void;
  onDisable: () => void;
  onEnable: () => void;
  enabling: boolean;
}) {
  const { t, f } = useI18n();
  return (
    <Card className={cn("flex h-full flex-col p-5", !plan.isEnabled && "bg-tint/40")}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={cn("text-lg font-semibold", plan.isEnabled ? "text-fg" : "text-fg-muted")}>{plan.name}</h2>
        <Badge tone={plan.isEnabled ? "success" : "neutral"}>
          {plan.isEnabled ? t("plans.enabled") : t("plans.disabled")}
        </Badge>
      </div>
      <div className="bg-tint mt-4 flex items-end justify-between gap-3 rounded-lg px-4 py-3">
        <p className="text-fg">
          <span className="text-metric-sm">{f.amount(plan.price)}</span>{" "}
          <span className="text-fg-muted text-sm font-semibold">{f.currency}</span>
        </p>
        <Badge tone="primary">{f.days(plan.durationDays)}</Badge>
      </div>
      <p className="text-fg-muted mt-4 flex-1 text-sm">{plan.description ?? t("plans.noDescription")}</p>
      <p className="text-fg-muted mt-4 flex items-center gap-2 text-sm">
        <Users aria-hidden className="size-4" />
        {t("plans.onPlan", { count: plan.activeMemberCount })}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button
          variant="soft"
          leftIcon={<Pencil aria-hidden />}
          onClick={onEdit}
          aria-label={t("plans.editPlan", { name: plan.name })}
        >
          {t("plans.edit")}
        </Button>
        {plan.isEnabled ? (
          <Button
            variant="secondary"
            leftIcon={<CirclePause aria-hidden />}
            onClick={onDisable}
            aria-label={t("plans.disablePlan", { name: plan.name })}
          >
            {t("plans.disable")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            leftIcon={<CirclePlay aria-hidden />}
            onClick={onEnable}
            loading={enabling}
            aria-label={t("plans.enablePlan", { name: plan.name })}
          >
            {t("plans.enable")}
          </Button>
        )}
      </div>
    </Card>
  );
}

function buildSchema(t: Translator["t"]) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("plans.dialog.errors.name"))
      .max(60, t("common.validation.maxLength", { max: 60 })),
    price: z
      .string()
      .trim()
      .min(1, t("plans.dialog.errors.price"))
      .refine((v) => parsePriceInput(v) !== null, t("plans.dialog.errors.priceInvalid")),
    durationDays: z
      .string()
      .trim()
      .min(1, t("plans.dialog.errors.duration"))
      .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 3650, t("plans.dialog.errors.durationInvalid")),
    description: z
      .string()
      .trim()
      .max(280, t("common.validation.maxLength", { max: 280 })),
    isEnabled: z.boolean(),
  });
}
type PlanValues = z.infer<ReturnType<typeof buildSchema>>;

/** Add/Edit plan modal (design.md §15). */
function PlanDialog({ plan, onClose, existing }: { plan: Plan | "new" | null; onClose: () => void; existing: Plan[] }) {
  const open = plan !== null;
  const editing = plan !== null && plan !== "new" ? plan : null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open ? <PlanDialogBody key={editing?.id ?? "new"} plan={editing} onClose={onClose} existing={existing} /> : null}
    </Dialog>
  );
}

function PlanDialogBody({ plan, onClose, existing }: { plan: Plan | null; onClose: () => void; existing: Plan[] }) {
  const { t, f } = useI18n();
  const invalidate = useInvalidatePlans();
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(
    () =>
      buildSchema(t).refine(
        (v) => !existing.some((p) => p.id !== plan?.id && p.name.toLowerCase() === v.name.trim().toLowerCase()),
        { path: ["name"], message: t("plans.dialog.errors.nameTaken") },
      ),
    [t, existing, plan?.id],
  );
  const form = useForm<PlanValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: plan?.name ?? "",
      price: plan ? formatAmount(plan.price).replace(/,/g, "") : "",
      durationDays: plan ? String(plan.durationDays) : "",
      description: plan?.description ?? "",
      isEnabled: plan?.isEnabled ?? true,
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: PlanValues) {
    setError(null);
    const input: PlanInput = {
      name: values.name,
      price: parsePriceInput(values.price)!,
      durationDays: Number(values.durationDays),
      description: values.description || null,
      isEnabled: values.isEnabled,
    };
    try {
      const saved = plan ? await api.plans.update(plan.id, input) : await api.plans.create(input);
      invalidate();
      toast.success(t(plan ? "plans.dialog.updated" : "plans.dialog.created", { name: saved.name }));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (field in values) form.setError(field as keyof PlanValues, { message });
        }
      } else setError(errorMessage(err, t("plans.dialog.failed")));
    }
  }

  return (
    <DialogContent size="md" dismissible={!isSubmitting}>
      <DialogHeader
        icon={<Tag aria-hidden />}
        title={plan ? t("plans.dialog.editTitle") : t("plans.dialog.addTitle")}
        description={t("plans.dialog.description")}
      />
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-5">
          {error ? (
            <Alert tone="error" live>
              {error}
            </Alert>
          ) : null}
          <Field label={t("plans.dialog.name")} required id="plan-name" error={errors.name?.message}>
            {(c) => <Input {...c} autoComplete="off" autoFocus {...form.register("name")} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={t("plans.dialog.price")}
              required
              id="plan-price"
              error={errors.price?.message}
              hint={t("plans.dialog.priceHint")}
            >
              {(c) => (
                <Input {...c} inputMode="decimal" suffix={f.currency} autoComplete="off" {...form.register("price")} />
              )}
            </Field>
            <Field
              label={t("plans.dialog.duration")}
              required
              id="plan-days"
              error={errors.durationDays?.message}
              hint={t("plans.dialog.durationHint")}
            >
              {(c) => (
                <Input
                  {...c}
                  inputMode="numeric"
                  suffix={t("plans.dialog.daysSuffix")}
                  autoComplete="off"
                  {...form.register("durationDays")}
                />
              )}
            </Field>
          </div>
          <Field
            label={t("plans.dialog.descriptionLabel")}
            optional
            id="plan-description"
            error={errors.description?.message}
          >
            {(c) => <Textarea {...c} rows={3} maxLength={280} {...form.register("description")} />}
          </Field>
          <div className="bg-tint flex items-center justify-between gap-4 rounded-lg px-4 py-3">
            <div>
              <p id="plan-enabled-label" className="text-fg text-sm font-semibold">
                {t("plans.dialog.enabled")}
              </p>
              <p className="text-caption text-fg-muted">{t("plans.dialog.enabledHint")}</p>
            </div>
            <Controller
              control={form.control}
              name="isEnabled"
              render={({ field }) => (
                <Switch aria-labelledby="plan-enabled-label" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
          {plan ? (
            <p className="text-fg-muted flex items-start gap-2 text-sm">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t("plans.saveHelper")}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={isSubmitting} loadingText={t("common.saving")}>
            {plan ? t("common.saveChanges") : t("plans.dialog.create")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
