/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortableItem = { id: string; name: string };

type SortableListProps<T extends SortableItem> = {
  items: T[];
  /**
   * Receives the ids in their new order; only called when the order actually changed. Rejecting
   * puts the list back the way it was, so a failed save cannot leave a lie on screen.
   */
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  renderItem: (item: T) => React.ReactNode;
  /** Hides the handles, for a list that is read-only in its current state. */
  disabled?: boolean;
  /** The row a write is running on; its handle is locked until the write is answered. */
  busyId?: string | null;
  className?: string;
};

/**
 * The application's one drag-and-drop list (see Drag and Drop). Dragging starts from a grip
 * handle rather than the row, so the rest of the row keeps its own controls, and the handle is
 * always visible rather than revealed on hover — a hover-only control cannot be reached by touch.
 *
 * Pointer sensors rather than native HTML drag-and-drop, which touch devices do not implement;
 * the keyboard sensor is what keeps ordering usable without a pointer at all.
 */
export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  busyId = null,
  className,
}: SortableListProps<T>) {
  /**
   * The order the teacher just dropped, held until the stored data reflects it.
   *
   * Without this the list would flick back: the write goes through a Route Handler rather than
   * the client SDK, so there is no local echo to compensate with, and the subscription only
   * catches up a round trip later. In between, dropping would visibly undo itself.
   */
  const [dropped, setDropped] = React.useState<string[] | null>(null);

  // The local order speaks only for the items it was made from. Once the stored order agrees
  // about those — whatever else was added, removed or renamed alongside — it has nothing left
  // to say, and holding on to it would keep ordering the list by a list that no longer exists.
  // Adjusted during render rather than in an effect, which would show the list twice to say it
  // once.
  if (dropped !== null) {
    const storedIds = items.map((item) => item.id);
    const stillStored = dropped.filter((id) => storedIds.includes(id));
    const asStored = storedIds.filter((id) => dropped.includes(id));
    if (stillStored.join("\u0000") === asStored.join("\u0000")) setDropped(null);
  }

  const ordered = React.useMemo(() => {
    if (dropped === null) return items;

    const remaining = new Map(items.map((item) => [item.id, item]));
    const moved = dropped.flatMap((id) => {
      const item = remaining.get(id);
      if (!item) return [];
      remaining.delete(id);
      return [item];
    });

    // Anything added since the drop is kept, so a concurrent create cannot vanish from view.
    return [...moved, ...remaining.values()];
  }, [items, dropped]);

  const sensors = useSensors(
    // A short distance threshold, so a tap on a handle is not mistaken for the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;

    const from = ordered.findIndex((item) => item.id === active.id);
    const to = ordered.findIndex((item) => item.id === over.id);
    if (from === -1 || to === -1) return;

    const next = arrayMove(ordered, from, to).map((item) => item.id);
    setDropped(next);

    try {
      await onReorder(next);
    } catch {
      setDropped(null);
    }
  }

  if (disabled) {
    return (
      <ul className={className}>
        {items.map((item) => (
          <li key={item.id}>{renderItem(item)}</li>
        ))}
      </ul>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={(event) => void handleDragEnd(event)}
    >
      <SortableContext items={ordered} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {ordered.map((item) => (
            <SortableRow key={item.id} item={item} disabled={item.id === busyId}>
              {renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  item,
  disabled,
  children,
}: {
  item: SortableItem;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-center", isDragging && "bg-muted relative z-10 opacity-80")}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={`${item.name} verschieben`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 ml-2 shrink-0 cursor-grab touch-none rounded-md p-1 transition-colors outline-none focus-visible:ring-3 active:cursor-grabbing disabled:cursor-default disabled:opacity-50"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
