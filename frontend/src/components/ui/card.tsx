import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Surface tier 1: white card, 1px border, 12px radius, ambient shadow. */
export function Card({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("border-line bg-surface shadow-card rounded-xl border", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
  titleAs: Title = "h2",
  titleId,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  titleAs?: "h2" | "h3";
  titleId?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-6 sm:pt-6", className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="bg-primary-soft text-primary-soft-fg mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <Title id={titleId} className="text-fg text-lg leading-7 font-semibold tracking-[-0.01em]">
            {title}
          </Title>
          {description ? <p className="text-fg-muted mt-0.5 text-sm">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("border-line flex flex-wrap items-center justify-end gap-3 border-t px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}

/** Label/value pair used in detail cards. */
export function DetailItem({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className="text-fg mt-1 text-[15px] font-medium break-words">{children}</dd>
    </div>
  );
}
