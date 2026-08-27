/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { YES_NO_LABELS } from "@/lib/student-master-data/answer-labels";
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

/**
 * A value the student is shown but does not own — the season they are registering for and the
 * name from their user record (US-11). Rendered as text rather than a disabled input: an input
 * still looks like somewhere to type, and a caret in a field nothing can change is a small lie.
 */
export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const id = React.useId();

  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm leading-none font-medium">
        {label}
      </span>
      <p aria-labelledby={id} className="text-muted-foreground text-sm">
        {value}
      </p>
    </div>
  );
}

/**
 * A group of choices, named as a group so the question is announced with its answers. A plain
 * element with `role="group"` rather than a fieldset: a legend is laid out by the browser in
 * ways that will not sit beside anything, and the inline variant has to.
 */
export function ChoiceGroup({
  label,
  error,
  inline = false,
  children,
}: {
  label: string;
  error?: string;
  inline?: boolean;
  children: React.ReactNode;
}) {
  const id = React.useId();

  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <div className={cn("flex gap-1.5", inline ? "flex-wrap items-center gap-x-3" : "flex-col")}>
        <span id={id} className="text-sm leading-none font-medium">
          {label}
        </span>
        <div className="flex flex-wrap items-center gap-4">{children}</div>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
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
  /** Puts the question and its answers on one line, for a question short enough to fit. */
  inline?: boolean;
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
  inline,
}: RadioFieldProps<TValues, TOption>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ChoiceGroup label={label} error={error} inline={inline}>
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

/** "Nein" first, because that is where an unanswered registration starts (US-11). */
export const YES_NO = [
  { value: false, label: YES_NO_LABELS.false },
  { value: true, label: YES_NO_LABELS.true },
] as const;
