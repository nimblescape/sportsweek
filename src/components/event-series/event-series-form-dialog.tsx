/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiRequestError } from "@/lib/api/client";
import { EVENT_SERIES_STATE_LABELS } from "@/lib/event-series/event-series-state";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";

const formSchema = z.object({
  name: eventSeriesSchema.shape.name,
  isTemplate: z.boolean(),
  sourceId: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

/** What creating asks for, once all three questions are answered (US-22). */
export type NewEventSeries = { name: string; isTemplate: boolean; sourceId: string | null };

const KINDS = [
  { value: false, label: "Eventreihe" },
  { value: true, label: EVENT_SERIES_STATE_LABELS.template },
] as const;

const NO_SOURCE = "";
const NO_SOURCE_LABEL = "Ohne";

/** In words rather than by colour, which the tag rows have already spent (US-22). */
function sourceLabel(one: EventSeries): string {
  if (one.isTemplate) return `${one.name} (${EVENT_SERIES_STATE_LABELS.template})`;
  if (one.isArchived) return `${one.name} (${EVENT_SERIES_STATE_LABELS.archived})`;
  return one.name;
}

type EventSeriesFormDialogProps = {
  open: boolean;
  /** `null` opens the dialog for a new event series. */
  eventSeries: EventSeries | null;
  /** What a new one may take its lists from — any series or template, archived ones included. */
  sources: readonly EventSeries[];
  /** Rejects with an ApiRequestError; a CONFLICT is reported on the name field. */
  onSubmit: (values: NewEventSeries, eventSeries: EventSeries | null) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
};

export function EventSeriesFormDialog({
  open,
  eventSeries,
  sources,
  onSubmit: save,
  onClose,
  onSaved,
}: EventSeriesFormDialogProps) {
  const isEdit = eventSeries !== null;
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const nameId = React.useId();
  const errorId = React.useId();
  const sourceId = React.useId();

  // No reset effect: the dialog is mounted only while open (and keyed by event series), so every
  // open starts from these defaults.
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: eventSeries?.name ?? "",
      isTemplate: false,
      sourceId: NO_SOURCE,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await save(
        {
          name: values.name,
          isTemplate: values.isTemplate,
          sourceId: values.sourceId === NO_SOURCE ? null : values.sourceId,
        },
        eventSeries,
      );
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

        {/* Both are settled at creation and neither settles the other, so renaming asks again for
            nothing: a copy is no more a template for having come from one (US-22). */}
        {isEdit ? null : (
          <>
            <Controller
              control={control}
              name="isTemplate"
              render={({ field }) => (
                <div role="group" aria-label="Art" className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Art</span>
                  <div className="flex items-center gap-4">
                    {KINDS.map((kind) => (
                      <label key={kind.label} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          className="accent-primary size-4"
                          checked={field.value === kind.value}
                          onChange={() => field.onChange(kind.value)}
                        />
                        {kind.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={sourceId}>Einstellungen übernehmen von</Label>
              <Controller
                control={control}
                name="sourceId"
                render={({ field }) => (
                  <Select
                    items={[
                      { label: NO_SOURCE_LABEL, value: NO_SOURCE },
                      ...sources.map((one) => ({ label: sourceLabel(one), value: one.id })),
                    ]}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger id={sourceId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SOURCE}>{NO_SOURCE_LABEL}</SelectItem>
                      {sources.map((one) => (
                        <SelectItem key={one.id} value={one.id}>
                          {sourceLabel(one)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </>
        )}

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
