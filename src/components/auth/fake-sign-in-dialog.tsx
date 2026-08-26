/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import { buildUpn, isSchoolUpn } from "@/lib/auth/upn";
import { userRoleSchema, userSchema, type UserRole } from "@/lib/schemas/user";

const NO_UPN = "Aus diesem Namen lässt sich keine gültige Schul-Adresse bilden.";
const SIGN_IN_FAILED = "Test-Anmeldung fehlgeschlagen.";

/** Lives here rather than on the card so the stub can drop it from a production bundle. */
export const FAKE_SIGN_IN_LABEL = "Anmelden (Testmodus)";

const knownUsersSchema = z.array(
  z.object({
    upn: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    role: userRoleSchema,
  }),
);
type KnownUser = z.infer<typeof knownUsersSchema>[number];

const formSchema = z.object({
  firstName: userSchema.shape.firstName,
  lastName: userSchema.shape.lastName,
  role: userRoleSchema,
});
type FormValues = z.infer<typeof formSchema>;

const ROLE_LABELS: Record<UserRole, string> = { teacher: "Lehrperson", student: "Schüler:in" };

// A native <select> rather than the design system's portalled one: this dialog never ships,
// so it is not worth the weight to render a list of UPNs.
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus-visible:ring-3";

/**
 * Stands in for the Entra ID sign-in while developing (see `resolveAuthMode`). The name and
 * role compile into the UPN the tenant would issue, the server hands back a custom token,
 * and signing in with it puts the app on the same path as a real login — so the app can be
 * tried out as several teachers and students without tenant accounts.
 */
export function FakeSignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [known, setKnown] = React.useState<KnownUser[]>([]);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const knownId = React.useId();
  const firstNameId = React.useId();
  const lastNameId = React.useId();
  const upnId = React.useId();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { firstName: "", lastName: "", role: "teacher" },
  });

  React.useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/fake")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const parsed = knownUsersSchema.safeParse(body?.users);
        if (!cancelled && parsed.success) setKnown(parsed.data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const [firstName, lastName, role] = useWatch({
    control,
    name: ["firstName", "lastName", "role"],
  });
  const derived = buildUpn(firstName, lastName, role);
  const upn = derived && isSchoolUpn(derived) ? derived : null;

  function pickKnown(pickedUpn: string) {
    const picked = known.find((entry) => entry.upn === pickedUpn);
    if (!picked) return;

    setValue("firstName", picked.firstName);
    setValue("lastName", picked.lastName);
    setValue("role", picked.role);
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    if (!upn) {
      setSubmitError(NO_UPN);
      return;
    }

    try {
      const minted = await apiRequest<{ customToken: string }>("/api/auth/fake", {
        method: "POST",
        body: values,
      });
      if (!minted) throw new ApiRequestError(SIGN_IN_FAILED);

      // The sign-in card's auth-state listener takes it from here: it trades the ID token
      // for the session cookie and navigates.
      await signInWithCustomToken(auth, minted.customToken);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiRequestError ? error.message : SIGN_IN_FAILED);
    }
  });

  return (
    <Dialog
      open={open}
      title="Test-Anmeldung"
      description="Meldet ohne Entra ID an. Nur in der Entwicklung verfügbar."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={knownId}>Bestehende Benutzer</Label>
          <select
            id={knownId}
            className={SELECT_CLASS}
            defaultValue=""
            onChange={(event) => pickKnown(event.target.value)}
          >
            <option value="">Neuer Benutzer</option>
            {known.map((entry) => (
              <option key={entry.upn} value={entry.upn}>
                {entry.upn}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={firstNameId}>Vorname</Label>
          <Input id={firstNameId} autoFocus {...register("firstName")} />
          {errors.firstName ? (
            <p className="text-destructive text-sm">{errors.firstName.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={lastNameId}>Nachname</Label>
          <Input id={lastNameId} {...register("lastName")} />
          {errors.lastName ? (
            <p className="text-destructive text-sm">{errors.lastName.message}</p>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm leading-none font-medium">Rolle</legend>
          <div className="flex gap-4 pt-1.5">
            {userRoleSchema.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input type="radio" value={option} {...register("role")} />
                {ROLE_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={upnId}>E-Mail / UPN</Label>
          {/* An <output>, not a read-only input: the tenant derives this from the name, so
              there should be nowhere to put a caret and nothing to edit it into. */}
          <output
            id={upnId}
            className="border-input bg-muted text-muted-foreground flex h-9 items-center rounded-lg border px-3 text-sm"
          >
            {upn ?? ""}
          </output>
        </div>

        {submitError ? (
          <p role="alert" className="text-destructive text-sm">
            {submitError}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Anmelden
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
