import { Slot } from "radix-ui";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "danger-soft" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary shadow-card hover:bg-primary-hover",
  secondary: "border border-line bg-surface text-fg shadow-card hover:bg-tint",
  soft: "bg-primary-soft text-primary-soft-fg hover:bg-tint-strong",
  ghost: "text-fg-muted hover:bg-tint hover:text-fg",
  danger: "bg-danger text-on-danger shadow-card hover:bg-danger-hover",
  "danger-soft": "bg-error-bg text-error-fg hover:brightness-95 dark:hover:brightness-110",
  link: "h-auto min-h-0 px-0 text-link underline-offset-4 hover:underline",
};

/** sm stays 44px tall on touch layouts and tightens to 36px from md up. */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-11 gap-1.5 px-3 text-sm md:h-9",
  md: "h-11 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-base",
};

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and announces progress. */
  loading?: boolean;
  /** Label shown while loading, e.g. "Recording payment…". */
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  asChild?: boolean;
}

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors select-none",
    "disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55",
    "[&_svg]:size-[18px] [&_svg]:shrink-0",
    SIZES[size],
    VARIANTS[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  leftIcon,
  rightIcon,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={buttonClasses(variant, size, className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-[18px]" /> : leftIcon}
      <span className={cn(variant !== "link" && "truncate")}>{loading && loadingText ? loadingText : children}</span>
      {!loading && rightIcon}
    </button>
  );
}

export interface IconButtonProps extends ComponentPropsWithRef<"button"> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  variant?: "ghost" | "secondary" | "soft";
}

export function IconButton({ label, variant = "ghost", className, children, type, ...props }: IconButtonProps) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors",
        "disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-5",
        variant === "ghost" && "text-fg-muted hover:bg-tint hover:text-fg",
        variant === "secondary" && "border-line bg-surface text-fg hover:bg-tint border",
        variant === "soft" && "bg-primary-soft text-primary-soft-fg hover:bg-tint-strong",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
