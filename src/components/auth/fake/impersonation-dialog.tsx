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
import { buildEmail, isSchoolEmail } from "@/lib/auth/fake/email-builder";
import { accountTypeSchema, userSchema, type AccountType } from "@/lib/schemas/user";

const NO_UPN = "Aus diesem Namen lässt sich keine gültige Schul-Adresse bilden.";
const SIGN_IN_FAILED = "Test-Anmeldung fehlgeschlagen.";
const NOT_ALLOWED = "Dafür ist eine Anmeldung als Lehrperson über Office 365 nötig.";

const knownUsersSchema = z.array(
  z.object({
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    accountType: accountTypeSchema,
  }),
);
type KnownUser = z.infer<typeof knownUsersSchema>[number];

const formSchema = z.object({
  firstName: userSchema.shape.firstName,
  lastName: userSchema.shape.lastName,
  accountType: accountTypeSchema,
});
type FormValues = z.infer<typeof formSchema>;

const ROLE_LABELS: Record<AccountType, string> = { teacher: "Lehrperson", student: "Schüler:in" };

/** Which population the picker offers. A seeded school holds seventy students and three staff. */
const POPULATIONS = [
  { value: "all", label: "Alle" },
  { value: "teacher", label: "Nur Lehrpersonen" },
  { value: "student", label: "Nur Schüler:innen" },
] as const;
type Population = (typeof POPULATIONS)[number]["value"];

function matching(users: KnownUser[], population: Population, search: string): KnownUser[] {
  const needle = search.trim().toLowerCase();

  return users.filter(
    (entry) =>
      (population === "all" || entry.accountType === population) &&
      (needle === "" ||
        `${entry.firstName} ${entry.lastName} ${entry.email}`.toLowerCase().includes(needle)),
  );
}

/**
 * Impersonation, reached only after a real Entra ID sign-in (see the route's Entra gate).
 * The name and role compile into the UPN the tenant would issue, the server hands back a
 * custom token, and signing in with it puts the app on the same path as a real login — so
 * the app can be tried as several teachers and students without tenant accounts.
 */
export function ImpersonationDialog({
  open,
  onCancel,
  onImpersonated,
}: {
  open: boolean;
  onCancel: () => void;
  onImpersonated: () => void;
}) {
  const [known, setKnown] = React.useState<KnownUser[]>([]);
  const [population, setPopulation] = React.useState<Population>("all");
  const [search, setSearch] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const knownId = React.useId();
  const searchId = React.useId();
  const populationId = React.useId();
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
    defaultValues: { firstName: "", lastName: "", accountType: "teacher" },
  });

  React.useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/fake")
      .then((response) => {
        if (response.status === 403) throw new Error(NOT_ALLOWED);
        return response.ok ? response.json() : null;
      })
      .then((body) => {
        const parsed = knownUsersSchema.safeParse(body?.users);
        if (!cancelled && parsed.success) setKnown(parsed.data);
      })
      .catch((error) => {
        if (!cancelled && error instanceof Error && error.message === NOT_ALLOWED) {
          setSubmitError(NOT_ALLOWED);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const [firstName, lastName, role] = useWatch({
    control,
    name: ["firstName", "lastName", "accountType"],
  });

  // An address is a name and a role together, so the role follows a name the school already
  // knows — otherwise typing a student's name would mint a teacher who merely shares it. Held
  // to the moment the name changes, so it is a suggestion the reader can still overrule.
  const answeredFor = React.useRef("");
  React.useEffect(() => {
    const typed = `${firstName ?? ""} ${lastName ?? ""}`.trim().toLowerCase();
    if (typed === answeredFor.current) return;
    answeredFor.current = typed;

    const bearers = known.filter(
      (entry) => `${entry.firstName} ${entry.lastName}`.toLowerCase() === typed,
    );
    if (bearers.length > 0 && !bearers.some((entry) => entry.accountType === role)) {
      setValue("accountType", bearers[0].accountType);
    }
  }, [firstName, lastName, role, known, setValue]);

  const derived = buildEmail(firstName, lastName, role);
  const upn = derived && isSchoolEmail(derived) ? derived : null;
  // Whether the name yields a school address is a separate question, and one the dialog answers
  // in words on the press — a control that refuses without saying why explains nothing.
  const named = firstName?.trim() !== "" && lastName?.trim() !== "";
  const shown = matching(known, population, search);

  function pickKnown(pickedEmail: string) {
    const picked = known.find((entry) => entry.email === pickedEmail);
    if (!picked) return;

    setValue("firstName", picked.firstName);
    setValue("lastName", picked.lastName);
    setValue("accountType", picked.accountType);
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
      onImpersonated();
    } catch (error) {
      setSubmitError(error instanceof ApiRequestError ? error.message : SIGN_IN_FAILED);
    }
  });

  return (
    <Dialog
      open={open}
      title="Test-Anmeldung"
      description="Als andere Person fortfahren, ohne deren Entra-ID-Konto zu brauchen."
      onClose={onCancel}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={searchId}>Suchen</Label>
          <Input
            id={searchId}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Wer</legend>
          <div className="flex gap-4" id={populationId}>
            {POPULATIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={populationId}
                  value={option.value}
                  checked={population === option.value}
                  onChange={() => setPopulation(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <span id={knownId} className="text-sm leading-none font-medium">
            Bestehende Benutzer:innen
          </span>
          {/* A fixed height, so narrowing the search scrolls this box rather than moving
              everything below it up and down as the reader types. */}
          <div className="border-input h-40 overflow-y-auto rounded-lg border">
            {shown.length === 0 ? (
              <p className="text-muted-foreground px-3 py-1.5 text-sm">Keine Treffer</p>
            ) : (
              <ul aria-labelledby={knownId} className="divide-y">
                {shown.map((entry) => (
                  <li key={entry.email}>
                    {/* Marked from the address the form derives, so typing a name out picks the
                        matching person in the list just as clicking one does. */}
                    <button
                      type="button"
                      aria-current={entry.email === upn ? "true" : undefined}
                      onClick={() => pickKnown(entry.email)}
                      className="hover:bg-muted aria-[current]:bg-muted w-full truncate px-3 py-1.5 text-left text-sm aria-[current]:font-medium"
                    >
                      {entry.email}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
            {accountTypeSchema.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input type="radio" value={option} {...register("accountType")} />
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

        {/* Continuing as yourself asks for nothing, so it leads. Standing in for somebody else
            needs somebody to stand in for, typed out or taken from the list. */}
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" variant="outline" disabled={!named || isSubmitting}>
            Als andere Person anmelden
          </Button>
          <Button type="button" onClick={onCancel}>
            Mich selbst anmelden
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
