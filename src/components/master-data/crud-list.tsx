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
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusyRegion } from "@/components/ui/busy-region";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SortableList } from "@/components/ui/sortable-list";
import { Tooltip } from "@/components/ui/tooltip";
import { ApiRequestError } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useRowAction } from "@/lib/api/use-row-action";
import { namedListItemSchema } from "@/lib/schemas/master-data";
import { IN_USE_HINT } from "@/lib/master-data/categories";

const formSchema = z.object({ name: namedListItemSchema.shape.name });
type FormValues = z.infer<typeof formSchema>;

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
  labels: CrudLabels;
  /** Overrides the heading, so a program's equipment list can name the program. */
  title?: string;
  /** Rendered above the heading, e.g. the way back out of a nested list. */
  children?: React.ReactNode;
  items: CrudItem[];
  loading: boolean;
  error: string | null;
  /** In use itself: neither editable nor deletable. */
  blockedIds?: Set<string>;
  /** Deletable no longer, but still renameable — its own list holds something in use. */
  undeletableIds?: Set<string>;
  undeletableHint?: string;
  /** Options offered to students that the teacher does not maintain, such as "Sonstiges" (US-9). */
  fixedItems?: readonly string[];
  fixedItemsHint?: string;
  /** One extra control per row, ahead of edit and delete — the programs list uses it. */
  renderRowAction?: (item: CrudItem, options: { disabled: boolean }) => React.ReactNode;
  /** Rejects with an ApiRequestError; a CONFLICT is reported on the name field. */
  onSubmit: (name: string, item: CrudItem | null) => Promise<void>;
  onDelete: (item: CrudItem) => Promise<void>;
  /** Receives the ids in their new order after a drag (see Ordering). */
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  deleteNote: (item: CrudItem) => React.ReactNode;
};

/**
 * The one CRUD list every teacher-maintained category uses (US-5 to US-10), and the one a
 * program's required equipment uses too. It takes items and callbacks rather than reading
 * anything itself, which is what lets a Firestore collection and a field on a single document
 * present the identical pattern the requirements ask for.
 */
