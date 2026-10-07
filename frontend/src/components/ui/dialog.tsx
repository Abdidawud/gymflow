"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { IconButton } from "./button";

/**
 * Accessible modal dialog (Radix): traps focus, closes on Escape when allowed,
 * restores focus to its trigger and exposes an accessible title (design.md §18).
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

interface DialogContentProps extends ComponentPropsWithRef<typeof DialogPrimitive.Content> {
  size?: keyof typeof SIZES;
  /** Prevent closing (Escape/outside click/close button) while an action is in progress. */
  dismissible?: boolean;
  hideClose?: boolean;
}

export function DialogContent({
  size = "md",
  dismissible = true,
  hideClose = false,
  className,
  children,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: DialogContentProps) {
  const { t } = useI18n();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-50 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
          "border-line bg-surface text-fg shadow-overlay overflow-hidden rounded-xl border focus:outline-none",
          "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          SIZES[size],
          className,
        )}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (!dismissible) event.preventDefault();
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (!dismissible) event.preventDefault();
          onInteractOutside?.(event);
        }}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close asChild>
            <IconButton label={t("common.close")} className="absolute top-3 right-3" disabled={!dismissible}>
              <X aria-hidden />
            </IconButton>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  icon,
  iconTone = "primary",
  title,
  description,
  eyebrow,
  className,
}: {
  icon?: ReactNode;
  iconTone?: "primary" | "danger" | "warning";
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-4 px-6 pt-6 pr-14", className)}>
      {icon ? (
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[22px]",
            iconTone === "primary" && "bg-primary-soft text-primary-soft-fg",
            iconTone === "danger" && "bg-error-bg text-error-fg",
            iconTone === "warning" && "bg-warning-bg text-warning-fg",
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-caption text-fg-muted mb-1 font-semibold tracking-wider uppercase">{eyebrow}</p>
        ) : null}
        <DialogPrimitive.Title className="text-fg text-xl leading-7 font-semibold tracking-[-0.01em]">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="text-fg-muted mt-1 text-sm">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
      </div>
    </div>
  );
}

export function DialogBody({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("flex-1 scrollbar-thin overflow-y-auto px-6 py-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        "border-line bg-tint/60 flex flex-col-reverse gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Sheet: right-side drawer on desktop, full-screen dialog on mobile (design.md §12).
// ---------------------------------------------------------------------------

export const Sheet = DialogPrimitive.Root;

export function SheetContent({
  dismissible = true,
  className,
  children,
  side = "right",
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: Omit<DialogContentProps, "size" | "hideClose"> & { side?: "right" | "left" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-50" />
      <DialogPrimitive.Content
        className={cn(
          "bg-surface text-fg shadow-overlay fixed inset-y-0 z-50 flex w-full flex-col focus:outline-none",
          side === "right"
            ? "md:w-drawer md:border-line data-[state=closed]:animate-slide-out-right data-[state=open]:animate-slide-in-right right-0 md:border-l"
            : "border-line data-[state=closed]:animate-slide-out-left data-[state=open]:animate-slide-in-left left-0 max-w-[300px] border-r",
          className,
        )}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (!dismissible) event.preventDefault();
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (!dismissible) event.preventDefault();
          onInteractOutside?.(event);
        }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
