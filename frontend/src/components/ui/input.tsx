"use client";

import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const controlClasses = cn(
  "w-full rounded-lg border border-line-strong bg-input text-base text-fg shadow-[0_1px_0_0_rgb(15_23_42/0.02)] transition-colors",
  "placeholder:text-fg-subtle hover:border-fg-subtle",
  "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/25",
  "disabled:cursor-not-allowed disabled:bg-tint disabled:text-fg-muted disabled:opacity-80",
  "[&[readonly]]:bg-tint [&[readonly]]:focus-visible:border-line-strong",
  "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/25",
);

export interface InputProps extends ComponentPropsWithRef<"input"> {
  leftIcon?: ReactNode;
  /** Content inside the right edge, e.g. a unit ("ETB", "days"). */
  suffix?: ReactNode;
  containerClassName?: string;
}

export function Input({ leftIcon, suffix, className, containerClassName, ...props }: InputProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      {leftIcon ? (
        <span className="text-fg-subtle pointer-events-none absolute inset-y-0 left-3 flex items-center [&_svg]:size-[18px]">
          {leftIcon}
        </span>
      ) : null}
      <input
        className={cn(controlClasses, "h-11 px-3", leftIcon && "pl-10", suffix && "pr-14", className)}
        {...props}
      />
      {suffix ? (
        <span className="text-fg-muted pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold tracking-wide uppercase">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function PasswordInput({ className, ...props }: Omit<InputProps, "type" | "suffix">) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}
        aria-pressed={visible}
        className="text-fg-muted hover:text-fg absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-lg [&_svg]:size-5"
      >
        {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </button>
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea className={cn(controlClasses, "min-h-24 px-3 py-2.5", className)} {...props} />;
}

export interface SelectProps extends ComponentPropsWithRef<"select"> {
  leftIcon?: ReactNode;
  containerClassName?: string;
}

/** Native select: keyboard, screen-reader and mobile friendly by default. */
export function Select({ className, containerClassName, leftIcon, children, ...props }: SelectProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      {leftIcon ? (
        <span className="text-fg-subtle pointer-events-none absolute inset-y-0 left-3 flex items-center [&_svg]:size-[18px]">
          {leftIcon}
        </span>
      ) : null}
      <select
        className={cn(
          controlClasses,
          "h-11 cursor-pointer appearance-none pr-10 pl-3 text-sm md:text-[15px]",
          leftIcon && "pl-10",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-fg-muted pointer-events-none absolute top-1/2 right-3 size-[18px] -translate-y-1/2"
      />
    </div>
  );
}

export function Checkbox({ className, ...props }: Omit<ComponentPropsWithRef<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "border-line-strong size-5 shrink-0 cursor-pointer rounded accent-[var(--gf-primary)] disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}
