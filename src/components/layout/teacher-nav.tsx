/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Database, FileText, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/layout/brand";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { masterDataSections } from "@/lib/master-data/categories";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import {
  liveSelection,
  selectedEventSeriesIdFrom,
} from "@/lib/event-series/event-series-selection";
import { reachablePages, type PageKey } from "@/lib/auth/reachable-pages";
import type { Permission } from "@/lib/auth/permissions";
import { eventSeriesRoutes, ROUTES } from "@/lib/routes";

function topLevel(eventSeriesId: string, reachable: readonly PageKey[]) {
  const routes = eventSeriesRoutes(eventSeriesId);
  return [
    {
      key: "registrations",
      href: routes.registrations,
      label: "Registrierungen",
      Icon: ClipboardList,
    },
    { key: "assignment", href: routes.assignment, label: "Zuteilungen", Icon: Shuffle },
    { key: "report", href: routes.report, label: "Berichte", Icon: FileText },
  ].filter((item) => reachable.includes(item.key as PageKey));
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
  permissions = [],
  photo = null,
}: {
  fallbackEventSeriesId?: string | null;
  permissions?: readonly Permission[];
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

  const { eventSeries } = useEventSeries();
  const selectedId = liveSelection(eventSeries, eventSeriesId);
  const reachable = reachablePages(permissions);

  /**
   * What sits under Stammdaten. The lists are one teacher's to maintain and the rights page is
   * the school's, so either permission can put something here and neither implies the other —
   * the heading is shown when something is beneath it.
   */
  const subItems = [
    ...(reachable.includes("masterData") ? masterDataSections(selectedId) : []),
    ...(reachable.includes("users")
      ? [{ href: `${ROUTES.appRoot}/users`, label: "Benutzerrechte" }]
      : []),
  ];

  // The heading has no view of its own, so it opens on the first entry beneath it — the event
  // series list where the lists are maintained, or the rights page for somebody who maintains none.
  const sectionHref = subItems[0]?.href;

  return (
    <nav aria-label="Hauptnavigation" className="flex h-full flex-col gap-1 p-2 md:w-56">
      {/* Heads the bar rather than the header, because the bar runs to the top of the window and
          the column beside it is where a page begins. */}
      <Brand />

      {(selectedId === null ? [] : topLevel(selectedId, reachable)).map(({ href, label, Icon }) => {
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

      {/* The section has no view of its own, so it opens on the first thing beneath it. */}
      {sectionHref === undefined ? null : (
        <>
          <Link href={sectionHref} className={itemClasses(inMasterData)}>
            <Database aria-hidden className="size-6 shrink-0" />
            <span>Stammdaten</span>
          </Link>

          <ul className="flex flex-col gap-1">
            {subItems.map(({ href, label }) => (
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
        </>
      )}

      {/* The foot of the bar: who is signed in. */}
      <div className="mt-auto">
        <SignOutButton className="min-h-9 w-full justify-start px-2 py-2" photo={photo} />
      </div>
    </nav>
  );
}
