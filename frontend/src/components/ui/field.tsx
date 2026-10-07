"use client";

import { CircleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
}

export interface FieldProps {
  label: ReactNode;
  /** Shows a required marker; the control should also be validated. */
  required?: boolean;
  /** Shows an "Optional" tag next to the label. */
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  /** Extra content aligned to the right of the label (e.g. "Regenerate"). */
  labelAside?: ReactNode;
  className?: string;
  /** Override the generated id (e.g. to match a react-hook-form field name). */
  id?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + control + hint/error with correct id/aria wiring (design.md §3:
 * associated input labels, errors below the field).
 */
export function Field({ label, required, optional, hint, error, labelAside, className, id, children }: FieldProps) {
  const { t } = useI18n();
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={controlId} className="text-fg text-sm font-semibold">
          {label}
          {required ? (
            <span aria-hidden className="text-danger ml-0.5">
              *
            </span>
          ) : null}
        </label>
        {optional && !labelAside ? (
          <span className="text-caption text-fg-subtle">{t("common.optional")}</span>
        ) : (
          labelAside
        )}
      </div>
      {children({
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-caption text-danger flex items-start gap-1.5 font-medium">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Section of a long form with a heading and description. */
export function FormSection({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-5", className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="bg-primary-soft text-primary-soft-fg mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5">
            {icon}
          </span>
        ) : null}
        <div>
          <h2 id={headingId} className="text-fg text-base font-semibold">
            {title}
          </h2>
          {description ? <p className="text-fg-muted mt-0.5 text-sm">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
