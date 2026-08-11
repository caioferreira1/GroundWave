import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cx } from "@/lib/cx";

export function SegmentedControl({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cx(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-muted p-1",
        className,
      )}
      {...props}
    />
  );
}

function itemClass(active?: boolean) {
  return cx(
    "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-150",
    active ? "bg-surface text-ink shadow-xs" : "text-ink-muted hover:text-ink",
  );
}

/** Query-string / route navigation variant — for server-rendered filter links. */
export function SegmentedControlLink({
  active,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; active?: boolean }) {
  return (
    <Link role="tab" aria-selected={active} className={cx(itemClass(active), className)} {...props} />
  );
}

/** Form-submit variant — for a `<button type="submit">` nested in a server-action `<form>`. */
export function SegmentedControlButton({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="submit"
      role="tab"
      aria-selected={active}
      disabled={active}
      className={cx(itemClass(active), active && "cursor-default", className)}
      {...props}
    />
  );
}
