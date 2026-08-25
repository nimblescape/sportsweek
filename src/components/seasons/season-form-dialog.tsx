"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import { seasonSchema, type Season } from "@/lib/schemas/season";

const formSchema = z.object({ name: seasonSchema.shape.name });
type FormValues = z.infer<typeof formSchema>;

type SeasonFormDialogProps = {
  open: boolean;
  /** `null` opens the dialog for a new season. */
  season: Season | null;
  onClose: () => void;
  onSaved: () => void;
};

export function SeasonFormDialog({ open, season, onClose, onSaved }: SeasonFormDialogProps) {
  const isEdit = season !== null;
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const nameId = React.useId();

  // No reset effect: the dialog is mounted only while open (and keyed by season), so every
  // open starts from these defaults.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: season?.name ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (isEdit) {
        await apiRequest(`/api/seasons/${season.id}`, { method: "PATCH", body: values });
      } else {
        await apiRequest("/api/seasons", { method: "POST", body: values });
      }
      onSaved();
    } catch (error) {
      setSubmitError(
        error instanceof ApiRequestError ? error.message : "Das hat leider nicht geklappt.",
      );
    }
  });

  return (
    <Dialog open={open} title={isEdit ? "Saison bearbeiten" : "Neue Saison"} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            {...register("name")}
          />
          {errors.name ? <p className="text-destructive text-sm">{errors.name.message}</p> : null}
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
