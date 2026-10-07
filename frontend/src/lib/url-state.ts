"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * List filters, sorting and paging live in the URL so they survive opening a
 * record and coming back (design.md §9), and can be bookmarked or shared.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const values = useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const value = params.get(key as string);
      if (value !== null) result[key] = value as T[keyof T];
    }
    return result;
  }, [params, defaults]);

  const update = useCallback(
    (patch: Partial<T>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "" || value === defaults[key]) next.delete(key);
        else next.set(key, value as string);
      }
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
      rememberListUrl(pathname, url);
    },
    [params, defaults, pathname, router],
  );

  return [values, update] as const;
}

const LIST_URL_KEY = "gymflow:list-url:";

function rememberListUrl(pathname: string, url: string) {
  try {
    window.sessionStorage.setItem(LIST_URL_KEY + pathname, url);
  } catch {
    // Storage unavailable: the plain list URL is used instead.
  }
}

/** Last filtered URL of a list page, for "back to list" breadcrumbs. */
export function listReturnUrl(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  try {
    return window.sessionStorage.getItem(LIST_URL_KEY + pathname) ?? pathname;
  } catch {
    return pathname;
  }
}

export function toInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
