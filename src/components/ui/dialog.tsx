/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { X } from "lucide-react";
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
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      className={cn(
        "bg-card text-card-foreground ring-foreground/10 shadow-card m-auto w-[calc(100vw-(--spacing(8)))] max-w-md rounded-xl p-0 ring-1 backdrop:bg-black/40",
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

      <div className="p-4">{children}</div>

      {footer ? (
        <div className="bg-muted/50 flex items-center justify-end gap-2 border-t p-4">{footer}</div>
      ) : null}
    </dialog>
  );
}
