"use client";

import { Archive, ArchiveRestore, Banknote, Ellipsis, Pencil, UserRound } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import type { MemberSummary } from "@gymflow/shared/api/types";
import { formatPhone } from "@gymflow/shared/domain/phone";
import { useSession } from "@/providers/auth-provider";
import { usePaymentDrawer } from "@/features/payments/payment-drawer-provider";
import { useArchiveMember } from "./queries";
import { ArchivedBadge, StatusBadge } from "./status-badge";

/** Payment action label (design.md §11): renew if the member ever paid, otherwise first payment. */
export function paymentActionLabel(member: Pick<MemberSummary, "membership">): MessageKey {
  return member.membership.hasPaidMembership ? "members.actions.renew" : "members.actions.firstPayment";
}

/** Row actions: View Profile, Record Payment/Renew, Edit; administrator-only Archive/Reactivate. */
export function MemberActions({
  member,
  onArchiveToggle,
}: {
  member: MemberSummary;
  onArchiveToggle: (member: MemberSummary) => void;
}) {
  const { t } = useI18n();
  const { can } = useSession();
  const { openPaymentDrawer } = usePaymentDrawer();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <IconButton label={t("common.actionsFor", { name: member.fullName })} className="md:size-9">
          <Ellipsis aria-hidden />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href={`/members/${member.id}`}>
            <UserRound aria-hidden />
            {t("members.actions.view")}
          </Link>
        </DropdownMenuItem>
        {!member.isArchived ? (
          <DropdownMenuItem onSelect={() => openPaymentDrawer({ memberId: member.id })}>
            <Banknote aria-hidden />
            {t(paymentActionLabel(member))}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={`/members/${member.id}/edit`}>
            <Pencil aria-hidden />
            {t("members.actions.edit")}
          </Link>
        </DropdownMenuItem>
        {can("members.archive") ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem tone={member.isArchived ? "default" : "danger"} onSelect={() => onArchiveToggle(member)}>
              {member.isArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {member.isArchived ? t("members.actions.reactivate") : t("members.actions.archive")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Archive / reactivate confirmation (design.md §9). Administrator only. */
export function ArchiveMemberDialog({
  member,
  onOpenChange,
}: {
  member: MemberSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const mutation = useArchiveMember();
  const archiving = member ? !member.isArchived : true;

  return (
    <ConfirmDialog
      open={member !== null}
      onOpenChange={onOpenChange}
      tone={archiving ? "danger" : "primary"}
      icon={archiving ? <Archive aria-hidden /> : <ArchiveRestore aria-hidden />}
      title={archiving ? t("members.archive.title") : t("members.archive.reactivateTitle")}
      description={archiving ? t("members.archive.description") : t("members.archive.reactivateDescription")}
      confirmLabel={archiving ? t("members.actions.archive") : t("members.actions.reactivate")}
      pendingLabel={archiving ? t("members.archive.pending") : t("members.archive.reactivatePending")}
      onConfirm={async () => {
        if (!member) return;
        await mutation.mutateAsync({ id: member.id, archive: archiving });
        toast.success(
          archiving
            ? t("members.archive.archived", { name: member.fullName })
            : t("members.archive.reactivated", { name: member.fullName }),
        );
      }}
    >
      {member ? (
        <>
          <div className="bg-tint flex items-center gap-3 rounded-xl p-3">
            <Avatar name={member.fullName} photoUrl={member.photoUrl} />
            <div className="min-w-0 flex-1">
              <p className="text-fg truncate font-semibold">{member.fullName}</p>
              <p className="text-fg-muted text-sm">
                {member.memberCode} · {formatPhone(member.phone)}
              </p>
            </div>
            {member.isArchived ? <ArchivedBadge /> : <StatusBadge state={member.membership} />}
          </div>
          {archiving ? <p className="text-fg-muted text-sm">{t("members.archive.note")}</p> : null}
        </>
      ) : null}
    </ConfirmDialog>
  );
}
