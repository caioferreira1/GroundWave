"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./button";

type Variant = Parameters<typeof buttonClass>[0];
type Size = Parameters<typeof buttonClass>[1];

/**
 * Submit button for a Server Action `<form>`. Reads pending state from the
 * nearest ancestor <form> via useFormStatus, so it must render inside one —
 * shows a spinner and disables itself for the duration of the action instead
 * of leaving the click with no visible feedback.
 */
export function SubmitButton({
  variant = "primary",
  size = "md",
  className,
  pendingText,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={buttonClass(variant, size, className)}
      disabled={disabled || pending}
      aria-busy={pending}
      {...props}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {pending ? (size === "icon" ? null : (pendingText ?? children)) : children}
    </button>
  );
}
