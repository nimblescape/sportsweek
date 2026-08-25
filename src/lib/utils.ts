/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2023 shadcn
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 *
 * Adapted from shadcn/ui (https://ui.shadcn.com), MIT licensed.
 * See LICENSE and THIRD-PARTY-NOTICES.md in the repository root for details.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
