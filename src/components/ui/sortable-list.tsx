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

  // Once the stored order says the same thing, the local one has nothing left to add. Adjusted
  // during render rather than in an effect, which would show the list twice to say it once.
  const storedOrder = items.map((item) => item.id).join("\u0000");
  if (dropped !== null && dropped.join("\u0000") === storedOrder) setDropped(null);

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
            <SortableRow key={item.id} item={item}>
              {renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ item, children }: { item: SortableItem; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-center", isDragging && "bg-muted relative z-10 opacity-80")}
    >
      <button
        type="button"
        aria-label={`${item.name} verschieben`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 ml-2 shrink-0 cursor-grab touch-none rounded-md p-1 transition-colors outline-none focus-visible:ring-3 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
