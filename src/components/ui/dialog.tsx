/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { X } from "lucide-react";
import { BusyBar } from "@/components/layout/busy-bar";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "default" | "destructive";
  className?: string;
};

/**
 * The dialog a popup has to be rendered into. `showModal()` puts the dialog in the top layer and
 * makes everything outside it inert, so a listbox portalled to the body opens dead: visible,
 * unclickable, and empty of anything the pointer can reach.
 */
const DialogContainerContext = React.createContext<HTMLElement | null>(null);

export function useDialogContainer() {
  return React.use(DialogContainerContext);
}

/**
 * Built on the native <dialog> element: the browser supplies the top layer, the focus trap
 * and Escape-to-close, so none of that has to be re-implemented (US-4).
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  tone = "default",
  className,
}: DialogProps) {
  // State rather than a ref, because what is portalled into it has to render again once it exists.
  const [element, setElement] = React.useState<HTMLDialogElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!element) return;

    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open, element]);

  if (!open) return null;

  return (
    <dialog
      ref={setElement}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      className={cn(
        "bg-card text-card-foreground ring-foreground/10 shadow-card relative m-auto w-[calc(100vw-(--spacing(8)))] max-w-md rounded-xl p-0 ring-1 backdrop:bg-black/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 p-4 pb-0">
        <h2
          id={titleId}
          className={cn(
            "font-heading text-base leading-snug font-medium",
            tone === "destructive" && "text-destructive",
          )}
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -m-1 rounded-lg p-1 transition-colors outline-none focus-visible:ring-3"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      {description ? (
        <div className="text-muted-foreground px-4 pt-2 text-sm">{description}</div>
      ) : null}

      <div className="p-4">
        <DialogContainerContext value={element}>{children}</DialogContainerContext>
      </div>

      {footer ? (
        <div className="bg-muted/50 relative flex items-center justify-end gap-2 border-t p-4">
          {/* The one in the header is behind the backdrop while this is open, and a dialog is
              where the slowest writes are started. Same indicator, on the line above the
              controls that started it. */}
          <BusyBar className="-top-1.5 bottom-auto" />
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
