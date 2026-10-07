"use client";

import { Camera, Trash2, UserRound } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export type PhotoChange = { kind: "keep" } | { kind: "replace"; file: File } | { kind: "remove" };

/**
 * Optional member photo (design.md §10): JPEG/PNG/WebP up to 5 MB, with
 * preview, remove and upload-error states. Initials are used without a photo.
 */
export function PhotoUpload({
  currentUrl,
  change,
  onChange,
  error,
}: {
  currentUrl: string | null;
  change: PhotoChange;
  onChange: (change: PhotoChange) => void;
  error?: string | null;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [localError, setLocalError] = useState<string | null>(null);
  const previewUrl = useMemo(() => (change.kind === "replace" ? URL.createObjectURL(change.file) : null), [change]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shown = change.kind === "replace" ? previewUrl : change.kind === "remove" ? null : currentUrl;
  const message = localError ?? error ?? null;

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setLocalError(t("members.photo.type"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError(t("members.photo.size"));
      return;
    }
    setLocalError(null);
    onChange({ kind: "replace", file });
  }

  return (
    <div className="border-line-strong bg-tint/50 flex flex-col gap-4 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center">
      <div
        className={cn(
          "bg-primary-soft text-primary-soft-fg flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full",
          message && "ring-danger ring-2",
        )}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview / private photo
          <img src={shown} alt={t("members.photo.preview")} className="size-full object-cover" />
        ) : (
          <UserRound aria-hidden className="size-9" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p id={`${id}-label`} className="text-fg text-sm font-semibold">
          {t("members.photo.title")} <span className="text-fg-subtle font-normal">{t("members.photo.optional")}</span>
        </p>
        <p className="text-caption text-fg-muted mt-0.5">{t("members.photo.hint")}</p>
        {message ? (
          <p role="alert" className="text-caption text-danger mt-1.5 font-medium">
            {message}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            aria-labelledby={`${id}-label`}
            onChange={(event) => {
              onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Camera aria-hidden />}
            onClick={() => inputRef.current?.click()}
          >
            {shown ? t("members.photo.replace") : t("members.photo.upload")}
          </Button>
          {shown ? (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 aria-hidden />}
              onClick={() => {
                setLocalError(null);
                onChange(currentUrl ? { kind: "remove" } : { kind: "keep" });
              }}
            >
              {t("common.remove")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
