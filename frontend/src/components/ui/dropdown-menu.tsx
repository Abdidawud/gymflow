"use client";

import { DropdownMenu as Menu } from "radix-ui";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: ComponentPropsWithRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "border-line bg-surface text-fg shadow-popover z-50 min-w-52 overflow-hidden rounded-xl border p-1.5",
          "data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone = "default",
  ...props
}: ComponentPropsWithRef<typeof Menu.Item> & { tone?: "default" | "danger" }) {
  return (
    <Menu.Item
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm font-medium outline-none select-none md:min-h-10",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
        tone === "default" && "text-fg data-[highlighted]:bg-tint [&_svg]:text-fg-muted",
        tone === "danger" && "text-danger data-[highlighted]:bg-error-bg data-[highlighted]:text-error-fg",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentPropsWithRef<typeof Menu.Label>) {
  return <Menu.Label className={cn("text-caption text-fg-muted px-3 py-2", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentPropsWithRef<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("bg-line -mx-1.5 my-1.5 h-px", className)} {...props} />;
}
