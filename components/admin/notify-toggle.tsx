"use client";

import { useRef } from "react";
import { Switch } from "@/components/ui";

/**
 * Self-submitting Switch — the underlying action is a Server Action bound to
 * one user, so a plain <form action> already works without an extra "Save"
 * button per row; this just triggers that submit on toggle instead of
 * requiring a separate click. Unchecked checkboxes are omitted from
 * FormData entirely (native browser behavior), so the action on the other
 * end reads `formData.get("enabled") === "on"`, same pattern as
 * accounts/actions.ts's `is_active`.
 */
export function NotifyToggle({
  defaultChecked,
  action,
}: {
  defaultChecked: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <Switch name="enabled" defaultChecked={defaultChecked} onChange={() => formRef.current?.requestSubmit()} />
    </form>
  );
}
