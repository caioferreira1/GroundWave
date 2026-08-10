"use client";

import { useActionState, useState } from "react";
import { Logo } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";
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
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size={26} />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="mb-1 text-lg font-semibold tracking-tight text-ink">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="mb-6 text-sm text-ink-muted">
            {mode === "signin"
              ? "Staff and client access to Reddit monitoring and content generation."
              : "New accounts start pending until an admin approves them."}
          </p>

          <form action={action} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>

            {state.error && <p className="text-sm text-critical">{state.error}</p>}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
