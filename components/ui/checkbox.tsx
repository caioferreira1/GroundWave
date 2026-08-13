import type { InputHTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "@/lib/cx";

export function Checkbox({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: ReactNode }) {
  return (
    <label
      htmlFor={props.id}
      className={cx(
        "inline-flex items-center gap-2 text-sm text-foreground",
        props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-secondary transition-colors duration-150 has-[:checked]:border-primary has-[:checked]:bg-primary">
        <input type="checkbox" className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none" {...props} />
        <Check
          className="pointer-events-none h-3 w-3 scale-0 text-primary-foreground transition-transform duration-150 peer-checked:scale-100"
          strokeWidth={3}
        />
      </span>
      {label}
    </label>
  );
}
