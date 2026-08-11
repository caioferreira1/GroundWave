import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

const buttonVariants = {
  primary:
    "bg-gradient-brand text-white shadow-xs hover:shadow-glow hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
  secondary:
    "border border-border bg-surface text-ink hover:border-accent/40 hover:bg-surface-hover hover:-translate-y-px",
  ghost: "text-ink-muted hover:bg-surface-hover hover:text-ink",
  danger: "border border-critical/30 bg-critical-soft text-critical hover:bg-critical/10",
};

const buttonSizes = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-9 gap-1.5 px-3.5 text-sm",
  icon: "h-9 w-9 shrink-0 p-0",
};

/** Shared class builder so non-<button> elements (e.g. a `Link` styled as a button) can match exactly. */
export function buttonClass(
  variant: keyof typeof buttonVariants = "primary",
  size: keyof typeof buttonSizes = "md",
  className?: string,
) {
  return cx(
    "inline-flex items-center justify-center rounded-md font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}
