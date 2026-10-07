"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/lib/hooks";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { controlClasses } from "./input";

/**
 * Debounced search box. Remount it (change its `key`) to reset it from outside,
 * e.g. when filters are cleared.
 */
export function SearchField({
  defaultValue,
  onSearch,
  placeholder,
  label,
  className,
  autoFocus,
}: {
  defaultValue: string;
  onSearch: (value: string) => void;
  placeholder: string;
  /** Accessible label (visually hidden). */
  label: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(defaultValue);
  const debounced = useDebouncedValue(text.trim(), 300);
  const lastSent = useRef(defaultValue.trim());

  useEffect(() => {
    if (debounced !== lastSent.current) {
      lastSent.current = debounced;
      onSearch(debounced);
    }
  }, [debounced, onSearch]);

  return (
    <div className={cn("relative", className)}>
      <label className="block">
        <span className="sr-only">{label}</span>
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className={cn(controlClasses, "h-11 pr-10 pl-10 [&::-webkit-search-cancel-button]:hidden")}
        />
      </label>
      <Search
        aria-hidden
        className="text-fg-subtle pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2"
      />
      {text ? (
        <button
          type="button"
          aria-label={t("common.clearSearch")}
          onClick={() => setText("")}
          className="text-fg-muted hover:bg-tint hover:text-fg absolute top-1/2 right-1 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
