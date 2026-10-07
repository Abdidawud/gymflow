"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/i18n/provider";

/**
 * Stay / Discard Changes confirmation when leaving a form with unsaved edits
 * (design.md §20). Covers in-app links, explicit Cancel buttons and closing
 * or reloading the tab.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const { t } = useI18n();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const bypass = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypass.current) return;
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (bypass.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  /** Navigate, asking first when there are unsaved changes. */
  const leave = useCallback(
    (href: string) => {
      if (dirty && !bypass.current) setPendingHref(href);
      else router.push(href);
    },
    [dirty, router],
  );

  /** Navigate after a successful save without prompting. */
  const leaveWithoutPrompt = useCallback(
    (href: string) => {
      bypass.current = true;
      router.push(href);
    },
    [router],
  );

  const dialog = (
    <ConfirmDialog
      open={pendingHref !== null}
      onOpenChange={(open) => !open && setPendingHref(null)}
      title={t("common.unsaved.title")}
      description={t("common.unsaved.description")}
      cancelLabel={t("common.stay")}
      confirmLabel={t("common.discardChanges")}
      onConfirm={() => {
        const href = pendingHref;
        bypass.current = true;
        setPendingHref(null);
        if (href) router.push(href);
      }}
    />
  );

  return { dialog, leave, leaveWithoutPrompt };
}
