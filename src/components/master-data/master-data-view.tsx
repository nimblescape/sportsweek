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
import { LoaderCircle, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { apiRequest, ApiRequestError } from "@/lib/api/client";
import { namedListItemSchema, type NamedListItem } from "@/lib/schemas/master-data";
import {
  categoryOf,
  IN_USE_HINT,
  type MasterDataCategory,
  type MasterDataCategoryKey,
} from "@/lib/master-data/categories";
import { useBlockedItemIds, useMasterData } from "@/lib/master-data/use-master-data";

const formSchema = z.object({ name: namedListItemSchema.shape.name });
type FormValues = z.infer<typeof formSchema>;

type OpenDialog =
  | { kind: "none" }
  | { kind: "form"; item: NamedListItem | null }
  | { kind: "delete"; item: NamedListItem };

type MasterDataViewProps = {
  category: MasterDataCategoryKey;
  /** Required for a nested list: the program its items belong to (US-5). */
  parentId?: string;
  /** Overrides the category title, so a nested list can name its parent. */
  title?: string;
  /** Rendered above the heading, e.g. the way back out of a nested list. */
  children?: React.ReactNode;
  /** Options offered to students that the teacher does not maintain, such as "Sonstiges" (US-9). */
  fixedItems?: readonly string[];
  fixedItemsHint?: string;
  /** One extra control per row, ahead of edit and delete — a program's equipment list uses it. */
  renderRowAction?: (item: NamedListItem) => React.ReactNode;
};

/**
 * The one CRUD list every teacher-maintained category uses (US-5 to US-10). Categories differ
 * only in their configuration — writing six near-identical views is exactly what the shared
 * pattern the requirements ask for rules out.
 */
export function MasterDataView({
  category: key,
  parentId,
  title,
  children,
  fixedItems = [],
  fixedItemsHint,
  renderRowAction,
}: MasterDataViewProps) {
  const category = categoryOf(key);
  const { items, loading, error } = useMasterData(key, parentId);
  const blockedIds = useBlockedItemIds(key);
  const [dialog, setDialog] = React.useState<OpenDialog>({ kind: "none" });

  const closeDialog = () => setDialog({ kind: "none" });

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {children}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-semibold">{title ?? category.labels.title}</h1>
        <Button onClick={() => setDialog({ kind: "form", item: null })}>
          <Plus aria-hidden data-icon="inline-start" />
          {category.labels.add}
        </Button>
      </div>

      <ItemList
        category={category}
        items={items}
        loading={loading}
        error={error}
        blockedIds={blockedIds}
        fixedItems={fixedItems}
        fixedItemsHint={fixedItemsHint}
        renderRowAction={renderRowAction}
        onEdit={(item) => setDialog({ kind: "form", item })}
        onDelete={(item) => setDialog({ kind: "delete", item })}
      />

      {dialog.kind === "form" ? (
        <ItemFormDialog
          key={dialog.item?.id ?? "new"}
          categoryKey={key}
          category={category}
          parentId={parentId}
          item={dialog.item}
          onClose={closeDialog}
        />
      ) : null}

      {dialog.kind === "delete" ? (
        <DeleteItemDialog
          key={dialog.item.id}
          categoryKey={key}
          category={category}
          item={dialog.item}
          onClose={closeDialog}
        />
      ) : null}
    </div>
  );
}

type ItemListProps = {
  category: MasterDataCategory;
  items: NamedListItem[];
  loading: boolean;
  error: string | null;
  blockedIds: Set<string>;
  fixedItems: readonly string[];
  fixedItemsHint?: string;
  renderRowAction?: (item: NamedListItem) => React.ReactNode;
  onEdit: (item: NamedListItem) => void;
  onDelete: (item: NamedListItem) => void;
};

function ItemList({
  category,
  items,
  loading,
  error,
  blockedIds,
  fixedItems,
  fixedItemsHint,
  renderRowAction,
  onEdit,
  onDelete,
}: ItemListProps) {
  const { title, singular, empty } = category.labels;

  if (loading) {
    return (
      <Card className="items-center">
        <div role="status" aria-label={`${title} werden geladen`} className="text-muted-foreground">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
        </div>
      </Card>
    );
  }

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
      <ul>
        {items.map((item) => {
          const blocked = blockedIds.has(item.id);
          const hintId = `${item.id}-in-use-hint`;

          return (
            <li
              key={item.id}
              className="border-border flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
            >
              <span className="text-sm font-medium">{item.name}</span>

              <div className="flex shrink-0 items-center gap-1">
                {renderRowAction?.(item)}

                {/* Wrapped in a span because a disabled button emits no pointer events, and the
                    reason it is disabled is exactly what needs explaining here. */}
                <Tooltip label={blocked ? IN_USE_HINT : "Bearbeiten"}>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={blocked}
                      aria-label={`${singular} ${item.name} bearbeiten`}
                      aria-describedby={blocked ? hintId : undefined}
                      onClick={() => onEdit(item)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  </span>
                </Tooltip>

                <Tooltip label={blocked ? IN_USE_HINT : "Löschen"}>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={blocked}
                      aria-label={`${singular} ${item.name} löschen`}
                      aria-describedby={blocked ? hintId : undefined}
                      onClick={() => onDelete(item)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                </Tooltip>

                {blocked ? (
                  <span id={hintId} className="sr-only">
                    {IN_USE_HINT}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}

        {/* Always offered to students and never a row of its own, so it carries no controls (US-9). */}
        {fixedItems.map((name) => (
          <li
            key={name}
            className="border-border text-muted-foreground flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <span className="text-sm font-medium">{name}</span>
            <Tooltip
              label={fixedItemsHint ?? "Diese Option ist fix und kann nicht geändert werden."}
            >
              <span className="inline-flex p-1.5">
                <Lock aria-hidden className="size-4" />
                <span className="sr-only">
                  {fixedItemsHint ?? "Diese Option ist fix und kann nicht geändert werden."}
                </span>
              </span>
            </Tooltip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ItemFormDialog({
  categoryKey,
  category,
  parentId,
  item,
  onClose,
}: {
  categoryKey: MasterDataCategoryKey;
  category: MasterDataCategory;
  parentId?: string;
  item: NamedListItem | null;
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

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (isEdit) {
        await apiRequest(`/api/master-data/${categoryKey}/${item.id}`, {
          method: "PATCH",
          body: values,
        });
      } else {
        await apiRequest(`/api/master-data/${categoryKey}`, {
          method: "POST",
          body: parentId === undefined ? values : { ...values, parentId },
        });
      }
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
    <Dialog
      open
      title={isEdit ? `${category.labels.singular} bearbeiten` : category.labels.add}
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

function DeleteItemDialog({
  categoryKey,
  category,
  item,
  onClose,
}: {
  categoryKey: MasterDataCategoryKey;
  category: MasterDataCategory;
  item: NamedListItem;
  onClose: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/api/master-data/${categoryKey}/${item.id}`, { method: "DELETE" });
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
      title={`${category.labels.singular} löschen`}
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
      <p className="text-sm">
        <strong>{item.name}</strong> wird aus der Liste entfernt. Bereits gespeicherte Schülerdaten
        bleiben unverändert.
      </p>
      {error ? (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
