"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ellipsis,
  Info,
  KeyRound,
  Pencil,
  Power,
  ShieldCheck,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, LoadError } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, PasswordInput, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableSkeletonRows, TD, TH, THead, TR } from "@/components/ui/table";
import { useI18n } from "@/i18n/provider";
import type { Translator } from "@/i18n/translator";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { StaffAccount } from "@gymflow/shared/api/types";
import { meetsPasswordPolicy } from "@gymflow/shared/domain/password";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/providers/auth-provider";
import { PasswordRequirements } from "@/features/auth/password-fields";

function generateTemporaryPassword(): string {
  const words = ["Adama", "Gym", "Lift", "Strong", "Flow", "Power", "Fit", "Iron"];
  const bytes = new Uint32Array(3);
  crypto.getRandomValues(bytes);
  const symbols = "#!@$%";
  return `${words[bytes[0] % words.length]}${words[bytes[1] % words.length]}${symbols[bytes[2] % symbols.length]}${(bytes[2] % 9000) + 1000}`;
}

export function StaffPage() {
  const { t, f, rich } = useI18n();
  const { account } = useSession();
  const queryClient = useQueryClient();
  const staff = useQuery({ queryKey: queryKeys.users, queryFn: () => api.users.list() });
  const [dialog, setDialog] = useState<StaffAccount | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<StaffAccount | null>(null);

  const activate = useMutation({
    mutationFn: (user: StaffAccount) => api.users.activate(user.id),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.success(t("staff.activated", { name: user.fullName }));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const list = staff.data ?? [];
  const activeAdmins = list.filter((s) => s.role === "ADMINISTRATOR" && s.isActive).length;
  const isLastAdmin = (user: StaffAccount) => user.role === "ADMINISTRATOR" && user.isActive && activeAdmins <= 1;

  return (
    <>
      <PageHeader
        title={t("staff.title")}
        description={t("staff.subtitle")}
        actions={
          <Button leftIcon={<UserPlus aria-hidden />} onClick={() => setDialog("new")}>
            {t("staff.add")}
          </Button>
        }
      />
      <Alert tone="info" className="mb-6" icon={<ShieldCheck aria-hidden />}>
        {rich("staff.info", { b: (chunks) => <strong>{chunks}</strong> })}
      </Alert>

      <Card className="overflow-hidden">
        {staff.isError ? (
          <LoadError onRetry={() => void staff.refetch()} retrying={staff.isFetching} />
        ) : (
          <Table caption={t("staff.caption")}>
            <THead>
              <tr>
                <TH>{t("staff.colName")}</TH>
                <TH className="hidden md:table-cell">{t("staff.colEmail")}</TH>
                <TH>{t("staff.colRole")}</TH>
                <TH>{t("staff.colStatus")}</TH>
                <TH className="hidden lg:table-cell">{t("staff.colLastSignIn")}</TH>
                <TH align="right">
                  <span className="sr-only">{t("staff.colActions")}</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {staff.isPending ? (
                <TableSkeletonRows columns={6} rows={4} />
              ) : (
                list.map((user) => {
                  const self = user.id === account.id;
                  const lastAdmin = isLastAdmin(user);
                  return (
                    <TR key={user.id} interactive>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={user.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-fg font-semibold">
                              {user.fullName}{" "}
                              {self ? (
                                <span className="text-fg-muted text-xs font-medium">{t("common.you")}</span>
                              ) : null}
                            </p>
                            <p className="text-fg-muted truncate text-xs md:hidden">{user.email}</p>
                          </div>
                        </div>
                      </TD>
                      <TD className="text-fg-muted hidden md:table-cell">{user.email}</TD>
                      <TD>
                        <Badge tone={user.role === "ADMINISTRATOR" ? "primary" : "neutral"}>
                          {t(`labels.roles.${user.role}.label`)}
                        </Badge>
                      </TD>
                      <TD>
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={user.isActive ? "success" : "error"}>
                            {user.isActive ? t("staff.active") : t("staff.deactivated")}
                          </Badge>
                          {user.mustChangePassword && user.isActive ? (
                            <Badge tone="warning" icon={<KeyRound aria-hidden />}>
                              {t("staff.passwordChangeRequired")}
                            </Badge>
                          ) : null}
                        </div>
                      </TD>
                      <TD className="text-fg-muted hidden whitespace-nowrap lg:table-cell">
                        {user.lastSignInAt ? f.timestamp(user.lastSignInAt) : t("staff.neverSignedIn")}
                      </TD>
                      <TD align="right">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <IconButton label={t("common.actionsFor", { name: user.fullName })} className="md:size-9">
                              <Ellipsis aria-hidden />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => setDialog(user)}>
                              <Pencil aria-hidden />
                              {t("staff.edit")}
                            </DropdownMenuItem>
                            {user.isActive ? (
                              <DropdownMenuItem
                                tone="danger"
                                disabled={lastAdmin || self}
                                onSelect={() => setDeactivating(user)}
                              >
                                <UserRoundX aria-hidden />
                                {t("staff.deactivate")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => activate.mutate(user)}>
                                <UserRoundCheck aria-hidden />
                                {t("staff.activate")}
                              </DropdownMenuItem>
                            )}
                            {user.isActive && (lastAdmin || self) ? (
                              <DropdownMenuLabel className="max-w-56">
                                {self ? t("staff.cantDeactivateSelf") : t("staff.cantDeactivateLastAdmin")}
                              </DropdownMenuLabel>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === "new" ? (
          <AddStaffDialog onClose={() => setDialog(null)} />
        ) : dialog ? (
          <EditStaffDialog
            key={dialog.id}
            user={dialog}
            lastAdmin={isLastAdmin(dialog)}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        icon={<Power aria-hidden />}
        title={t("staff.deactivateTitle", { name: deactivating?.fullName ?? "" })}
        description={t("staff.deactivateText")}
        confirmLabel={t("staff.deactivate")}
        pendingLabel={t("staff.deactivating")}
        onConfirm={async () => {
          if (!deactivating) return;
          await api.users.deactivate(deactivating.id);
          void queryClient.invalidateQueries({ queryKey: queryKeys.users });
          toast.success(t("staff.deactivatedToast", { name: deactivating.fullName }));
        }}
      />
    </>
  );
}

function fullNameSchema(t: Translator["t"]) {
  return z
    .string()
    .trim()
    .min(1, t("staff.form.errors.fullName"))
    .max(80, t("common.validation.maxLength", { max: 80 }));
}

function buildAddSchema(t: Translator["t"]) {
  return z.object({
    fullName: fullNameSchema(t),
    email: z.string().trim().min(1, t("staff.form.errors.email")).email(t("common.validation.emailInvalid")),
    role: z.enum(["ADMINISTRATOR", "RECEPTIONIST"]),
    temporaryPassword: z.string().refine(meetsPasswordPolicy, t("common.validation.passwordPolicy")),
  });
}
type AddValues = z.infer<ReturnType<typeof buildAddSchema>>;

function RoleOptions() {
  const { t } = useI18n();
  return (
    <>
      <option value="RECEPTIONIST">{t("labels.roles.RECEPTIONIST.label")}</option>
      <option value="ADMINISTRATOR">{t("labels.roles.ADMINISTRATOR.label")}</option>
    </>
  );
}

function AddStaffDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => buildAddSchema(t), [t]);
  const form = useForm<AddValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", role: "RECEPTIONIST", temporaryPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const [role, password] = useWatch({ control: form.control, name: ["role", "temporaryPassword"] });

  async function onSubmit(values: AddValues) {
    setError(null);
    try {
      const user = await api.users.create(values);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
      toast.success(t("staff.create.added", { name: user.fullName }), {
        description: t("staff.create.addedHint"),
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (field in values) form.setError(field as keyof AddValues, { message });
        }
      } else setError(errorMessage(err, t("staff.create.failed")));
    }
  }

  return (
    <DialogContent size="md" dismissible={!isSubmitting}>
      <DialogHeader
        icon={<UserPlus aria-hidden />}
        title={t("staff.create.title")}
        description={t("staff.create.description")}
      />
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-5">
          {error ? (
            <Alert tone="error" live>
              {error}
            </Alert>
          ) : null}
          <Field label={t("staff.form.fullName")} required id="staff-name" error={errors.fullName?.message}>
            {(c) => <Input {...c} autoComplete="off" autoFocus {...form.register("fullName")} />}
          </Field>
          <Field label={t("staff.form.email")} required id="staff-email" error={errors.email?.message}>
            {(c) => <Input {...c} type="email" autoComplete="off" {...form.register("email")} />}
          </Field>
          <Field
            label={t("staff.form.role")}
            required
            id="staff-role"
            error={errors.role?.message}
            hint={t(`labels.roles.${role}.description`)}
          >
            {(c) => (
              <Select {...c} {...form.register("role")}>
                <RoleOptions />
              </Select>
            )}
          </Field>
          <Field
            label={t("staff.form.temporaryPassword")}
            required
            id="staff-password"
            error={errors.temporaryPassword?.message}
            labelAside={
              <button
                type="button"
                className="text-link min-h-11 cursor-pointer text-sm font-semibold hover:underline md:min-h-0"
                onClick={() =>
                  form.setValue("temporaryPassword", generateTemporaryPassword(), { shouldValidate: true })
                }
              >
                {t("staff.form.generate")}
              </button>
            }
          >
            {(c) => <PasswordInput {...c} autoComplete="new-password" {...form.register("temporaryPassword")} />}
          </Field>
          <PasswordRequirements password={password} />
          <Alert tone="warning" icon={<KeyRound aria-hidden />}>
            {t("staff.form.mustChange")}
          </Alert>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            loadingText={t("staff.create.creating")}
            leftIcon={<UserPlus aria-hidden />}
          >
            {t("staff.create.submit")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function buildEditSchema(t: Translator["t"]) {
  return z.object({
    fullName: fullNameSchema(t),
    role: z.enum(["ADMINISTRATOR", "RECEPTIONIST"]),
  });
}
type EditValues = z.infer<ReturnType<typeof buildEditSchema>>;

function EditStaffDialog({
  user,
  lastAdmin,
  onClose,
}: {
  user: StaffAccount;
  lastAdmin: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const schema = useMemo(() => buildEditSchema(t), [t]);
  const form = useForm<EditValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: user.fullName, role: user.role },
  });
  const { errors, isSubmitting } = form.formState;
  const role = useWatch({ control: form.control, name: "role" });

  async function onSubmit(values: EditValues) {
    setError(null);
    try {
      await api.users.update(user.id, values);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      toast.success(t("staff.update.updated"));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "LAST_ADMINISTRATOR") form.setError("role", { message: err.message });
      else setError(errorMessage(err, t("staff.update.failed")));
    }
  }

  return (
    <DialogContent size="md" dismissible={!isSubmitting}>
      <DialogHeader icon={<Pencil aria-hidden />} title={t("staff.update.title")} description={user.email} />
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <DialogBody className="flex flex-col gap-5">
          {error ? (
            <Alert tone="error" live>
              {error}
            </Alert>
          ) : null}
          <Field label={t("staff.form.fullName")} required id="edit-staff-name" error={errors.fullName?.message}>
            {(c) => <Input {...c} autoComplete="off" autoFocus {...form.register("fullName")} />}
          </Field>
          <Field
            label={t("staff.form.role")}
            required
            id="edit-staff-role"
            error={errors.role?.message}
            hint={lastAdmin ? t("staff.update.lastAdminHint") : t(`labels.roles.${role}.description`)}
          >
            {(c) =>
              lastAdmin ? (
                <Input {...c} readOnly value={t(`labels.roles.${user.role}.label`)} />
              ) : (
                <Select {...c} {...form.register("role")}>
                  <RoleOptions />
                </Select>
              )
            }
          </Field>
          <p className="text-fg-muted flex items-start gap-2 text-sm">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("staff.update.note")}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={isSubmitting} loadingText={t("common.saving")}>
            {t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
