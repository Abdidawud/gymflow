"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api/client";
import { useI18n } from "@/i18n/provider";
import { formatPhone } from "@gymflow/shared/domain/phone";
import { useDebouncedValue } from "@/lib/hooks";
import { queryKeys } from "@/lib/query-keys";
import { StatusBadge } from "@/features/members/status-badge";

/** Inline member search used when the payment drawer is opened globally (design.md §12, step 1). */
export function MemberPicker({ onSelect, autoFocus }: { onSelect: (memberId: string) => void; autoFocus?: boolean }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 200);
  const enabled = search.length >= 2;
  const results = useQuery({
    queryKey: queryKeys.members.lookup(search),
    queryFn: () => api.members.list({ search, pageSize: 6 }),
    enabled,
    placeholderData: keepPreviousData,
  });
  const items = enabled ? (results.data?.items ?? []) : [];

  return (
    <Command
      shouldFilter={false}
      label={t("members.lookup.pickerLabel")}
      className="border-line-strong bg-input rounded-xl border"
    >
      <div className="flex items-center gap-2.5 px-3">
        <Search aria-hidden className="text-fg-subtle size-[18px] shrink-0" />
        <Command.Input
          autoFocus={autoFocus}
          value={query}
          onValueChange={setQuery}
          placeholder={t("members.lookup.pickerPlaceholder")}
          className="text-fg placeholder:text-fg-subtle h-11 min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:outline-none"
        />
        {results.isFetching && enabled ? (
          <Spinner className="text-fg-subtle size-4" label={t("members.lookup.searching")} />
        ) : null}
      </div>
      {enabled ? (
        <Command.List className="border-line max-h-72 overflow-y-auto border-t p-1.5">
          <Command.Empty className="text-fg-muted px-3 py-6 text-center text-sm">
            {results.isPending ? t("members.lookup.searching") : t("members.lookup.pickerEmpty")}
          </Command.Empty>
          {items.map((member) => (
            <Command.Item
              key={member.id}
              value={member.id}
              onSelect={() => onSelect(member.id)}
              className="data-[selected=true]:bg-tint flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2"
            >
              <Avatar name={member.fullName} photoUrl={member.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm font-semibold">{member.fullName}</p>
                <p className="text-fg-muted truncate text-xs">
                  {member.memberCode} · {formatPhone(member.phone)}
                </p>
              </div>
              <StatusBadge state={member.membership} />
            </Command.Item>
          ))}
        </Command.List>
      ) : null}
    </Command>
  );
}
