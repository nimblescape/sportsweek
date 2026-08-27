/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError } from "@/lib/api/client";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
const formSchema = z.object({ name: eventSeriesSchema.shape.name });
type FormValues = z.infer<typeof formSchema>;

type EventSeriesFormDialogProps = {
  open: boolean;
  /** `null` opens the dialog for a new event series. */
  eventSeries: EventSeries | null;
  /** Rejects with an ApiRequestError; a CONFLICT is reported on the name field. */
  onSubmit: (name: string, eventSeries: EventSeries | null) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
};

export function EventSeriesFormDialog({
  open,
  eventSeries,
  onSubmit: save,
  onClose,
  onSaved,
}: EventSeriesFormDialogProps) {
  const isEdit = eventSeries !== null;
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const nameId = React.useId();
  const errorId = React.useId();

  // No reset effect: the dialog is mounted only while open (and keyed by event series), so every
  // open starts from these defaults.
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: eventSeries?.name ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await save(values.name, eventSeries);
      onSaved();
    } catch (error) {
      // A duplicate name is a problem with the field, so it is reported there rather than
      // as a detached alert the teacher has to connect back to the input themselves (US-4).
      if (error instanceof ApiRequestError && error.code === "CONFLICT") {
        setError("name", { message: error.message });
        return;
      }
      setSubmitError(
        error instanceof ApiRequestError ? error.message : "Das hat leider nicht geklappt.",
      );
    }
  });

  return (
    <Dialog
      open={open}
      title={isEdit ? "Eventreihe bearbeiten" : "Neue Eventreihe"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? errorId : undefined}
            {...register("name")}
          />
          {errors.name ? (
            <p id={errorId} className="text-destructive text-sm">
              {errors.name.message}
            </p>
          ) : null}
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
            {isEdit ? "Speichern" : "Anlegen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
