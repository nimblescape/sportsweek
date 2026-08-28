/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { normalizeName } from "@/lib/firebase/name-key";
import type { EventSeries } from "@/lib/schemas/event-series";

/**
 * An event series exactly as the document holds it — no id, since that lives in the path. The
 * seven maintained lists are fields of this document (US-21), so every service reading one parses
 * the whole shape; stating it once here is what keeps four service tests from each guessing.
 *
 * `nameKey` follows the name rather than being passed in: it is derived on every write, so a
 * fixture that let the two disagree would describe a document the application cannot produce.
 */
export function storedEventSeries(
  overrides: Partial<Omit<EventSeries, "id" | "nameKey">> = {},
): Omit<EventSeries, "id"> {
  const eventSeries = {
    name: "Wintersportwoche 2026",
    isActive: false,
    isArchived: false,
    hasRegistrations: false,
    position: 0,
    events: [],
    classOptions: [],
    programs: [],
    skillLevels: [],
    seasonPassOptions: [],
    busPickupPoints: [],
    foodOptions: [],
    ...overrides,
  };

  return { ...eventSeries, nameKey: normalizeName(eventSeries.name) };
}
