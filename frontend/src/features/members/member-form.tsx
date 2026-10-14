"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ContactRound, Info, NotebookPen, TriangleAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { DuplicatePhoneMatch, Gender, MemberDetail, MemberInput } from "@gymflow/shared/api/types";
import { useI18n } from "@/i18n/provider";
import type { Translator } from "@/i18n/translator";
import { formatPhone, normalizeEthiopianPhone } from "@gymflow/shared/domain/phone";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes";
import { listReturnUrl } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/auth-provider";
import { PhotoUpload, type PhotoChange } from "./photo-upload";
import { invalidateMemberViews, useSaveMember } from "./queries";
import { StatusBadge } from "./status-badge";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RELATIONSHIPS = ["spouse", "mother", "father", "sister", "brother", "child", "relative", "friend"] as const;

function buildSchema(t: Translator["t"]) {
  const max = (n: number) => t("common.validation.maxLength", { max: n });
  return z
    .object({
      firstName: z.string().trim().min(1, t("members.form.errors.firstName")).max(60, max(60)),
      lastName: z.string().trim().min(1, t("members.form.errors.lastName")).max(60, max(60)),
      phone: z
        .string()
        .trim()
        .min(1, t("members.form.errors.phone"))
        .refine((v) => normalizeEthiopianPhone(v) !== null, t("common.validation.mobileInvalid")),
      email: z
        .string()
        .trim()
        .max(254, max(254))
        .refine((v) => !v || EMAIL_RE.test(v), t("common.validation.emailInvalid")),
      gender: z.enum(["", "MALE", "FEMALE"]),
      emergencyName: z.string().trim().max(80, max(80)),
      emergencyPhone: z
        .string()
        .trim()
        .refine((v) => !v || normalizeEthiopianPhone(v, "any") !== null, t("common.validation.phoneInvalid")),
      emergencyRelationship: z.string().trim().max(40, max(40)),
      address: z.string().trim().max(200, max(200)),
      notes: z.string().trim().max(1000, max(1000)),
    })
    .superRefine((v, ctx) => {
      if (v.emergencyName && !v.emergencyPhone) {
        ctx.addIssue({ code: "custom", path: ["emergencyPhone"], message: t("members.form.errors.emergencyPhone") });
      }
      if (v.emergencyPhone && !v.emergencyName) {
        ctx.addIssue({ code: "custom", path: ["emergencyName"], message: t("members.form.errors.emergencyName") });
      }
    });
}

type Values = z.infer<ReturnType<typeof buildSchema>>;
type FieldName = keyof Values;

const FIELD_ORDER: FieldName[] = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "gender",
  "emergencyName",
  "emergencyPhone",
  "emergencyRelationship",
  "address",
  "notes",
];

function toValues(member?: MemberDetail): Values {
  return {
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    phone: member ? formatPhone(member.phone) : "",
    email: member?.email ?? "",
    gender: member?.gender ?? "",
    emergencyName: member?.emergencyName ?? "",
    emergencyPhone: member?.emergencyPhone ? formatPhone(member.emergencyPhone) : "",
    emergencyRelationship: member?.emergencyRelationship ?? "",
    address: member?.address ?? "",
    notes: member?.notes ?? "",
  };
}

const fieldId = (name: FieldName) => `member-${name}`;

