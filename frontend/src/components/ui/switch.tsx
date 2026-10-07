"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentPropsWithRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "bg-line-strong relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        "data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
        // 44px touch target around the 24px track.
        "before:absolute before:-inset-2.5 before:content-['']",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="shadow-card block size-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}
