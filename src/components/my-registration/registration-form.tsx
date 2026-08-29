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
import { PageHeading } from "@/components/layout/page-heading";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import {
  FOOD_OPTION_OTHER,
  FOOD_OPTION_OTHER_LABEL,
  type Program,
} from "@/lib/schemas/master-data";
import {
  registrationInputSchema,
  type Registration,
  type RegistrationInput,
} from "@/lib/schemas/registration";
import {
  EMPTY_REGISTRATION,
  scopeRentalToProgram,
  toRegistrationInput,
} from "@/lib/registration/registration";
import { GENDER_LABELS, RELATIONSHIP_LABELS } from "@/lib/registration/answer-labels";
import { missingAnswers } from "@/lib/registration/completeness";
import { ANSWER_LABELS, type AnswerField } from "@/lib/master-data/categories";
import { EquipmentChecklist } from "./equipment-checklist";
import { Field, RadioField, ReadOnlyField, SelectField, YES_NO } from "./fields";

export type MasterDataLists = {
  programs: readonly Program[];
  skillLevels: readonly string[];
  busPickupPoints: readonly string[];
  foodOptions: readonly string[];
  seasonPassOptions: readonly string[];
};

type RegistrationFormProps = {
  eventSeriesId: string;
  eventSeriesName: string;
  /** From the user record, shown but not editable as part of this registration (US-11). */
  studentName: string;
  /** From the invitation link, likewise shown rather than asked (US-23). */
  studentClass: string;
  /** The questions this series' lists supply; the rest are never rendered at all (US-21). */
  asked: ReadonlySet<AnswerField>;
  record: Registration | null;
  lists: MasterDataLists;
};

const GENDERS = [
  { value: "male", label: GENDER_LABELS.male },
  { value: "female", label: GENDER_LABELS.female },
] as const;

const RELATIONSHIPS = [
  { value: "mother", label: RELATIONSHIP_LABELS.mother },
  { value: "father", label: RELATIONSHIP_LABELS.father },
  { value: "other", label: RELATIONSHIP_LABELS.other },
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
 * The student's registration in one event series (US-11).
 *
 * Answering "no" hides the questions rather than clearing them: the fields stay registered, so
 * the values come back untouched if the student changes their mind, and a save carries them
 * along. Every list value is stored as the plain text that was picked, never as a reference, so
 * a teacher renaming an entry later leaves this record exactly as it was.
 */
export function RegistrationForm({
  eventSeriesId,
  eventSeriesName,
  studentName,
  studentClass,
  asked,
  record,
  lists,
}: RegistrationFormProps) {
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
  const resolver: Resolver<RegistrationInput> = React.useCallback(
    (values, context, options) =>
      zodResolver(registrationInputSchema)(
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
  } = useForm<RegistrationInput>({
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
  const missing = missingAnswers(
    scopeRentalToProgram(values as RegistrationInput, equipment),
    asked,
  );
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
      await apiRequest(`/api/my-registration/${eventSeriesId}`, { method: "PUT", body: values });
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
      {/* The whole form is about this one event series, so it heads the form rather than a card
          inside it — where it read as the title of the answers underneath it. */}
      <PageHeading>{eventSeriesName}</PageHeading>

      <Section title="Registrierung">
        <ReadOnlyField label="Name" value={studentName} />
        <ReadOnlyField label={ANSWER_LABELS.class} value={studentClass} />
        <RadioField
          control={control}
          name="isAttendingSportsWeek"
          label="Nimmst du an der Veranstaltung teil?"
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

          <Section title="Veranstaltung">
            {asked.has("program") ? (
              <SelectField
                control={control}
                name="program"
                label="Für welches Programm meldest du dich an?"
                options={lists.programs.map((entry) => entry.name)}
                placeholder={`${ANSWER_LABELS.program} wählen`}
                error={errors.program?.message ?? hint("program")}
              />
            ) : null}
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
            {asked.has("skillLevel") ? (
              <SelectField
                control={control}
                name="skillLevel"
                label={ANSWER_LABELS.skillLevel}
                options={lists.skillLevels}
                placeholder={`${ANSWER_LABELS.skillLevel} wählen`}
                error={errors.skillLevel?.message ?? hint("skillLevel")}
              />
            ) : null}
            {asked.has("seasonPassOption") ? (
              <SelectField
                control={control}
                name="seasonPassOption"
                label={ANSWER_LABELS.seasonPassOption}
                options={lists.seasonPassOptions}
                placeholder={`${ANSWER_LABELS.seasonPassOption} wählen`}
                error={errors.seasonPassOption?.message ?? hint("seasonPassOption")}
              />
            ) : null}
            {asked.has("busPickupPoint") ? (
              <SelectField
                control={control}
                name="busPickupPoint"
                label={ANSWER_LABELS.busPickupPoint}
                options={lists.busPickupPoints}
                placeholder={`${ANSWER_LABELS.busPickupPoint} wählen`}
                error={errors.busPickupPoint?.message ?? hint("busPickupPoint")}
              />
            ) : null}
            {/* "Sonstiges" is an answer rather than a list item, so it cannot keep the question
                alive on its own (Q22). */}
            {asked.has("foodOption") ? (
              <SelectField
                control={control}
                name="foodOption"
                label={ANSWER_LABELS.foodOption}
                options={[...lists.foodOptions, FOOD_OPTION_OTHER]}
                labelOf={(option) =>
                  option === FOOD_OPTION_OTHER ? FOOD_OPTION_OTHER_LABEL : option
                }
                placeholder={`${ANSWER_LABELS.foodOption} wählen`}
                error={errors.foodOption?.message ?? hint("foodOption")}
              />
            ) : null}
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

      {/* One block for both halves of the answer: what happened, and where the student stands.
          It goes as soon as they edit again, because by then it is no longer true. */}
      {saved && !isDirty ? (
        <Card role="status">
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm font-medium">Deine Daten wurden gespeichert.</p>
            <p className="text-muted-foreground text-sm">
              {missing.length === 0
                ? "Deine Registrierung ist vollständig."
                : `Deine Registrierung ist noch nicht vollständig. Es fehlen noch: ${missing
                    .map((answer) => answer.label)
                    .join(", ")}.`}
            </p>
          </CardContent>
        </Card>
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
