import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes } from "react";

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const buttonVariants = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary: "border border-border bg-surface text-ink hover:bg-surface-muted",
  ghost: "text-ink-muted hover:text-ink underline underline-offset-2",
  danger: "border border-critical/30 bg-critical-soft text-critical hover:bg-critical/10",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cx("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-lg border border-border bg-surface", className)}
      {...props}
    />
  );
}

const badgeVariants = {
  neutral: "bg-surface-muted text-ink-muted",
  accent: "bg-accent-soft text-accent-strong",
  good: "bg-good-soft text-good",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
};

export function Badge({
  variant = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof badgeVariants }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function PageHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold tracking-tight text-ink text-balance">{title}</h1>
      {description && <p className="text-sm text-ink-muted">{description}</p>}
    </div>
  );
}
