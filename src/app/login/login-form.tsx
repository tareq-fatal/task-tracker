"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <LogIn className="mr-1 h-4 w-4" />
      {pending ? "…" : "Anmelden / Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Benutzername / Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          placeholder="admin"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Passwort / Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>
      {state.error && (
        <p className="text-sm font-medium text-destructive">
          Benutzername oder Passwort falsch · Invalid username or password
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
