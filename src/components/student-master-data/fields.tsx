/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FieldProps = {
  label: string;
  error?: string;
  /** Receives the id its label points at, so the association is never left to chance. */
  children: (id: string) => React.ReactNode;
};

export function Field({ label, error, children }: FieldProps) {
  const id = React.useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}

/** A group of choices needs its own label, which only a legend gives it. */
export function ChoiceGroup({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm leading-none font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </fieldset>
  );
}

type SelectFieldProps<TValues extends FieldValues> = {
  control: Control<TValues>;
  name: FieldPath<TValues>;
  label: string;
  options: readonly string[];
  placeholder: string;
  error?: string;
  /** For the one option whose stored value is not what the student should read (US-9). */
  labelOf?: (option: string) => string;
};

/**
 * One value out of a teacher-maintained list, in the order the teacher set (see Ordering). The
 * name is what gets stored, not a reference to the item (US-11).
 */
export function SelectField<TValues extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder,
  error,
  labelOf = (option) => option,
}: SelectFieldProps<TValues>) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select
              items={options.map((option) => ({ label: labelOf(option), value: option }))}
              value={field.value ?? ""}
              onValueChange={(value) => field.onChange(value === "" ? null : value)}
            >
              <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined}>
                {field.value ? (
                  <SelectValue />
                ) : (
                  <span className="text-muted-foreground">{placeholder}</span>
                )}
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {labelOf(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </Field>
  );
}

type RadioFieldProps<TValues extends FieldValues, TOption> = {
  control: Control<TValues>;
  name: FieldPath<TValues>;
  label: string;
  options: readonly { value: TOption; label: string }[];
  error?: string;
};

/**
 * A short, fixed set of answers, shown as radios rather than a dropdown: with two options a
 * dropdown hides half the question behind a click.
 */
export function RadioField<TValues extends FieldValues, TOption extends string | boolean>({
  control,
  name,
  label,
  options,
  error,
}: RadioFieldProps<TValues, TOption>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ChoiceGroup label={label} error={error}>
          {options.map((option) => (
            <label key={String(option.value)} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                className="accent-primary size-4"
                name={field.name}
                value={String(option.value)}
                checked={field.value === option.value}
                onChange={() => field.onChange(option.value)}
                onBlur={field.onBlur}
              />
              {option.label}
            </label>
          ))}
        </ChoiceGroup>
      )}
    />
  );
}

export const YES_NO = [
  { value: true, label: "Ja" },
  { value: false, label: "Nein" },
] as const;
