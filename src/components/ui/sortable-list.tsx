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
import { applyVisibleOrder } from "@/lib/schemas/position";
import { useDroppedOrder } from "@/lib/ui/use-dropped-order";
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
  /**
   * Which rows may be dragged. A row that may not keeps the index it already has, however the
   * rows around it are moved — dropping cannot push it somewhere it is not allowed to go.
   */
  movable?: (item: T) => boolean;
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
  movable = () => true,
  busyId = null,
  className,
}: SortableListProps<T>) {
  const { ordered, drop } = useDroppedOrder(items, onReorder);

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

    // The pinned rows keep the slots they already hold; the rest are dealt back into what is left.
    const moved = arrayMove(ordered, from, to).filter(movable);
    const next = applyVisibleOrder(
      ordered.map((item) => item.id),
      moved.map((item) => item.id),
    );
    if (next.join("\u0000") === ordered.map((item) => item.id).join("\u0000")) return;

    await drop(next);
  }

  if (disabled) {
    return (
      <ul className={className}>
        {items.map((item) => (
          <li key={item.id} className="flex items-center">
            <HandleSlot />
            <div className="min-w-0 flex-1">{renderItem(item)}</div>
          </li>
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
            <SortableRow
              key={item.id}
              item={item}
              movable={movable(item)}
              disabled={item.id === busyId}
            >
              {renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

const HANDLE_BOX = "ml-2 shrink-0 rounded-md p-1";

/** Where there is no handle its space is kept, so every row of a list is shaped the same. */
function HandleSlot() {
  return (
    <span aria-hidden className={HANDLE_BOX}>
      <GripVertical className="invisible size-4" />
    </span>
  );
}

function SortableRow({
  item,
  movable,
  disabled,
  children,
}: {
  item: SortableItem;
  movable: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: disabled || !movable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-center", isDragging && "bg-muted relative z-10 opacity-80")}
    >
      {movable ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={`${item.name} verschieben`}
          className={cn(
            HANDLE_BOX,
            "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 cursor-grab touch-none transition-colors outline-none focus-visible:ring-3 active:cursor-grabbing disabled:cursor-default disabled:opacity-50",
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      ) : (
        <HandleSlot />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
