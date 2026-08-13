import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

export function Switch({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: ReactNode }) {
  return (
    <label
      htmlFor={props.id}
      className={cx(
        "inline-flex items-center gap-2.5 text-sm text-foreground",
        props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border bg-secondary transition-colors duration-150 has-[:checked]:border-primary has-[:checked]:bg-primary">
        <input type="checkbox" className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none" {...props} />
        <span className="pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-primary-foreground shadow-xs transition-transform duration-150 peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  );
}
