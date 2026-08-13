"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { cx } from "@/lib/cx";

export function SegmentedControl({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cx(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-secondary p-1",
        className,
      )}
      {...props}
    />
  );
}

function itemClass(active?: boolean) {
  return cx(
    "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-150",
    active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
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

/**
 * Form-submit variant — for a `<button type="submit">` nested in a
 * server-action `<form>`. useFormStatus reads the nearest ancestor <form>
 * (harmlessly reports pending: false when there isn't one, e.g. the plain
 * type="button" mode-toggle usage on the login page) so this dims itself
 * while its own submission is in flight.
 */
export function SegmentedControlButton({
  active,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="tab"
      aria-selected={active}
      disabled={active || disabled || pending}
      aria-busy={pending}
      className={cx(
        itemClass(active),
        active && "cursor-default",
        pending && "opacity-50",
        className,
      )}
      {...props}
    />
  );
}
