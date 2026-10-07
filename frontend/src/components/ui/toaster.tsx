"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/lib/theme";

/** Success/error toasts, announced politely to assistive technology (design.md §18). */
export function Toaster() {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      className="print:hidden"
      position="bottom-right"
      closeButton
      duration={5000}
      icons={{
        success: <CircleCheck className="text-success-fg size-5" aria-hidden />,
        error: <CircleAlert className="text-danger size-5" aria-hidden />,
        warning: <TriangleAlert className="text-warning-fg size-5" aria-hidden />,
        info: <Info className="text-primary size-5" aria-hidden />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-line !bg-surface !text-fg !shadow-popover !font-sans !gap-3 !items-start !py-3.5",
          title: "!text-sm !font-semibold",
          description: "!text-sm !text-fg-muted",
          closeButton: "!bg-surface !border-line !text-fg-muted",
          actionButton: "!bg-primary !text-on-primary !font-semibold",
        },
      }}
    />
  );
}
