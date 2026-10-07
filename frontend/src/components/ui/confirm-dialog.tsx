"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/provider";
import { errorMessage } from "@/lib/api/errors";
import { Button } from "./button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "./dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  icon?: ReactNode;
  /** May return a promise; the dialog stays open and shows progress until it settles. */
  onConfirm: () => unknown | Promise<unknown>;
}

/** Confirmation for consequential actions (archive, disable, deactivate, discard). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  tone = "danger",
  icon,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, t("common.feedback.generic")));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm" dismissible={!pending} role="alertdialog">
        <DialogHeader
          icon={icon ?? (tone === "danger" ? <TriangleAlert aria-hidden /> : <CircleAlert aria-hidden />)}
          iconTone={tone === "danger" ? "danger" : "primary"}
          title={title}
          description={description}
        />
        {children || error ? (
          <DialogBody className="flex flex-col gap-4 pt-4">
            {children}
            {error ? (
              <p role="alert" className="bg-error-bg text-error-fg rounded-lg px-3 py-2 text-sm font-medium">
                {error}
              </p>
            ) : null}
          </DialogBody>
        ) : (
          <div className="h-5" />
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            loading={pending}
            loadingText={pendingLabel}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
