"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { CornerDownLeft, Search, UserRoundSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api/client";
import { useI18n } from "@/i18n/provider";
import { formatPhone } from "@/lib/domain/phone";
import { useDebouncedValue } from "@/lib/hooks";
import { queryKeys } from "@/lib/query-keys";
import { StatusBadge } from "./status-badge";

/**
 * Global member lookup (design.md §4): search by name, phone or member ID;
 * each result shows name, ID, phone and status; selecting opens the profile.
 * Opens with Ctrl/⌘ K or "/" from anywhere in the app.
 */
export function MemberLookup({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 200);
  const enabled = search.length >= 2;

  const results = useQuery({
    queryKey: queryKeys.members.lookup(search),
    queryFn: () => api.members.list({ search, pageSize: 8 }),
    enabled: open && enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(true);
      } else if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setQuery("");
  }

  function openProfile(id: string) {
    close(false);
    router.push(`/members/${id}`);
  }

  const items = enabled ? (results.data?.items ?? []) : [];
  const total = enabled ? (results.data?.total ?? 0) : 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={close}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="bg-surface text-fg shadow-overlay data-[state=open]:animate-pop-in md:border-line fixed inset-0 z-50 flex flex-col overflow-hidden focus:outline-none md:inset-auto md:top-[12vh] md:left-1/2 md:max-h-[70vh] md:w-[min(640px,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-xl md:border"
        >
          <DialogPrimitive.Title className="sr-only">{t("members.lookup.title")}</DialogPrimitive.Title>
          <Command shouldFilter={false} loop label={t("members.lookup.title")} className="flex min-h-0 flex-1 flex-col">
            <div className="border-line flex items-center gap-3 border-b px-4">
              <Search aria-hidden className="text-fg-subtle size-5 shrink-0" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t("shell.searchPlaceholder")}
                className="text-fg placeholder:text-fg-subtle h-14 min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:outline-none"
              />
              {results.isFetching && enabled ? (
                <Spinner className="text-fg-subtle size-4" label={t("members.lookup.searching")} />
              ) : null}
              <DialogPrimitive.Close className="text-fg-muted hover:text-fg md:border-line min-h-11 cursor-pointer rounded-md px-2 text-sm font-medium md:min-h-0 md:border md:px-1.5 md:py-0.5 md:text-xs">
                <span className="md:hidden">{t("members.lookup.cancel")}</span>
                <span className="hidden md:inline">{t("members.lookup.esc")}</span>
              </DialogPrimitive.Close>
            </div>

            <Command.List className="min-h-0 flex-1 scrollbar-thin overflow-y-auto p-2 md:max-h-[50vh]">
              {!enabled ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <UserRoundSearch aria-hidden className="text-fg-subtle size-8" />
                  <p className="text-fg mt-3 text-sm font-medium">{t("members.lookup.hintTitle")}</p>
                  <p className="text-fg-muted mt-1 text-sm">{t("members.lookup.hint")}</p>
                </div>
              ) : results.isError ? (
                <p className="text-fg-muted px-4 py-10 text-center text-sm">{t("members.lookup.error")}</p>
              ) : (
                <>
                  <Command.Empty className="px-4 py-10 text-center">
                    {results.isPending ? (
                      <span className="text-fg-muted text-sm">{t("members.lookup.searching")}</span>
                    ) : (
                      <>
                        <p className="text-fg text-sm font-semibold">{t("members.list.noneTitle")}</p>
                        <p className="text-fg-muted mt-1 text-sm">{t("members.list.noneText")}</p>
                      </>
                    )}
                  </Command.Empty>
                  {items.length > 0 ? (
                    <Command.Group
                      heading={
                        total > items.length
                          ? t("members.lookup.topMatches", { shown: items.length, total })
                          : t("members.lookup.group")
                      }
                      className="[&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase"
                    >
                      {items.map((member) => (
                        <Command.Item
                          key={member.id}
                          value={member.id}
                          onSelect={() => openProfile(member.id)}
                          className="data-[selected=true]:bg-tint flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-3 py-2"
                        >
                          <Avatar name={member.fullName} photoUrl={member.photoUrl} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-fg truncate text-sm font-semibold">{member.fullName}</p>
                            <p className="text-fg-muted truncate text-xs">
                              <span className="font-mono">{member.memberCode}</span> · {formatPhone(member.phone)}
                            </p>
                          </div>
                          <StatusBadge state={member.membership} />
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                </>
              )}
            </Command.List>

            <div className="border-line bg-tint/60 text-fg-muted hidden items-center gap-4 border-t px-4 py-2.5 text-xs md:flex">
              <span>
                <kbd className="font-sans font-semibold">↑ ↓</kbd> {t("members.lookup.move")}
              </span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft aria-hidden className="size-3.5" /> {t("members.lookup.open")}
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
