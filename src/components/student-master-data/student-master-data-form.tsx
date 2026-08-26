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
import { EquipmentChecklist } from "./equipment-checklist";
import { Field, RadioField, SelectField, YES_NO } from "./fields";

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
    formState: { errors, isSubmitting },
    reset,
  } = useForm<StudentMasterDataInput>({
    resolver,
    defaultValues: record ? toRegistrationInput(record) : EMPTY_REGISTRATION,
  });

  const [isAttending, programName, needsRental, foodOption, relationship] = useWatch({
    control,
    name: [
      "isAttendingSportsWeek",
      "program",
      "equipmentRentalNeeded",
      "foodOption",
      "emergencyContact.relationship",
    ],
  });

  const equipment = equipmentOf(programName);

  // The resolver already scoped these, so what arrives here is what the server should be told.
  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setSaved(false);
    try {
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
        <Field label="Name">{(id) => <Input id={id} value={studentName} readOnly />}</Field>
        <Field label="Saison">{(id) => <Input id={id} value={seasonName} readOnly />}</Field>
        <RadioField
          control={control}
          name="isAttendingSportsWeek"
          label="Nimmst du an der Sportwoche teil?"
          options={YES_NO}
        />
        <SelectField
          control={control}
          name="class"
          label="Klasse"
          options={lists.classes}
          placeholder="Klasse wählen"
          error={errors.class?.message}
        />
      </Section>

      {isAttending ? (
        <>
          <Section title="Persönliches">
            <Field label="Geburtsdatum" error={errors.dateOfBirth?.message}>
              {(id) => (
                <Input id={id} type="date" {...register("dateOfBirth", { setValueAs: orNull })} />
              )}
            </Field>
            <RadioField
              control={control}
              name="gender"
              label="Geschlecht"
              options={GENDERS}
              error={errors.gender?.message}
            />
            <Field label="Telefonnummer" error={errors.phoneNumber?.message}>
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
            <Field label="Vorname" error={errors.emergencyContact?.firstName?.message}>
              {(id) => (
                <Input
                  id={id}
                  {...register("emergencyContact.firstName", { setValueAs: orNull })}
                />
              )}
            </Field>
            <Field label="Nachname" error={errors.emergencyContact?.lastName?.message}>
              {(id) => (
                <Input id={id} {...register("emergencyContact.lastName", { setValueAs: orNull })} />
              )}
            </Field>
            <RadioField
              control={control}
              name="emergencyContact.relationship"
              label="Beziehung"
              options={RELATIONSHIPS}
              error={errors.emergencyContact?.relationship?.message}
            />
            {relationship === "other" ? (
              <Field
                label="Welche Beziehung?"
                error={errors.emergencyContact?.relationshipOtherText?.message}
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
              error={errors.emergencyContact?.phoneNumber?.message}
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
              error={errors.program?.message}
            />
            {equipment.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm leading-none font-medium">Benötigte Ausrüstung</p>
                <ul className="text-muted-foreground list-inside list-disc text-sm">
                  {equipment.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {equipment.length > 0 ? (
              <RadioField
                control={control}
                name="equipmentRentalNeeded"
                label="Musst du Ausrüstung ausleihen?"
                options={YES_NO}
                error={errors.equipmentRentalNeeded?.message}
              />
            ) : null}
            {equipment.length > 0 && needsRental === true ? (
              <>
                <Field label="Schuhgröße" error={errors.shoeSize?.message}>
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      {...register("shoeSize", { setValueAs: orNull })}
                    />
                  )}
                </Field>
                <Field label="Körpergröße [cm]" error={errors.heightCm?.message}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      {...register("heightCm", { setValueAs: asNumber })}
                    />
                  )}
                </Field>
                <Field label="Gewicht [kg]" error={errors.weightKg?.message}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      {...register("weightKg", { setValueAs: asNumber })}
                    />
                  )}
                </Field>
                <Controller
                  control={control}
                  name="rentedEquipment"
                  render={({ field }) => (
                    <EquipmentChecklist
                      items={equipment}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      error={errors.rentedEquipment?.message}
                    />
                  )}
                />
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
              error={errors.skillLevel?.message}
            />
            <SelectField
              control={control}
              name="seasonPassOption"
              label="Saisonkarte"
              options={lists.seasonPassOptions}
              placeholder="Saisonkarte wählen"
              error={errors.seasonPassOption?.message}
            />
            <SelectField
              control={control}
              name="busPickupPoint"
              label="Zustiegsstelle"
              options={lists.busPickupPoints}
              placeholder="Zustiegsstelle wählen"
              error={errors.busPickupPoint?.message}
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
              error={errors.foodOption?.message}
            />
            {foodOption === FOOD_OPTION_OTHER ? (
              <Field label="Welche Unverträglichkeit?" error={errors.foodOtherText?.message}>
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
              label="Nimmst du dafür Medikamente mit?"
              options={YES_NO}
              error={errors.hasMedication?.message}
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
        <Button type="submit" disabled={isSubmitting}>
          Speichern
        </Button>
      </div>
    </form>
  );
}
