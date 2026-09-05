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
import { RecordList, type RecordRow } from "@/components/master-data/record-list";
import { RecordScreen } from "@/components/master-data/record-screen";
import { ApiRequestError } from "@/lib/api/client";
import { useRowAction } from "@/lib/api/use-row-action";
import { listItemNameSchema } from "@/lib/schemas/master-data";
import type { Crumb, RecordTab } from "@/lib/master-data/hierarchy";
import { IN_USE_HINT, USAGE_PENDING_HINT } from "@/lib/master-data/categories";

const formSchema = z.object({ name: listItemNameSchema });
type FormValues = z.infer<typeof formSchema>;

const NAME_LABEL = "Name";

/** An item has no id of its own: its name is what identifies it within its list (US-21). */
export type CrudItem = { id: string; name: string };

export type CrudLabels = {
  title: string;
  singular: string;
  add: string;
  empty: string;
};

type OpenDialog =
  { kind: "none" } | { kind: "form"; item: CrudItem | null } | { kind: "delete"; item: CrudItem };

type CrudListProps = {
  /** The path down to the record on screen, ending at it — its last step is the heading (US-33). */
  trail: readonly Crumb[];
  /** The record's child collections; the marked one's entries are the list beneath. */
  tabs: readonly RecordTab[];
  marked: string;
  labels: CrudLabels;
  items: CrudItem[];
  loading: boolean;
  error: string | null;
  /** In use itself: neither editable nor deletable. */
  blockedIds?: Set<string>;
  /**
   * The in-use answer is still on its way. Every row is held closed until it lands, because the
   * opposite order offers controls the answer may withdraw a moment later.
   */
  usagePending?: boolean;
  /** Deletable no longer, but still renameable — its own list holds something in use. */
  undeletableIds?: Set<string>;
  undeletableHint?: string;
  /** Options offered to students that the teacher does not maintain, such as "Sonstiges" (US-9). */
  fixedItems?: readonly string[];
  fixedItemsHint?: string;
  /** Where an entry's own record page is, for a list whose entries have children (US-33). */
  openHref?: (item: CrudItem) => string;
  /** Rejects with an ApiRequestError; a CONFLICT is reported on the name field. */
  onSubmit: (name: string, item: CrudItem | null) => Promise<void>;
  onDelete: (item: CrudItem) => Promise<void>;
  /** Receives the ids in their new order after a drag (see Ordering). */
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  deleteNote: (item: CrudItem) => React.ReactNode;
  /** What renaming this item does not do; shown while an existing one is being edited. */
  editNote: (item: CrudItem) => React.ReactNode;
};

/**
 * One master data screen (US-33): the record's path and name, a tag per child collection it has,
 * and the marked collection's entries beneath. It takes items and callbacks rather than reading
 * anything itself, which is what lets every level of the hierarchy present the identical shape.
 */
export function CrudList({
  trail,
  tabs,
  marked,
  labels,
  items,
  loading,
  error,
  blockedIds = new Set(),
  usagePending = false,
  undeletableIds = new Set(),
  undeletableHint = IN_USE_HINT,
  fixedItems = [],
  fixedItemsHint,
  openHref,
  onSubmit,
  onDelete,
  onReorder,
  deleteNote,
  editNote,
}: CrudListProps) {
  const [dialog, setDialog] = React.useState<OpenDialog>({ kind: "none" });
  const { busyId, pending, run } = useRowAction();

  const closeDialog = () => setDialog({ kind: "none" });

  // A write started from a row holds that row until it is answered, and every write holds the
  // list. The list refreshes from a separate subscription, so until then the other controls
  // would act on data this write may already have changed. A new item has no row to hold.
  const submit = (name: string, item: CrudItem | null) =>
    run(item?.id ?? null, () => onSubmit(name, item));

  const lockedHint = usagePending ? USAGE_PENDING_HINT : IN_USE_HINT;
  const rows: RecordRow[] = items.map((item) => {
    const locked = usagePending || blockedIds.has(item.id);

    return {
      ...item,
      href: openHref?.(item),
      edit: locked ? lockedHint : true,
      remove: locked ? lockedHint : undeletableIds.has(item.id) ? undeletableHint : true,
    };
  });

  return (
    <>
      <RecordScreen
        trail={trail}
        tabs={tabs}
        marked={marked}
        busy={pending}
        onAdd={() => setDialog({ kind: "form", item: null })}
      >
        <RecordList
          singular={labels.singular}
          title={labels.title}
          empty={labels.empty}
          rows={rows}
          loading={loading}
          error={error}
          fixedItems={fixedItems}
          fixedItemsHint={fixedItemsHint}
          busyId={busyId}
          onEdit={(row) => setDialog({ kind: "form", item: { id: row.id, name: row.name } })}
          onDelete={(row) => setDialog({ kind: "delete", item: { id: row.id, name: row.name } })}
          onReorder={(orderedIds) => run(null, async () => onReorder(orderedIds))}
        />
      </RecordScreen>

      {dialog.kind === "form" ? (
        <ItemFormDialog
          key={dialog.item?.id ?? "new"}
          labels={labels}
          item={dialog.item}
          note={dialog.item === null ? null : editNote(dialog.item)}
          onSubmit={submit}
          onClose={closeDialog}
        />
      ) : null}

      {dialog.kind === "delete" ? (
        <DeleteItemDialog
          key={dialog.item.id}
          labels={labels}
          item={dialog.item}
          note={deleteNote(dialog.item)}
          onDelete={(item) => run(item.id, () => onDelete(item))}
          onClose={closeDialog}
        />
      ) : null}
    </>
  );
}

function ItemFormDialog({
  labels,
  item,
  note,
  onSubmit,
  onClose,
}: {
  labels: CrudLabels;
  item: CrudItem | null;
  note: React.ReactNode;
  onSubmit: (name: string, item: CrudItem | null) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = item !== null;
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const nameId = React.useId();
  const errorId = React.useId();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: item?.name ?? "" },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values.name, item);
      onClose();
    } catch (caught) {
      // A duplicate name, and an item that turned out to be in use, are both problems with what
      // is in the field — so they are reported there rather than as a detached alert.
      if (caught instanceof ApiRequestError && caught.code === "CONFLICT") {
        setError("name", { message: caught.message });
        return;
      }
      setSubmitError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    }
  });

  return (
    <Dialog open title={isEdit ? `${labels.singular} bearbeiten` : labels.add} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {/* Renaming leaves what was already stored alone, which is worth saying before it is. */}
        {note === null ? null : <p className="text-muted-foreground text-sm">{note}</p>}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>{NAME_LABEL}</Label>
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

function DeleteItemDialog({
  labels,
  item,
  note,
  onDelete,
  onClose,
}: {
  labels: CrudLabels;
  item: CrudItem;
  note: React.ReactNode;
  onDelete: (item: CrudItem) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(item);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open
      tone="destructive"
      title={`${labels.singular} löschen`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" disabled={deleting} onClick={handleDelete}>
            Löschen
          </Button>
        </>
      }
    >
      <p className="text-sm">{note}</p>
      {error ? (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
