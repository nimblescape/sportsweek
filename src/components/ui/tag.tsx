/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import {
  createContext,
  use,
  type ComponentProps,
  type CSSProperties,
  type PointerEventHandler,
  type ReactNode,
  type Ref,
} from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A tag: a pill naming one thing, and carrying whatever can be done to it. Every row of them is
 * built from these — the report's filters and fields, the saved reports, the event series in the
 * header — so a tag looks and behaves alike wherever it is (US-13, US-19, US-20).
 *
 * Three parts, in this order, and a tag may leave any of them out. The plainest has only a name:
 *
 *   <Tag pressed variant="open">
 *     <DoorOpen aria-label="offen" />          the lead: what it is, or a grip to move it by
 *     <TagName label="Wintersportwoche" … />   the name, and the button the tag is pressed by
 *     <TagAction label="schließen">…</…>       what it offers, once it is the pressed one
 *   </Tag>
 *
 * A box rather than a button, because a tag carries controls of its own and a button may not
 * contain one.
 */

/**
 * Whether the tag is pressed, and whether the row it sits in is waiting on a write. Its parts
 * read this rather than being told it again: the fill and `aria-pressed` are one fact, and a tag
 * whose colour disagreed with its name would be saying two things at once.
 */
type TagState = { pressed: boolean; disabled: boolean };

const TagContext = createContext<TagState>({ pressed: false, disabled: false });

/**
 * How a tag is filled. Green is the one state worth spotting across the room, blue is simply
 * the chosen one, grey is chosen but standing apart from the rest — a template among series, a
 * report edited since it was opened. Each is filled when the tag is pressed and outlined when it
 * is not, which is what makes five states out of three: an open series stays green either way,
 * because whether students can register is worth seeing whether or not you are working in it.
 */
export type TagVariant = "default" | "open" | "neutral" | "template";

/** Green and amber survive being unpressed; nothing else has anything to say once it is not chosen. */
const SOFT = { open: "open-soft", template: "template-soft" } as const;

const unpressed = (variant: TagVariant) =>
  variant in SOFT ? SOFT[variant as keyof typeof SOFT] : ("outline" as const);

type TagProps = {
  pressed?: boolean;
  variant?: TagVariant;
  /** Held while a write of the row's is out, so a second press cannot follow the first. */
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  /** A tag in a sortable list is positioned by its box rather than by the name inside it. */
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  onPointerDown?: PointerEventHandler;
};

export function Tag({
  pressed = false,
  variant = "default",
  disabled = false,
  children,
  className,
  ref,
  style,
  onPointerDown,
}: TagProps) {
  return (
    <TagContext value={{ pressed, disabled }}>
      <div
        ref={ref}
        style={style}
        onPointerDown={onPointerDown}
        className={cn(
          buttonVariants({ variant: pressed ? variant : unpressed(variant) }),
          "gap-1 px-1.5",
          className,
        )}
      >
        {children}
      </div>
    </TagContext>
  );
}

type TagNameProps = {
  /** The accessible name, which says which row the tag belongs to; the row carries no heading. */
  label: string;
  text?: string;
  describedBy?: string;
  onPress: () => void;
  onPointerDown?: PointerEventHandler;
};

export function TagName({
  label,
  text = label,
  describedBy,
  onPress,
  onPointerDown,
}: TagNameProps) {
  const { pressed, disabled } = use(TagContext);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-describedby={describedBy}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onClick={onPress}
      className="focus-visible:ring-ring/50 max-w-60 truncate rounded-md px-0.5 outline-none focus-visible:ring-3 disabled:opacity-50"
    >
      {text}
    </button>
  );
}

/**
 * The name while it is being typed, standing where the name button stood. The tag draws the
 * border and the surface, so the field draws neither: two borders one inside the other read as
 * two fields.
 */
export function TagField({ className, ...props }: ComponentProps<typeof Input>) {
  const { disabled } = use(TagContext);

  return (
    <Input
      disabled={disabled}
      className={cn(
        "h-[calc(var(--control-height)-var(--spacing))] w-40 rounded-md border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

type TagActionProps = {
  /** What pressing it does, in words: the icon says it only to those who can see it. */
  label: string;
  type?: "button" | "submit";
  onClick?: () => void;
  children: ReactNode;
};

/**
 * One of the things the tag offers. The tag owns the surface and the colour on it, so the
 * control takes neither — a second fill inside the first would read as a tag within a tag.
 */
export function TagAction({ label, type = "button", onClick, children }: TagActionProps) {
  const { disabled } = use(TagContext);

  return (
    <Button
      type={type}
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="hover:bg-transparent hover:text-inherit hover:opacity-70"
    >
      {children}
    </Button>
  );
}
