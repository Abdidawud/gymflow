"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Info, Lock, ReceiptText, RefreshCw, Tag, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Avatar } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { DialogDescription, DialogTitle, Sheet, SheetContent } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { validitySentence } from "@/i18n/membership";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import type { Translator } from "@/i18n/translator";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { PaymentDetail, PaymentMethod, RecordPaymentRequest } from "@gymflow/shared/api/types";
import { addDays, isDateOnly, type DateOnly } from "@gymflow/shared/domain/dates";
import { MAX_BACKDATE_DAYS } from "@gymflow/shared/domain/membership";
import { formatPhone } from "@gymflow/shared/domain/phone";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/auth-provider";
import { StatusBadge } from "@/features/members/status-badge";
import { MemberPicker } from "./member-picker";
import { MembershipPreview } from "./membership-preview";
import { PAYMENT_METHOD_ICONS } from "./payment-methods";

type Phase = "idle" | "submitting" | "uncertain";

function newOperationKey(): string {
  return crypto.randomUUID();
}

function buildSchema(today: DateOnly, t: Translator["t"]) {
  return z
    .object({
      planId: z.string().min(1, t("payments.drawer.errors.plan")),
      paymentMethod: z.string().min(1, t("payments.drawer.errors.method")),
      receivedDate: z
        .string()
        .refine(isDateOnly, t("payments.drawer.errors.date"))
        .refine((value) => value <= today, t("payments.drawer.errors.futureDate")),
      reference: z
        .string()
        .trim()
        .max(64, t("common.validation.maxLength", { max: 64 })),
      requestedStartDate: z.string(),
      notes: z
        .string()
        .trim()
        .max(500, t("common.validation.maxLength", { max: 500 })),
    })
    .superRefine((values, ctx) => {
      if (values.paymentMethod && values.paymentMethod !== "CASH" && !values.reference.trim()) {
        ctx.addIssue({ code: "custom", path: ["reference"], message: t("payments.drawer.errors.reference") });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;
const FORM_FIELDS = ["planId", "paymentMethod", "receivedDate", "reference", "requestedStartDate", "notes"] as const;

export interface PaymentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMemberId?: string;
}

/**
 * Shared Record Payment / Renew Membership drawer (design.md §12): right-side
 * drawer on desktop, full-screen on mobile. Records a received full payment and
 * its membership period as one idempotent operation.
 */
export function PaymentDrawer({ open, onOpenChange, initialMemberId }: PaymentDrawerProps) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const { gym, can } = useSession();
  const queryClient = useQueryClient();

  const [memberId, setMemberId] = useState<string | null>(initialMemberId ?? null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<{ tone: "error" | "warning"; title: MessageKey; message?: string } | null>(null);
  const [result, setResult] = useState<PaymentDetail | null>(null);
  const [startTouched, setStartTouched] = useState(false);
  // Until staff set the payment date themselves, it follows a backdated start date.
  const [receivedTouched, setReceivedTouched] = useState(false);
  // One operation key per transaction, reused for retries (backend design §14).
  const operationKey = useRef<string>("");
  const lastRequest = useRef<RecordPaymentRequest | null>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  const schema = useMemo(() => buildSchema(gym.today, t), [gym.today, t]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      planId: "",
      paymentMethod: gym.enabledPaymentMethods.length === 1 ? gym.enabledPaymentMethods[0] : "",
      receivedDate: gym.today,
      reference: "",
      requestedStartDate: "",
      notes: "",
    },
  });
  const { errors } = form.formState;
  const [planId, paymentMethod, receivedDate, requestedStartDate] = useWatch({
    control: form.control,
    name: ["planId", "paymentMethod", "receivedDate", "requestedStartDate"],
  });

  const member = useQuery({
    queryKey: queryKeys.members.detail(memberId ?? ""),
    queryFn: () => api.members.get(memberId!),
    enabled: Boolean(memberId),
  });
  const plans = useQuery({ queryKey: queryKeys.plans.list(false), queryFn: () => api.plans.list() });
  const enabledPlans = (plans.data ?? []).filter((plan) => plan.isEnabled);
  const archived = member.data?.isArchived ?? false;

  const previewRequest =
    memberId && planId
      ? { memberId, planId, requestedStartDate: startTouched && requestedStartDate ? requestedStartDate : undefined }
      : null;
  const preview = useQuery({
    queryKey: queryKeys.payments.preview(previewRequest ?? { memberId: "", planId: "" }),
    queryFn: () => api.payments.preview(previewRequest!),
    enabled: Boolean(previewRequest) && member.isSuccess && !archived,
    retry: false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
  const previewData = preview.data && previewRequest ? preview.data : null;
  const previewBusy = preview.isFetching || preview.isPlaceholderData;
  const previewError = preview.error instanceof ApiError ? preview.error : null;
  const startError = errors.requestedStartDate?.message ?? previewError?.fieldErrors.requestedStartDate;

  // Editable start dates begin at the server's proposal until staff change them.
  useEffect(() => {
    if (previewData && !previewData.startIsAutomatic && !startTouched) {
      form.setValue("requestedStartDate", previewData.startDate);
    }
  }, [previewData, startTouched, form]);

  useEffect(() => {
    if (result) successHeading.current?.focus();
  }, [result]);

  const record = useMutation({
    mutationFn: ({ request, key }: { request: RecordPaymentRequest; key: string }) => api.payments.record(request, key),
  });

  async function submit(request: RecordPaymentRequest) {
    if (!operationKey.current) operationKey.current = newOperationKey();
    setPhase("submitting");
    setNotice(null);
    try {
      const { payment } = await record.mutateAsync({ request, key: operationKey.current });
      setResult(payment);
      setPhase("idle");
      // Refresh everything that depends on membership status and payments (backend design §14).
      for (const key of [
        queryKeys.members.all,
        queryKeys.memberships.all,
        queryKeys.payments.all,
        queryKeys.dashboard,
        queryKeys.reports.all,
        queryKeys.plans.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    } catch (error) {
      if (error instanceof ApiError && error.isUncertain) {
        // Keep the same key: retrying returns the recorded payment instead of creating a second one.
        setPhase("uncertain");
        return;
      }
      operationKey.current = "";
      setPhase("idle");
      if (!(error instanceof ApiError) || error.status === 401) {
        setNotice({ tone: "error", title: "payments.drawer.failed" });
        return;
      }
      if (error.code === "STALE_PREVIEW") {
        void preview.refetch();
        setNotice({ tone: "warning", title: "payments.drawer.changedTitle", message: error.message });
        return;
      }
      let mapped = false;
      for (const [field, message] of Object.entries(error.fieldErrors)) {
        if ((FORM_FIELDS as readonly string[]).includes(field)) {
          form.setError(field as (typeof FORM_FIELDS)[number], { message });
          mapped = true;
        }
      }
      setNotice({
        tone: "error",
        title: "payments.drawer.failed",
        message: mapped ? t("payments.drawer.checkFields") : error.message,
      });
    }
  }

  const onValid = (values: FormValues) => {
    if (phase !== "idle" || !memberId || !previewData || previewBusy) return;
    const request: RecordPaymentRequest = {
      memberId,
      planId: values.planId,
      paymentMethod: values.paymentMethod as PaymentMethod,
      receivedDate: values.receivedDate,
      requestedStartDate: previewData.startIsAutomatic ? undefined : previewData.startDate,
      reference: values.reference.trim() || null,
      notes: values.notes.trim() || null,
      previewFingerprint: previewData.previewFingerprint,
    };
    lastRequest.current = request;
    void submit(request);
  };

  function handleOpenChange(next: boolean) {
    if (!next && phase !== "idle") return;
    onOpenChange(next);
  }

  const title = member.data?.membership.hasPaidMembership
    ? t("payments.drawer.renewTitle")
    : t("payments.drawer.recordTitle");
  const methods = gym.enabledPaymentMethods;
  const noPlans = plans.isSuccess && enabledPlans.length === 0;
  const canConfirm = Boolean(previewData) && !previewBusy && !previewError && !archived && phase === "idle";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent dismissible={phase === "idle"} aria-describedby="payment-drawer-description">
        <div className="border-line flex items-start gap-3 border-b px-5 py-4 md:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-fg text-xl leading-7 font-semibold tracking-[-0.01em]">
              {result ? t("payments.drawer.recordedTitle") : title}
            </DialogTitle>
            <DialogDescription id="payment-drawer-description" className="text-fg-muted mt-0.5 text-sm">
              {t("payments.drawer.description")}
            </DialogDescription>
          </div>
          <IconButton label={t("common.close")} onClick={() => handleOpenChange(false)} disabled={phase !== "idle"}>
            <X aria-hidden />
          </IconButton>
        </div>

        {result ? (
          <SuccessView payment={result} headingRef={successHeading} onDone={() => onOpenChange(false)} />
        ) : noPlans ? (
          <div className="flex-1 overflow-y-auto">
            <EmptyState
              icon={<Tag aria-hidden />}
              title={t("payments.drawer.noPlansTitle")}
              description={
                can("plans.manage") ? t("payments.drawer.noPlansAdmin") : t("payments.drawer.noPlansReception")
              }
              actions={
                can("plans.manage") ? (
                  <Button asChild onClick={() => onOpenChange(false)}>
                    <Link href="/plans">{t("payments.drawer.createPlan")}</Link>
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(event) => void form.handleSubmit(onValid)(event)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 scrollbar-thin overflow-y-auto px-5 py-5 md:px-6">
              <fieldset disabled={phase !== "idle"} className="flex min-w-0 flex-col gap-6">
                {/* 1. Member */}
                <div className="flex flex-col gap-2">
                  <p className="text-fg text-sm font-semibold">
                    {t("payments.drawer.member")}
                    <span aria-hidden className="text-danger ml-0.5">
                      *
                    </span>
                  </p>
                  {!memberId ? (
                    <MemberPicker autoFocus onSelect={(id) => setMemberId(id)} />
                  ) : member.isPending ? (
                    <Skeleton className="h-20 w-full rounded-xl" />
                  ) : member.isError ? (
                    <Alert tone="error" title={t("payments.drawer.memberLoadError")}>
                      <button type="button" className="font-semibold underline" onClick={() => void member.refetch()}>
                        {t("common.retry")}
                      </button>
                    </Alert>
                  ) : (
                    <div className="border-line bg-tint/60 rounded-xl border p-3.5">
                      <div className="flex items-start gap-3">
                        <Avatar name={member.data.fullName} photoUrl={member.data.photoUrl} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="text-fg truncate font-semibold">{member.data.fullName}</p>
                          <p className="text-fg-muted text-sm">
                            {member.data.memberCode} · {formatPhone(member.data.phone)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge state={member.data.membership} />
                          </div>
                          <p className="text-fg-muted mt-1.5 text-xs">
                            {validitySentence(i18n, member.data.membership)}
                          </p>
                        </div>
                        {!initialMemberId ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMemberId(null);
                              setStartTouched(false);
                              form.setValue("requestedStartDate", "");
                            }}
                          >
                            {t("payments.drawer.change")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {archived ? (
                    <Alert tone="warning" title={t("payments.drawer.archivedTitle")}>
                      {t("payments.drawer.archivedText")}
                    </Alert>
                  ) : null}
                </div>

                {/* 2–3. Plan and amount */}
                <fieldset className="flex flex-col gap-2" aria-describedby={errors.planId ? "plan-error" : undefined}>
                  <legend className="text-fg mb-2 text-sm font-semibold">
                    {t("payments.drawer.plan")}
                    <span aria-hidden className="text-danger ml-0.5">
                      *
                    </span>
                  </legend>
                  {plans.isPending ? (
                    <div className="grid grid-cols-2 gap-2">
                      {Array.from({ length: 4 }, (_, i) => (
                        <Skeleton key={i} className="h-[76px] rounded-lg" />
                      ))}
                    </div>
                  ) : plans.isError ? (
                    <Alert tone="error" title={t("payments.drawer.plansLoadError")}>
                      <button type="button" className="font-semibold underline" onClick={() => void plans.refetch()}>
                        {t("common.retry")}
                      </button>
                    </Alert>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                      {enabledPlans.map((plan) => (
                        <label
                          key={plan.id}
                          className={cn(
                            "border-line-strong bg-input hover:border-fg-subtle relative flex min-h-[76px] cursor-pointer flex-col justify-center rounded-lg border px-3 py-2.5 transition-colors",
                            "has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:ring-primary has-[:checked]:ring-1",
                            "has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                          )}
                        >
                          <input type="radio" value={plan.id} className="sr-only" {...form.register("planId")} />
                          <span className="text-fg text-sm font-semibold">{plan.name}</span>
                          <span className="text-fg-muted text-xs">{f.days(plan.durationDays)}</span>
                          <span className="text-fg tabular mt-1 text-sm font-semibold">{f.money(plan.price)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {errors.planId ? (
                    <p id="plan-error" className="text-caption text-danger font-medium">
                      {errors.planId.message}
                    </p>
                  ) : null}
                </fieldset>

                <Field label={t("payments.drawer.amount")} hint={t("payments.drawer.amountHint")}>
                  {(control) => (
                    <Input
                      {...control}
                      readOnly
                      value={
                        previewData ? f.amount(previewData.amount) : planId ? "…" : t("payments.drawer.selectPlan")
                      }
                      suffix={f.currency}
                      leftIcon={<Lock aria-hidden />}
                      className="tabular font-semibold"
                    />
                  )}
                </Field>

                {/* 4. Payment method */}
                <fieldset
                  className="flex flex-col gap-2"
                  aria-describedby={errors.paymentMethod ? "method-error" : "method-hint"}
                >
                  <legend className="text-fg mb-2 text-sm font-semibold">
                    {t("payments.drawer.method")}
                    <span aria-hidden className="text-danger ml-0.5">
                      *
                    </span>
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {methods.map((method) => {
                      const Icon = PAYMENT_METHOD_ICONS[method];
                      return (
                        <label
                          key={method}
                          className={cn(
                            "border-line-strong bg-input text-fg hover:border-fg-subtle flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                            "has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:ring-primary has-[:checked]:ring-1",
                            "has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                          )}
                        >
                          <input type="radio" value={method} className="sr-only" {...form.register("paymentMethod")} />
                          <Icon aria-hidden className="text-fg-muted size-[18px] shrink-0" />
                          {t(`labels.methods.${method}.label`)}
                        </label>
                      );
                    })}
                  </div>
                  {errors.paymentMethod ? (
                    <p id="method-error" className="text-caption text-danger font-medium">
                      {errors.paymentMethod.message}
                    </p>
                  ) : (
                    <p id="method-hint" className="text-caption text-fg-muted">
                      {t("payments.drawer.methodHint")}
                    </p>
                  )}
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                  {/* 5. Payment date */}
                  <Field
                    label={t("payments.drawer.date")}
                    required
                    id="payment-received-date"
                    error={errors.receivedDate?.message}
                    hint={t("payments.drawer.dateHint")}
                  >
                    {(control) => (
                      <Controller
                        control={form.control}
                        name="receivedDate"
                        render={({ field }) => (
                          <DateInput
                            {...control}
                            value={field.value}
                            onChange={(date) => {
                              setReceivedTouched(true);
                              field.onChange(date);
                            }}
                            onBlur={field.onBlur}
                            max={gym.today}
                            today={gym.today}
                          />
                        )}
                      />
                    )}
                  </Field>

                  {/* 6. Reference */}
                  <Field
                    label={t("payments.drawer.reference")}
                    required={Boolean(paymentMethod) && paymentMethod !== "CASH"}
                    optional={!paymentMethod || paymentMethod === "CASH"}
                    id="payment-reference"
                    error={errors.reference?.message}
                    hint={
                      paymentMethod ? t(`labels.methods.${paymentMethod as PaymentMethod}.referenceHint`) : undefined
                    }
                  >
                    {(control) => <Input {...control} autoComplete="off" {...form.register("reference")} />}
                  </Field>
                </div>

                {/* 7. Membership start */}
                {previewData?.startIsAutomatic ? (
                  <Field
                    key="start-automatic"
                    label={t("payments.drawer.start")}
                    hint={t("payments.drawer.startAutoHint")}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        readOnly
                        value={f.date(previewData.startDate)}
                        leftIcon={<Lock aria-hidden />}
                      />
                    )}
                  </Field>
                ) : memberId && planId ? (
                  <Field
                    key="start-editable"
                    label={t("payments.drawer.start")}
                    required
                    id="payment-start-date"
                    error={startError}
                    hint={t("payments.drawer.startHint")}
                  >
                    {(control) => (
                      <Controller
                        control={form.control}
                        name="requestedStartDate"
                        render={({ field }) => (
                          <DateInput
                            {...control}
                            value={field.value}
                            onChange={(date) => {
                              setStartTouched(true);
                              field.onChange(date);
                              // A member who joined before GymFlow paid when their membership began.
                              if (!receivedTouched) {
                                form.setValue("receivedDate", date < gym.today ? date : gym.today, {
                                  shouldValidate: true,
                                });
                              }
                            }}
                            onBlur={field.onBlur}
                            min={previewData?.minStartDate ?? addDays(gym.today, -MAX_BACKDATE_DAYS)}
                            max={addDays(gym.today, 365)}
                            today={gym.today}
                          />
                        )}
                      />
                    )}
                  </Field>
                ) : null}

                {/* 8. Notes */}
                <Field label={t("payments.drawer.notes")} optional id="payment-notes" error={errors.notes?.message}>
                  {(control) => <Textarea {...control} rows={2} maxLength={500} {...form.register("notes")} />}
                </Field>

                {previewError &&
                !previewError.fieldErrors.requestedStartDate &&
                previewError.code !== "MEMBER_ARCHIVED" ? (
                  <Alert
                    tone="error"
                    title={t("payments.drawer.previewError")}
                    action={
                      <Button variant="secondary" size="sm" onClick={() => void preview.refetch()}>
                        {t("common.retry")}
                      </Button>
                    }
                  >
                    {previewError.message}
                  </Alert>
                ) : null}

                {previewData ? (
                  <MembershipPreview
                    preview={previewData}
                    method={paymentMethod as PaymentMethod | ""}
                    receivedDate={receivedDate}
                    updating={previewBusy}
                    today={gym.today}
                  />
                ) : null}
              </fieldset>
            </div>

            <div className="border-line bg-surface border-t px-5 py-4 md:px-6">
              {notice ? (
                <Alert tone={notice.tone} title={t(notice.title)} live className="mb-3">
                  {notice.message}
                </Alert>
              ) : null}
              {phase === "uncertain" ? (
                <Alert tone="warning" live className="mb-3" title={t("payments.drawer.uncertainTitle")}>
                  <p>{t("payments.drawer.uncertainText")}</p>
                  <Button
                    size="sm"
                    className="mt-2"
                    leftIcon={<RefreshCw aria-hidden />}
                    onClick={() => lastRequest.current && void submit(lastRequest.current)}
                  >
                    {t("payments.drawer.checkAgain")}
                  </Button>
                </Alert>
              ) : null}
              <p className="text-fg-muted mb-3 flex items-center gap-2 text-sm">
                <Info aria-hidden className="size-4 shrink-0" />
                {t("payments.drawer.confirmHint")}
              </p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={phase !== "idle"}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  loading={phase === "submitting"}
                  loadingText={t("payments.drawer.recording")}
                  disabled={!canConfirm}
                  className="sm:min-w-44"
                >
                  {previewData
                    ? t("payments.drawer.confirmAmount", { amount: f.money(previewData.amount) })
                    : t("payments.drawer.confirm")}
                </Button>
              </div>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SuccessView({
  payment,
  headingRef,
  onDone,
}: {
  payment: PaymentDetail;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onDone: () => void;
}) {
  const { t, f } = useI18n();
  const range = f.dateRange(payment.membership.startDate, payment.membership.endDate);
  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-8 md:px-6" role="status">
        <div className="flex flex-col items-center text-center">
          <span className="bg-success-bg text-success-fg flex size-16 items-center justify-center rounded-full">
            <CircleCheck aria-hidden className="size-8" />
          </span>
          <h3 ref={headingRef} tabIndex={-1} className="text-fg mt-4 text-xl font-semibold focus:outline-none">
            {t("payments.drawer.success.title")}
          </h3>
          <p className="text-fg-muted mt-1 text-sm">
            {t("payments.drawer.success.covered", { name: payment.member.fullName, range })}
          </p>
        </div>
        <dl className="divide-line border-line mt-6 divide-y rounded-xl border">
          {[
            [
              t("payments.drawer.success.paymentId"),
              <span key="id" className="font-mono font-semibold">
                {payment.paymentCode}
              </span>,
            ],
            [
              t("payments.drawer.success.amount"),
              <span key="amount" className="font-bold">
                {f.money(payment.amount)}
              </span>,
            ],
            [t("payments.drawer.success.method"), t(`labels.methods.${payment.method}.label`)],
            [t("payments.drawer.success.date"), f.date(payment.receivedDate)],
            [t("payments.drawer.success.plan"), f.plan(payment.membership.planName, payment.membership.durationDays)],
            [t("payments.drawer.success.period"), range],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <dt className="text-fg-muted">{label}</dt>
              <dd className="text-fg text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="border-line flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:justify-end md:px-6">
        <Button variant="secondary" asChild>
          <Link href={`/payments/${payment.id}`} onClick={onDone}>
            <ReceiptText aria-hidden />
            {t("payments.drawer.success.viewReceipt")}
          </Link>
        </Button>
        <Button onClick={onDone}>{t("common.done")}</Button>
      </div>
    </>
  );
}
