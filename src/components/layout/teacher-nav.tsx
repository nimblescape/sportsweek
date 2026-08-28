/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, Database, FileText, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/layout/brand";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { masterDataSections } from "@/lib/master-data/categories";
import { selectedEventSeriesIdFrom } from "@/lib/event-series/event-series-selection";
import { eventSeriesRoutes, ROUTES } from "@/lib/routes";

function topLevel(eventSeriesId: string) {
  const routes = eventSeriesRoutes(eventSeriesId);
  return [
    { href: routes.overview, label: "\u00dcbersicht", Icon: ChartColumn },
    { href: routes.assignment, label: "Zuteilung", Icon: Shuffle },
    { href: routes.report, label: "Bericht", Icon: FileText },
  ];
}

function itemClasses(active: boolean) {
  return cn(
    // A fixed height, because collapsing takes the label out of the flow: without it every row
    // would shrink to its icon and the whole bar would shift as it closes.
    "flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
    active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted",
  );
}

/**
 * Every page but the event series list is about one series (US-20), so the links are built from
 * the selection. On that one page the URL names none, and the layout above resolves one to fall
 * back to — without it the whole bar would have nowhere to point (Q8).
 */
export function TeacherNav({
  fallbackEventSeriesId = null,
  photo = null,
}: {
  fallbackEventSeriesId?: string | null;
  photo?: string | null;
}) {
  const pathname = usePathname();
  const inUrl = selectedEventSeriesIdFrom(pathname);
  // The fallback is resolved by a layout above the series id, which does not render again while
  // the teacher moves about below it, so what the bar has seen since is the fresher answer.
  const [lastSeen, setLastSeen] = useState(fallbackEventSeriesId);
  if (inUrl !== null && inUrl !== lastSeen) setLastSeen(inUrl);

  const eventSeriesId = inUrl ?? lastSeen;
  const masterData = eventSeriesId === null ? null : eventSeriesRoutes(eventSeriesId).masterData;
  const inMasterData =
    pathname === ROUTES.eventSeries ||
    pathname.startsWith(`${ROUTES.eventSeries}/`) ||
    (masterData !== null && pathname.startsWith(masterData));
  const sections = masterDataSections(eventSeriesId);

  return (
    <nav aria-label="Hauptnavigation" className="flex h-full flex-col gap-1 p-2 md:w-56">
      {/* Heads the bar rather than the header, because the bar runs to the top of the window and
          the column beside it is where a page begins. */}
      <Brand />

      {(eventSeriesId === null ? [] : topLevel(eventSeriesId)).map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={itemClasses(active)}
          >
            <Icon aria-hidden className="size-6 shrink-0" />
            <span>{label}</span>
          </Link>
        );
      })}

      {/* The section has no view of its own, so it opens on the first list beneath it. */}
      <Link href={sections[0].href} className={itemClasses(inMasterData)}>
        <Database aria-hidden className="size-6 shrink-0" />
        <span>Stammdaten</span>
      </Link>

      <ul className="flex flex-col gap-1">
        {sections.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={itemClasses(pathname === href)}
            >
              {/* Stands in for the icon above it, so the text lines up by being laid out the
                  same way rather than by a padding that has to add up to the same number. */}
              <span aria-hidden className="size-6 shrink-0" />
              {label}
            </Link>
          </li>
        ))}
      </ul>

      {/* The foot of the bar: who is signed in. */}
      <div className="mt-auto">
        <SignOutButton className="min-h-9 w-full justify-start px-2 py-2" photo={photo} />
      </div>
    </nav>
  );
}
