"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Field, Input, Select, SubmitButton } from "@/components/ui";

type StaffMember = { id: string; display_name: string | null; email: string };
type CompanyOption = { id: string; name: string };

export function AddAccountMenu({
  action,
  staffMembers,
  companies,
}: {
  action: (formData: FormData) => void | Promise<void>;
  staffMembers: StaffMember[];
  companies: CompanyOption[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button type="button" onClick={() => setOpen((v) => !v)}>
        <Plus className="h-4 w-4" /> Add account
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-card p-4 shadow-md">
          <form action={action} onSubmit={() => setOpen(false)} className="space-y-3">
            <Field label="Account name" htmlFor="add-account-name">
              <Input id="add-account-name" name="account_name" placeholder="u/..." required autoFocus />
            </Field>
            <Field label="Starting karma" htmlFor="add-account-karma">
              <Input id="add-account-karma" name="karma" type="number" min={0} defaultValue={0} />
            </Field>
            <Field label="Owner" htmlFor="add-account-owner">
              <Select id="add-account-owner" name="owner_user_id" defaultValue="" required>
                <option value="" disabled>
                  Who owns this account?
                </option>
                {staffMembers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name ?? s.email}
                  </option>
                ))}
              </Select>
            </Field>
            {companies.length > 0 && (
              <Field label="Companies" htmlFor="add-account-companies">
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {companies.map((c) => (
                    <Checkbox key={c.id} name="company_ids" value={c.id} label={c.name} />
                  ))}
                </div>
              </Field>
            )}
            <SubmitButton className="w-full" pendingText="Adding…">
              Add account
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
