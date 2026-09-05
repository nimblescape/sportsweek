/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import type { z } from "zod";
import { Tag, TagAction, TagField } from "@/components/ui/tag";

type NameFormProps = {
  /** Owns the wording of a refusal, so the hint beside the field is the one the server would send. */
  schema: z.ZodType<string>;
  /** The accessible name of the field, and its placeholder. */
  label: string;
  initialName?: string;
  /** The accessible name of the confirming icon, which is what the form is for. */
  submitLabel: string;
  /** Held by the row while its write is out, so a second name cannot be taken for the same one. */
  pending: boolean;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
};

/**
 * The one place a name is typed where a dialog would be too much — naming a report, adding an
 * entry to a list. Shaped as a tag, with its controls inside it, so it stands in a row of tags
 * without the row changing shape around it.
 */
export function NameForm({
  schema,
  label,
  initialName = "",
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: NameFormProps) {
  const [name, setName] = React.useState(initialName);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = schema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Ungültiger Name.");
      return;
    }

    setError(null);
    try {
      await onSubmit(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Das hat leider nicht geklappt.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5" noValidate>
      <Tag disabled={pending}>
        <TagField
          autoFocus
          aria-label={label}
          aria-invalid={error !== null}
          placeholder={label}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TagAction type="submit" label={submitLabel}>
          <Check aria-hidden />
        </TagAction>
        <TagAction label="Abbrechen" onClick={onCancel}>
          <X aria-hidden />
        </TagAction>
      </Tag>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}
