/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { buildInfo } from "@/lib/build-info";
import { cn } from "@/lib/utils";

/**
 * Which build this is, for anyone reporting something odd about it. Quiet on purpose: it is
 * never what somebody came to the page for, and it has to be legible when it is.
 */
export function BuildInfo({ className }: { className?: string }) {
  const line = buildInfo();
  if (line === "") return null;

  return <p className={cn("text-muted-foreground truncate text-xs", className)}>{line}</p>;
}
