/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, ChevronLeft, ChevronRight, Database, FileText, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
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
    "flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
    active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted",
  );
}

/**
 * Every page but the event series list is about one series (US-20), so the links are built from
 * the selection. On that one page the URL names none, and the cookie says which series the
 * teacher was last in — without it the whole bar would have nowhere to point (Q8).
 */
export function TeacherNav({ lastEventSeriesId = null }: { lastEventSeriesId?: string | null }) {
  const pathname = usePathname();
  const eventSeriesId = selectedEventSeriesIdFrom(pathname) ?? lastEventSeriesId;
  const masterData = eventSeriesId === null ? null : eventSeriesRoutes(eventSeriesId).masterData;
  const inMasterData =
    pathname === ROUTES.eventSeries ||
    pathname.startsWith(`${ROUTES.eventSeries}/`) ||
    (masterData !== null && pathname.startsWith(masterData));
  const [collapsed, setCollapsed] = useState(false);

  // Collapsing is offered where the bar is a column; on a narrow screen it is a strip across the
  // top, which is why the labels only go away from the same breakpoint the toggle appears at.
  const labelClasses = cn(collapsed && "md:sr-only");

  return (
    <nav
      aria-label="Hauptnavigation"
      className={cn("flex flex-col gap-1 p-3 md:h-full", collapsed ? "md:w-16" : "md:w-56")}
    >
      {(eventSeriesId === null ? [] : topLevel(eventSeriesId)).map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? label : undefined}
            className={itemClasses(active)}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className={labelClasses}>{label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        // Its own section never folds, so the only thing left to ask of it is the width to read
        // that section in.
        onClick={() => setCollapsed(false)}
        title={collapsed ? "Stammdaten" : undefined}
        className={cn(itemClasses(inMasterData), "text-left")}
      >
        <Database aria-hidden className="size-4 shrink-0" />
        <span className={labelClasses}>Stammdaten</span>
      </button>

      {collapsed ? null : (
        <ul className="flex flex-col gap-1">
          {masterDataSections(eventSeriesId).map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className={itemClasses(pathname === href)}
              >
                {/* Stands in for the icon above it, so the text lines up by being laid out the
                    same way rather than by a padding that has to add up to the same number. */}
                <span aria-hidden className="size-4 shrink-0" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setCollapsed((on) => !on)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
        className={cn(itemClasses(false), "mt-auto hidden justify-end md:flex")}
      >
        {/* Points the way the bar is about to move. */}
        {collapsed ? (
          <ChevronRight aria-hidden className="size-4 shrink-0" />
        ) : (
          <ChevronLeft aria-hidden className="size-4 shrink-0" />
        )}
      </button>
    </nav>
  );
}
