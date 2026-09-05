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
import { Lock, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusyRegion } from "@/components/ui/busy-region";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NameForm } from "@/components/ui/name-form";
import { SortableList } from "@/components/ui/sortable-list";
import { Tooltip } from "@/components/ui/tooltip";
import { RecordHeader } from "@/components/master-data/record-header";
import { ApiRequestError } from "@/lib/api/client";
import { useRowAction } from "@/lib/api/use-row-action";
import { listItemNameSchema } from "@/lib/schemas/master-data";
import type { Crumb, RecordTab } from "@/lib/master-data/hierarchy";
import { IN_USE_HINT, USAGE_PENDING_HINT } from "@/lib/master-data/categories";

const formSchema = z.object({ name: listItemNameSchema });
type FormValues = z.infer<typeof formSchema>;

const NAME_LABEL = "Name";
const ADD_LABEL = "Anlegen";

/** An item has no id of its own: its name is what identifies it within its list (US-21). */
export type CrudItem = { id: string; name: string };

export type CrudLabels = {
  title: string;
  singular: string;
  add: string;
  empty: string;
};

type OpenDialog =
  { kind: "none" } | { kind: "edit"; item: CrudItem } | { kind: "delete"; item: CrudItem };

type CrudListProps = {
  /** The path down to the record on screen, ending at it (US-33). */
  trail: readonly Crumb[];
  /** The record the screen is about — a series, or the program whose equipment this is. */
  title: string;
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
  /** One extra control per row, ahead of edit and delete — the programs list uses it. */
  renderRowAction?: (item: CrudItem, options: { disabled: boolean }) => React.ReactNode;
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
  title,
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
  renderRowAction,
  onSubmit,
  onDelete,
  onReorder,
  deleteNote,
  editNote,
}: CrudListProps) {
  const [dialog, setDialog] = React.useState<OpenDialog>({ kind: "none" });
  // Held against the tab it was opened on, so walking to another collection closes it by itself.
  const [addingUnder, setAddingUnder] = React.useState<string | null>(null);
  const { busyId, pending, run } = useRowAction();

  const closeDialog = () => setDialog({ kind: "none" });

  // A write started from a row holds that row until it is answered, and every write holds the
  // list. The list refreshes from a separate subscription, so until then the other controls
  // would act on data this write may already have changed. A new item has no row to hold.
  const submit = (name: string, item: CrudItem | null) =>
    run(item?.id ?? null, () => onSubmit(name, item));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <BusyRegion busy={pending}>
        <div className="flex flex-col gap-4">
          <RecordHeader
            trail={trail}
            title={title}
            tabs={tabs}
            marked={marked}
            disabled={pending}
            onAdd={() => {
              closeDialog();
              setAddingUnder(marked);
            }}
          />

          {addingUnder === marked ? (
            <NameForm
              schema={listItemNameSchema}
              label={NAME_LABEL}
              submitLabel={ADD_LABEL}
              pending={pending}
              onSubmit={async (name) => {
                await submit(name, null);
                setAddingUnder(null);
              }}
              onCancel={() => setAddingUnder(null)}
            />
          ) : null}

          <ItemList
            labels={labels}
            items={items}
            loading={loading}
            error={error}
            blockedIds={blockedIds}
            usagePending={usagePending}
            undeletableIds={undeletableIds}
            undeletableHint={undeletableHint}
            fixedItems={fixedItems}
            fixedItemsHint={fixedItemsHint}
            renderRowAction={renderRowAction}
            busyId={busyId}
            onEdit={(item) => {
              setAddingUnder(null);
              setDialog({ kind: "edit", item });
            }}
            onDelete={(item) => {
              setAddingUnder(null);
              setDialog({ kind: "delete", item });
            }}
            onReorder={(orderedIds) => run(null, async () => onReorder(orderedIds))}
          />
        </div>
      </BusyRegion>

      {dialog.kind === "edit" ? (
        <EditItemDialog
          key={dialog.item.id}
          labels={labels}
          item={dialog.item}
          note={editNote(dialog.item)}
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
  Pick<
    CrudListProps,
    "labels" | "items" | "loading" | "blockedIds" | "usagePending" | "undeletableIds"
  >
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
  usagePending,
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
          const locked = usagePending || blockedIds.has(item.id);
          const undeletable = locked || undeletableIds.has(item.id);
          const lockedHint = usagePending ? USAGE_PENDING_HINT : IN_USE_HINT;
          const deleteHint = locked ? lockedHint : undeletableHint;
          const hintId = `${item.id}-in-use-hint`;

          return (
            <div className="flex items-center justify-between gap-4 py-3 pr-4 pl-2">
              <span className="truncate text-sm font-medium">{item.name}</span>

              <div className="flex shrink-0 items-center gap-1">
                {renderRowAction?.(item, { disabled: busy })}

                {/* Wrapped in a span because a disabled button emits no pointer events, and the
                    reason it is disabled is exactly what needs explaining here. */}
                <Tooltip label={locked ? lockedHint : "Bearbeiten"}>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={locked || busy}
                      aria-label={`${singular} ${item.name} bearbeiten`}
                      aria-describedby={locked ? hintId : undefined}
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
                      size="icon"
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

function EditItemDialog({
  labels,
  item,
  note,
  onSubmit,
  onClose,
}: {
  labels: CrudLabels;
  item: CrudItem;
  note: React.ReactNode;
  onSubmit: (name: string, item: CrudItem | null) => Promise<void>;
  onClose: () => void;
}) {
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
    defaultValues: { name: item.name },
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
    <Dialog open title={`${labels.singular} bearbeiten`} onClose={onClose}>
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
            Speichern
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
