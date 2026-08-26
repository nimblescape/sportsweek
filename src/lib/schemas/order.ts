/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { documentIdSchema } from "@/lib/schemas/common";

/** The ids of an ordered list, in the order the teacher dropped them into (see Ordering). */
export const orderSchema = z.array(documentIdSchema).max(500, "Zu viele Einträge.");
