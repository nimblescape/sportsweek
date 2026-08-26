/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import {
  FOOD_OPTION_OTHER,
  FOOD_OPTION_OTHER_LABEL,
  type Program,
} from "@/lib/schemas/master-data";
import {
  studentMasterDataInputSchema,
  type StudentMasterData,
  type StudentMasterDataInput,
} from "@/lib/schemas/student-master-data";
import {
  EMPTY_REGISTRATION,
  scopeRentalToProgram,
  toRegistrationInput,
} from "@/lib/student-master-data/registration";
import { missingAnswers } from "@/lib/student-master-data/completeness";
import { EquipmentChecklist } from "./equipment-checklist";
import { Field, RadioField, ReadOnlyField, SelectField, YES_NO } from "./fields";

export type MasterDataLists = {
  classes: readonly string[];
  programs: readonly Program[];
  skillLevels: readonly string[];
  busPickupPoints: readonly string[];
  foodOptions: readonly string[];
  seasonPassOptions: readonly string[];
};

type StudentMasterDataFormProps = {
  seasonName: string;
  /** From the user record, shown but not editable as part of this master data (US-11). */
  studentName: string;
  record: StudentMasterData | null;
  lists: MasterDataLists;
};

const GENDERS = [
  { value: "male", label: "Männlich" },
  { value: "female", label: "Weiblich" },
] as const;

const RELATIONSHIPS = [
  { value: "mother", label: "Mutter" },
  { value: "father", label: "Vater" },
  { value: "other", label: "Sonstiges" },
] as const;

const MISSING_ANSWER = "Pflichtfeld.";

/**
 * Empty means "not answered", which is a different thing from the empty string a text input
 * gives back. Both see the stored value too, which is already null or a number by then.
 */