export function CrudList({
  labels,
  title,
  children,
  items,
  loading,
  error,
  blockedIds = new Set(),
  undeletableIds = new Set(),
  undeletableHint = IN_USE_HINT,
  fixedItems = [],
  fixedItemsHint,
  renderRowAction,
  onSubmit,
  onDelete,
  onReorder,
  deleteNote,
}: CrudListProps) {
  const [dialog, setDialog] = React.useState<OpenDialog>({ kind: "none" });
  const { busyId, pending, run } = useRowAction();

  useBusyWhile(loading);

  const closeDialog = () => setDialog({ kind: "none" });

  // A write started from a row holds that row until it is answered, and every write holds the
  // list. The list refreshes from a separate subscription, so until then the other controls
  // would act on data this write may already have changed. A new item has no row to hold.
  const submit = (name: string, item: CrudItem | null) =>
    run(item?.id ?? null, () => onSubmit(name, item));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {children}

      <BusyRegion busy={pending}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading text-lg font-semibold">{title ?? labels.title}</h1>
            <Button onClick={() => setDialog({ kind: "form", item: null })}>
              <Plus aria-hidden data-icon="inline-start" />
              {labels.add}
            </Button>
          </div>

          <ItemList
            labels={labels}
            items={items}
            loading={loading}
            error={error}
            blockedIds={blockedIds}
            undeletableIds={undeletableIds}
            undeletableHint={undeletableHint}
            fixedItems={fixedItems}
            fixedItemsHint={fixedItemsHint}
            renderRowAction={renderRowAction}
            busyId={busyId}
            onEdit={(item) => setDialog({ kind: "form", item })}
            onDelete={(item) => setDialog({ kind: "delete", item })}
            onReorder={(orderedIds) => run(null, async () => onReorder(orderedIds))}
          />
        </div>
      </BusyRegion>

      {dialog.kind === "form" ? (
        <ItemFormDialog
          key={dialog.item?.id ?? "new"}
          labels={labels}
          item={dialog.item}
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
    </div>
  );
}

type ItemListProps = Required<
  Pick<CrudListProps, "labels" | "items" | "loading" | "blockedIds" | "undeletableIds">
> & {
  error: string | null;
  undeletableHint: string;
  fixedItems: readonly string[];
  fixedItemsHint?: string;
  renderRowAction?: (item: CrudItem, options: { disabled: boolean }) => React.ReactNode;
  busyId: string | null;
  onEdit: (item: CrudItem) => void;
  onDelete: (item: CrudItem) => void;
  onReorder: (orderedIds: string[]) => void | Promise<void>;
};

function ItemList({
  labels,
  items,
  loading,
  error,
  blockedIds,
  undeletableIds,
  undeletableHint,
  fixedItems,
  fixedItemsHint,
  renderRowAction,
  busyId,
  onEdit,
  onDelete,
  onReorder,
}: ItemListProps) {
  const { title, singular, empty } = labels;

  // The header spinner says the app is working; a second one on the list would say it twice.
  if (loading) return null;

  if (error) {
    return (
      <Card>
        <p role="alert" className="text-destructive px-(--card-spacing) text-sm">
          {title} konnten nicht geladen werden.
        </p>
      </Card>
    );
  }

  if (items.length === 0 && fixedItems.length === 0) {
    return (
      <Card>
        <p className="text-muted-foreground px-(--card-spacing) text-sm">{empty}</p>
      </Card>
    );
  }

  return (
    <Card className="[--card-spacing:--spacing(0)]">
      <SortableList
        items={items}
        onReorder={onReorder}
        busyId={busyId}
        renderItem={(item) => {
          const busy = item.id === busyId;
          const blocked = blockedIds.has(item.id);
          const undeletable = blocked || undeletableIds.has(item.id);
          const deleteHint = blocked ? IN_USE_HINT : undeletableHint;
          const hintId = `${item.id}-in-use-hint`;

          return (
            <div className="flex items-center justify-between gap-4 py-3 pr-4 pl-2">
              <span className="truncate text-sm font-medium">{item.name}</span>

              <div className="flex shrink-0 items-center gap-1">
                {renderRowAction?.(item, { disabled: busy })}

                {/* Wrapped in a span because a disabled button emits no pointer events, and the
                    reason it is disabled is exactly what needs explaining here. */}
                <Tooltip label={blocked ? IN_USE_HINT : "Bearbeiten"}>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={blocked || busy}
                      aria-label={`${singular} ${item.name} bearbeiten`}
                      aria-describedby={blocked ? hintId : undefined}
                      onClick={() => onEdit(item)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  </span>
                </Tooltip>

                <Tooltip label={undeletable ? deleteHint : "Löschen"}>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={undeletable || busy}
                      aria-label={`${singular} ${item.name} löschen`}
                      aria-describedby={undeletable ? hintId : undefined}
                      onClick={() => onDelete(item)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                </Tooltip>

                {undeletable ? (
                  <span id={hintId} className="sr-only">
                    {deleteHint}
                  </span>
                ) : null}
              </div>
            </div>
          );
        }}
        className="[&>li]:border-border [&>li]:border-b [&>li:last-child]:border-b-0"
      />

      <ul className="border-border [&>li]:border-border empty:hidden [&>li]:border-t">
        {/* Always offered to students and never a row of its own, so it carries no controls (US-9). */}
        {fixedItems.map((name) => {
          const hint = fixedItemsHint ?? "Diese Option ist fix und kann nicht geändert werden.";

          return (
            <li
              key={name}
              className="text-muted-foreground flex items-center justify-between gap-4 py-3 pr-4 pl-9"
            >
              <span className="text-sm font-medium">{name}</span>
              <Tooltip label={hint}>
                <span className="inline-flex p-1.5">
                  <Lock aria-hidden className="size-4" />
                  <span className="sr-only">{hint}</span>
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ItemFormDialog({
  labels,
  item,
  onSubmit,
  onClose,
}: {
  labels: CrudLabels;
  item: CrudItem | null;
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
