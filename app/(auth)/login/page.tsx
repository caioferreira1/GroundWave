"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Logo } from "@/components/logo";
import { Button, Card, Field, Input, SegmentedControl, SegmentedControlButton } from "@/components/ui";
import { signIn, signUp, type AuthActionState } from "./actions";

const initialState: AuthActionState = { error: null };

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState);

  const action = mode === "signin" ? signInAction : signUpAction;
  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signInPending : signUpPending;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4">
      <div
        className="animate-drift pointer-events-none absolute inset-x-0 top-0 h-[36rem] opacity-90"
        style={{
          background:
            "radial-gradient(ellipse at top, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%), radial-gradient(ellipse 40rem 24rem at 80% -10%, color-mix(in srgb, var(--accent-2) 18%, transparent), transparent 65%)",
        }}
        aria-hidden="true"
      />

      <div className="animate-fade-in-up relative w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size={26} />
        </div>

        <Card className="rounded-xl p-6 shadow-md">
          <div className="mb-5 flex justify-center">
            <SegmentedControl>
              <SegmentedControlButton type="button" active={mode === "signin"} onClick={() => setMode("signin")}>
                Sign in
              </SegmentedControlButton>
              <SegmentedControlButton type="button" active={mode === "signup"} onClick={() => setMode("signup")}>
                Sign up
              </SegmentedControlButton>
            </SegmentedControl>
          </div>

          <p className="mb-6 text-center text-sm text-ink-muted">
            {mode === "signin"
              ? "Staff and client access to Reddit monitoring and content generation."
              : "New accounts start pending until an admin approves them."}
          </p>

          <form action={action} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </Field>

            {state.error && (
              <div className="flex items-start gap-2 rounded-md bg-critical-soft px-3 py-2 text-sm text-critical">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Sign up"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