function orNull(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : Number(text);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

/**
 * The student's registration for the active season (US-11).
 *
 * Answering "no" hides everything but the class rather than clearing it: the fields stay
 * registered, so the values come back untouched if the student changes their mind, and a save
 * carries them along. Every list value is stored as the plain text that was picked, never as a
 * reference, so a teacher renaming an entry later leaves this record exactly as it was.
 */
export function StudentMasterDataForm({
  seasonName,
  studentName,
  record,
  lists,
}: StudentMasterDataFormProps) {
  const [saved, setSaved] = React.useState(false);
  const [saveAttempted, setSaveAttempted] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const equipmentOf = React.useCallback(
    (programName: string | null) =>
      lists.programs.find((candidate) => candidate.name === programName)?.requiredEquipment ?? [],
    [lists.programs],
  );

  /**
   * Validates what will actually be sent rather than what is in the form: a student who switches
   * to a program requiring nothing still has yesterday's rental answers in state, and reporting
   * them as missing measurements would point at fields that are no longer even on screen.
   */
  const resolver: Resolver<StudentMasterDataInput> = React.useCallback(
    (values, context, options) =>
      zodResolver(studentMasterDataInputSchema)(
        scopeRentalToProgram(values, equipmentOf(values.program)),
        context,
        options,
      ),
    [equipmentOf],
  );

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    reset,
  } = useForm<StudentMasterDataInput>({
    // Checked as the student answers, so a malformed phone number is marked where it was typed
    // rather than held back until they try to save.
    mode: "onChange",
    resolver,
    defaultValues: record ? toRegistrationInput(record) : EMPTY_REGISTRATION,
  });

  const values = useWatch({ control });
  const [isAttending, programName, needsRental, foodOption, relationship] = [
    values.isAttendingSportsWeek,
    values.program ?? null,
    values.equipmentRentalNeeded,
    values.foodOption,
    values.emergencyContact?.relationship,
  ];

  const equipment = equipmentOf(programName);
  // Told, not enforced: a registration is filled in over time and saved as often as the student
  // likes, so what is left to answer is a note to them rather than a locked button (US-11).
  const missing = missingAnswers(scopeRentalToProgram(values as StudentMasterDataInput, equipment));
  const missingPaths = new Set(missing.map((answer) => answer.path));

  /**
   * The mark under a field that has not been answered yet. Held back until the first save, so a
   * form the student has only just opened is not already covered in red — and derived from the
   * answers rather than set on the fields, so it clears itself as they are filled in.
   */
  function hint(path: string): string | undefined {
    return saveAttempted && missingPaths.has(path) ? MISSING_ANSWER : undefined;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setSaved(false);
    setSaveAttempted(true);
    try {
      // The resolver already scoped these, so what arrives here is what the server is told.
      await apiRequest("/api/my-master-data", { method: "PUT", body: values });
      reset(values);
      setSaved(true);
    } catch (error) {
      setSubmitError(
        error instanceof ApiRequestError ? error.message : "Das hat leider nicht geklappt.",
      );
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Section title="Anmeldung">
        <ReadOnlyField label="Saison" value={seasonName} />
        <ReadOnlyField label="Name" value={studentName} />
        <SelectField
          control={control}
          name="class"
          label="Klasse"
          options={lists.classes}
          placeholder="Klasse wählen"
          error={errors.class?.message ?? hint("class")}
        />
        <RadioField
          control={control}
          name="isAttendingSportsWeek"
          label="Nimmst du an der Sportwoche teil?"
          options={YES_NO}
        />
      </Section>

      {isAttending ? (
        <>
          <Section title="Persönliches">
            <Field label="Geburtsdatum" error={errors.dateOfBirth?.message ?? hint("dateOfBirth")}>
              {(id) => (
                <Input id={id} type="date" {...register("dateOfBirth", { setValueAs: orNull })} />
              )}
            </Field>
            <RadioField
              control={control}
              name="gender"
              label="Geschlecht"
              options={GENDERS}
              error={errors.gender?.message ?? hint("gender")}
            />
            <Field label="Telefonnummer" error={errors.phoneNumber?.message ?? hint("phoneNumber")}>
              {(id) => (
                <Input
                  id={id}
                  inputMode="tel"
                  placeholder="+43 660 1234567"
                  {...register("phoneNumber", { setValueAs: orNull })}
                />
              )}
            </Field>
          </Section>

          <Section title="Notfallkontakt">
            <Field
              label="Vorname"
              error={
                errors.emergencyContact?.firstName?.message ?? hint("emergencyContact.firstName")
              }
            >
              {(id) => (
                <Input
                  id={id}
                  {...register("emergencyContact.firstName", { setValueAs: orNull })}
                />
              )}
            </Field>
            <Field
              label="Nachname"
              error={
                errors.emergencyContact?.lastName?.message ?? hint("emergencyContact.lastName")
              }
            >
              {(id) => (
                <Input id={id} {...register("emergencyContact.lastName", { setValueAs: orNull })} />
              )}
            </Field>
            <RadioField
              control={control}
              name="emergencyContact.relationship"
              label="Beziehung"
              options={RELATIONSHIPS}
              error={
                errors.emergencyContact?.relationship?.message ??
                hint("emergencyContact.relationship")
              }
            />
            {relationship === "other" ? (
              <Field
                label="Welche Beziehung?"
                error={
                  errors.emergencyContact?.relationshipOtherText?.message ??
                  hint("emergencyContact.relationshipOtherText")
                }
              >
                {(id) => (
                  <Input
                    id={id}
                    {...register("emergencyContact.relationshipOtherText", { setValueAs: orNull })}
                  />
                )}
              </Field>
            ) : null}
            <Field
              label="Telefonnummer des Notfallkontakts"
              error={
                errors.emergencyContact?.phoneNumber?.message ??
                hint("emergencyContact.phoneNumber")
              }
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="tel"
                  placeholder="+43 660 1234567"
                  {...register("emergencyContact.phoneNumber", { setValueAs: orNull })}
                />
              )}
            </Field>
          </Section>

          <Section title="Programm">
            <SelectField
              control={control}
              name="program"
              label="Für welches Programm meldest du dich an?"
              options={lists.programs.map((entry) => entry.name)}
              placeholder="Programm wählen"
              error={errors.program?.message ?? hint("program")}
            />
            {equipment.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                  <span className="text-sm leading-none font-medium">Benötigte Ausrüstung</span>
                  <RadioField
                    control={control}
                    name="equipmentRentalNeeded"
                    label="Musst du etwas ausleihen?"
                    options={YES_NO}
                    error={errors.equipmentRentalNeeded?.message ?? hint("equipmentRentalNeeded")}
                    inline
                  />
                </div>
                <Controller
                  control={control}
                  name="rentedEquipment"
                  render={({ field }) => (
                    <EquipmentChecklist
                      items={equipment}
                      selectable={needsRental === true}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      error={errors.rentedEquipment?.message ?? hint("rentedEquipment")}
                    />
                  )}
                />
              </div>
            ) : null}
            {equipment.length > 0 && needsRental === true ? (
              <>
                <Field label="Schuhgröße" error={errors.shoeSize?.message ?? hint("shoeSize")}>
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      {...register("shoeSize", { setValueAs: orNull })}
                    />
                  )}
                </Field>
                <Field
                  label="Körpergröße [cm]"
                  error={errors.heightCm?.message ?? hint("heightCm")}
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      {...register("heightCm", { setValueAs: asNumber })}
                    />
                  )}
                </Field>
                <Field label="Gewicht [kg]" error={errors.weightKg?.message ?? hint("weightKg")}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      {...register("weightKg", { setValueAs: asNumber })}
                    />
                  )}
                </Field>
              </>
            ) : null}
          </Section>

          <Section title="Sportwoche">
            <SelectField
              control={control}
              name="skillLevel"
              label="Leistungsstufe"
              options={lists.skillLevels}
              placeholder="Leistungsstufe wählen"
              error={errors.skillLevel?.message ?? hint("skillLevel")}
            />
            <SelectField
              control={control}
              name="seasonPassOption"
              label="Saisonkarte"
              options={lists.seasonPassOptions}
              placeholder="Saisonkarte wählen"
              error={errors.seasonPassOption?.message ?? hint("seasonPassOption")}
            />
            <SelectField
              control={control}
              name="busPickupPoint"
              label="Zustiegsstelle"
              options={lists.busPickupPoints}
              placeholder="Zustiegsstelle wählen"
              error={errors.busPickupPoint?.message ?? hint("busPickupPoint")}
            />
          </Section>

          <Section title="Verpflegung">
            <SelectField
              control={control}
              name="foodOption"
              label="Verpflegung"
              options={[...lists.foodOptions, FOOD_OPTION_OTHER]}
              labelOf={(option) =>
                option === FOOD_OPTION_OTHER ? FOOD_OPTION_OTHER_LABEL : option
              }
              placeholder="Verpflegung wählen"
              error={errors.foodOption?.message ?? hint("foodOption")}
            />
            {foodOption === FOOD_OPTION_OTHER ? (
              <Field
                label="Welche Unverträglichkeit?"
                error={errors.foodOtherText?.message ?? hint("foodOtherText")}
              >
                {(id) => <Input id={id} {...register("foodOtherText", { setValueAs: orNull })} />}
              </Field>
            ) : null}
          </Section>

          <Section title="Gesundheit">
            <Field label="Krankheiten oder Allergien" error={errors.healthNotes?.message}>
              {(id) => (
                <Textarea id={id} rows={3} {...register("healthNotes", { setValueAs: orNull })} />
              )}
            </Field>
            <RadioField
              control={control}
              name="hasMedication"
              label="Nimmst du Medikamente mit?"
              options={YES_NO}
              error={errors.hasMedication?.message ?? hint("hasMedication")}
            />
          </Section>
        </>
      ) : null}

      {submitError ? (
        <p role="alert" className="text-destructive text-sm">
          {submitError}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-muted-foreground text-sm">
          Deine Daten wurden gespeichert.
        </p>
      ) : null}

      <div className="flex justify-end">
        {/* Enabled as soon as an answer changes: an incomplete registration is still worth keeping. */}
        <Button type="submit" disabled={!isDirty || isSubmitting}>
          Speichern
        </Button>
      </div>
    </form>
  );
}