/** Register (design.md §10) and edit member form. */
export function MemberForm({ member }: { member?: MemberDetail }) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const editing = Boolean(member);
  const formId = useId();
  const relationshipListId = useId();
  const { gym } = useSession();
  const queryClient = useQueryClient();
  const save = useSaveMember(member?.id);

  const [photo, setPhoto] = useState<PhotoChange>({ kind: "keep" });
  const [duplicate, setDuplicate] = useState<DuplicatePhoneMatch | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const schema = useMemo(() => buildSchema(t), [t]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(member) });
  const { errors, isSubmitting, isDirty } = form.formState;
  const { dialog, leave, leaveWithoutPrompt } = useUnsavedChangesGuard(
    (isDirty || photo.kind !== "keep") && !isSubmitting,
  );

  const membersHref = listReturnUrl("/members");
  const cancelHref = member ? `/members/${member.id}` : membersHref;
  const breadcrumbs: Crumb[] = member
    ? [
        { label: t("members.list.title"), href: membersHref },
        { label: member.fullName, href: `/members/${member.id}` },
        { label: t("members.form.crumbEdit") },
      ]
    : [{ label: t("members.list.title"), href: membersHref }, { label: t("members.form.crumbAdd") }];

  async function checkPhone(value: string) {
    const normalized = normalizeEthiopianPhone(value);
    if (!normalized || normalized === member?.phone) {
      setDuplicate(null);
      return;
    }
    try {
      setDuplicate(await api.members.findByPhone(normalized, member?.id));
    } catch {
      // The server re-checks on save.
    }
  }

  async function onSubmit(values: Values) {
    setSubmitError(null);
    setShowSummary(false);
    const input: MemberInput = {
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      email: values.email || null,
      gender: (values.gender || null) as Gender | null,
      emergencyName: values.emergencyName || null,
      emergencyPhone: values.emergencyPhone || null,
      emergencyRelationship: values.emergencyRelationship || null,
      address: values.address || null,
      notes: values.notes || null,
    };

    let saved: MemberDetail;
    try {
      saved = await save.mutateAsync(input);
    } catch (error) {
      if (error instanceof ApiError && error.code === "DUPLICATE_PHONE") {
        const match = error.details.member as DuplicatePhoneMatch | undefined;
        if (match) setDuplicate(match);
        form.setError("phone", { message: t("members.form.duplicateError") }, { shouldFocus: true });
        return;
      }
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        let first = true;
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          if ((FIELD_ORDER as string[]).includes(field)) {
            form.setError(field as FieldName, { message }, { shouldFocus: first });
            first = false;
          }
        }
        return;
      }
      setSubmitError(errorMessage(error, t("members.form.saveFailed")));
      return;
    }

    if (photo.kind !== "keep") {
      try {
        const updated =
          photo.kind === "replace"
            ? await api.members.uploadPhoto(saved.id, photo.file)
            : await api.members.removePhoto(saved.id);
        invalidateMemberViews(queryClient, updated);
      } catch (error) {
        toast.warning(t("members.form.photoFailed"), {
          description: errorMessage(error, t("members.form.photoFailedHint")),
        });
      }
    }

    if (editing) {
      toast.success(t("members.form.saved"));
      leaveWithoutPrompt(`/members/${saved.id}`);
    } else {
      toast.success(t("members.form.registered"));
      leaveWithoutPrompt(`/members/${saved.id}?registered=1`);
    }
  }

  function onInvalid(invalid: FieldErrors<Values>) {
    setShowSummary(Object.keys(invalid).length > 1);
  }

  const errorEntries = FIELD_ORDER.filter((name) => errors[name]?.message);

  const actions = (
    <>
      <Button variant="secondary" onClick={() => leave(cancelHref)} disabled={isSubmitting}>
        {t("common.cancel")}
      </Button>
      <Button
        type="submit"
        form={formId}
        loading={isSubmitting}
        loadingText={t("common.saving")}
        leftIcon={<Check aria-hidden />}
      >
        {editing ? t("common.saveChanges") : t("members.form.save")}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={editing ? t("members.form.editTitle") : t("members.form.addTitle")}
        description={editing ? t("members.form.editDescription") : t("members.form.addDescription")}
        actions={actions}
      />

      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="flex max-w-5xl flex-col gap-6"
      >
        {showSummary && errorEntries.length > 1 ? (
          <Alert tone="error" live title={t("members.form.summaryTitle", { count: errorEntries.length })}>
            <ul className="mt-1 list-disc pl-5">
              {errorEntries.map((name) => (
                <li key={name}>
                  <a
                    href={`#${fieldId(name)}`}
                    className="underline"
                    onClick={(event) => {
                      event.preventDefault();
                      form.setFocus(name);
                    }}
                  >
                    {t(`members.form.fieldNames.${name}`)}: {errors[name]?.message}
                  </a>
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {submitError ? (
          <Alert tone="error" live title={t("members.form.saveFailedTitle")}>
            {submitError}
          </Alert>
        ) : null}

        <Card className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="bg-tint rounded-lg p-3.5">
              <p className="text-caption text-fg-muted font-semibold tracking-wider uppercase">
                {t("members.form.memberId")}
              </p>
              <p className={cn("text-fg mt-1 text-base font-semibold", member && "font-mono")}>
                {member?.memberCode ?? t("members.form.assignedOnSave")}
              </p>
            </div>
            <div className="bg-tint rounded-lg p-3.5">
              <p className="text-caption text-fg-muted font-semibold tracking-wider uppercase">
                {t("members.form.registrationDate")}
              </p>
              <p className="text-fg mt-1 text-base font-semibold">{f.date(member?.registrationDate ?? gym.today)}</p>
            </div>
            <div className="bg-tint rounded-lg p-3.5">
              <p className="text-caption text-fg-muted font-semibold tracking-wider uppercase">
                {t("members.form.membershipStatus")}
              </p>
              <div className="mt-1.5">
                {member ? (
                  <StatusBadge state={member.membership} />
                ) : (
                  <Badge tone="neutral">{t("members.form.unpaidUntil")}</Badge>
                )}
              </div>
            </div>
          </div>
          {!editing ? (
            <Alert tone="info" className="mt-4" icon={<Info aria-hidden />}>
              {i18n.rich("members.form.savingNote", { b: (chunks) => <strong>{chunks}</strong> })}
            </Alert>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-8 p-5 sm:p-6">
          <FormSection
            icon={<UserRound aria-hidden />}
            title={t("members.form.personal")}
            description={t("members.form.personalDescription")}
          >
            <PhotoUpload currentUrl={member?.photoUrl ?? null} change={photo} onChange={setPhoto} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t("members.form.firstName")}
                required
                id={fieldId("firstName")}
                error={errors.firstName?.message}
              >
                {(c) => <Input {...c} autoComplete="off" autoFocus={!editing} {...form.register("firstName")} />}
              </Field>
              <Field
                label={t("members.form.lastName")}
                required
                id={fieldId("lastName")}
                error={errors.lastName?.message}
              >
                {(c) => <Input {...c} autoComplete="off" {...form.register("lastName")} />}
              </Field>
              <div className="flex flex-col gap-2">
                <Field
                  label={t("members.form.phone")}
                  required
                  id={fieldId("phone")}
                  error={errors.phone?.message}
                  hint={t("members.form.phoneHint")}
                >
                  {(c) => (
                    <Input
                      {...c}
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      {...form.register("phone", {
                        onBlur: (event) => void checkPhone(event.target.value),
                        onChange: () => setDuplicate(null),
                      })}
                    />
                  )}
                </Field>
                {duplicate ? (
                  <Alert tone="warning" icon={<TriangleAlert aria-hidden />} live>
                    {i18n.rich(
                      "members.form.duplicate",
                      {
                        b: (chunks) => <strong>{chunks}</strong>,
                        link: (chunks) => (
                          <Link href={`/members/${duplicate.id}`} className="font-semibold underline">
                            {chunks}
                          </Link>
                        ),
                      },
                      { name: duplicate.fullName, code: duplicate.memberCode },
                    )}
                  </Alert>
                ) : null}
              </div>
              <Field label={t("members.form.email")} optional id={fieldId("email")} error={errors.email?.message}>
                {(c) => <Input {...c} type="email" inputMode="email" autoComplete="off" {...form.register("email")} />}
              </Field>
              <Field label={t("members.form.gender")} optional id={fieldId("gender")} error={errors.gender?.message}>
                {(c) => (
                  <Select {...c} {...form.register("gender")}>
                    <option value="">{t("labels.gender.unspecified")}</option>
                    <option value="FEMALE">{t("labels.gender.FEMALE")}</option>
                    <option value="MALE">{t("labels.gender.MALE")}</option>
                  </Select>
                )}
              </Field>
            </div>
          </FormSection>

          <div className="bg-line h-px" />

          <FormSection
            icon={<ContactRound aria-hidden />}
            title={t("members.form.emergency")}
            description={t("members.form.emergencyDescription")}
          >
            <div className="grid gap-5 sm:grid-cols-3">
              <Field
                label={t("members.form.contactName")}
                optional
                id={fieldId("emergencyName")}
                error={errors.emergencyName?.message}
              >
                {(c) => <Input {...c} autoComplete="off" {...form.register("emergencyName")} />}
              </Field>
              <Field
                label={t("members.form.contactPhone")}
                optional
                id={fieldId("emergencyPhone")}
                error={errors.emergencyPhone?.message}
              >
                {(c) => (
                  <Input {...c} type="tel" inputMode="tel" autoComplete="off" {...form.register("emergencyPhone")} />
                )}
              </Field>
              <Field
                label={t("members.form.relationship")}
                optional
                id={fieldId("emergencyRelationship")}
                error={errors.emergencyRelationship?.message}
              >
                {(c) => (
                  <>
                    <Input
                      {...c}
                      list={relationshipListId}
                      autoComplete="off"
                      {...form.register("emergencyRelationship")}
                    />
                    <datalist id={relationshipListId}>
                      {RELATIONSHIPS.map((r) => (
                        <option key={r} value={t(`members.form.relationships.${r}`)} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
            </div>
          </FormSection>

          <div className="bg-line h-px" />

          <FormSection icon={<NotebookPen aria-hidden />} title={t("members.form.additional")}>
            <div className="grid gap-5">
              <Field
                label={t("members.form.address")}
                optional
                id={fieldId("address")}
                error={errors.address?.message}
                hint={t("members.form.addressHint")}
              >
                {(c) => <Input {...c} autoComplete="off" {...form.register("address")} />}
              </Field>
              <Field
                label={t("members.form.notes")}
                optional
                id={fieldId("notes")}
                error={errors.notes?.message}
                hint={t("members.form.notesHint")}
              >
                {(c) => <Textarea {...c} rows={3} maxLength={1000} {...form.register("notes")} />}
              </Field>
            </div>
          </FormSection>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{actions}</div>
      </form>
      {dialog}
    </>
  );
}
