import { cx } from "@/lib/cx";

const avatarSizes = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
};

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof avatarSizes;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "bg-gradient-brand inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-xs",
        avatarSizes[size],
        className,
      )}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
