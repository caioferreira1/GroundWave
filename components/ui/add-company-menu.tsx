"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Field, Input } from "./field";

export function AddCompanyMenu({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
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
        <Plus className="h-4 w-4" /> Add company
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-2 w-72 rounded-lg border border-border bg-surface p-4 shadow-md">
          <form action={action} onSubmit={() => setOpen(false)} className="space-y-3">
            <Field label="Name" htmlFor="add-company-name">
              <Input id="add-company-name" name="name" required autoFocus />
            </Field>
            <Field label="Website (optional)" htmlFor="add-company-website_url">
              <Input id="add-company-website_url" name="website_url" type="url" placeholder="https://" />
            </Field>
            <Button type="submit" className="w-full">
              Create company
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
