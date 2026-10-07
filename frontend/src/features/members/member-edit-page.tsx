"use client";

import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { LoadError, StatusScreen } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/provider";
import { isApiError } from "@/lib/api/errors";
import { MemberForm } from "./member-form";
import { useMember } from "./queries";

export function MemberEditPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const member = useMember(id);

  if (member.isPending) {
    return (
      <div role="status" aria-live="polite" className="flex max-w-5xl flex-col gap-6">
        <span className="sr-only">{t("members.profile.loading")}</span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-[480px] rounded-xl" />
      </div>
    );
  }
  if (member.isError) {
    if (isApiError(member.error, "NOT_FOUND")) {
      return <StatusScreen kind="not-found" backHref="/members" backLabel={t("members.list.backToList")} />;
    }
    return (
      <Card>
        <LoadError onRetry={() => void member.refetch()} />
      </Card>
    );
  }
  return <MemberForm key={member.data.id} member={member.data} />;
}
