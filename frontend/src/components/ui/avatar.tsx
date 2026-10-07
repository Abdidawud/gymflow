import { cn, initials } from "@/lib/utils";

const SIZES = {
  sm: "size-9 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
} as const;

/** Soft palette for initials, chosen deterministically from the name. */
const PALETTE = [
  "bg-[#e0e7ff] text-[#3730a3] dark:bg-[#312e81] dark:text-[#c7d2fe]",
  "bg-[#dbeafe] text-[#1e40af] dark:bg-[#1e3a8a] dark:text-[#bfdbfe]",
  "bg-[#fae8ff] text-[#86198f] dark:bg-[#701a75] dark:text-[#f5d0fe]",
  "bg-[#ccfbf1] text-[#115e59] dark:bg-[#134e4a] dark:text-[#99f6e4]",
  "bg-[#ffedd5] text-[#9a3412] dark:bg-[#7c2d12] dark:text-[#fed7aa]",
  "bg-[#e2e8f0] text-[#334155] dark:bg-[#334155] dark:text-[#e2e8f0]",
];

function paletteFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Member/staff avatar: photo when available, otherwise initials (design.md §10). */
export function Avatar({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private, authorized member photos are not optimizable assets
      <img
        src={photoUrl}
        alt=""
        className={cn("ring-line shrink-0 rounded-full object-cover ring-1", SIZES[size], className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide select-none",
        SIZES[size],
        paletteFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
