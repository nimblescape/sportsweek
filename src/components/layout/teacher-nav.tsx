/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Database, FileText, Shuffle, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/layout/brand";
import { BuildInfo } from "@/components/layout/build-info";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import {
  liveSelection,
  selectedEventSeriesIdFrom,
} from "@/lib/event-series/event-series-selection";
import { reachablePages, type PageKey } from "@/lib/auth/reachable-pages";
import type { Permission } from "@/lib/auth/permissions";
import { eventSeriesRoutes, ROUTES } from "@/lib/routes";

type NavItem = { key: PageKey; href: string; label: string; Icon: LucideIcon };

/**
 * The five entries, in one flat list. The first three are about one event series and are only
 * there while one is selected; the last two are about the school and are always reachable — the
 * master data hierarchy carries its own scope in the URL, and the rights page has none (US-33).
 */
function navItems(eventSeriesId: string | null, reachable: readonly PageKey[]): NavItem[] {
  const scoped = eventSeriesId === null ? null : eventSeriesRoutes(eventSeriesId);

  const all: NavItem[] = [
    ...(scoped === null
      ? []
      : [
          {
            key: "registrations" as const,
            href: scoped.registrations,
            label: "Registrierungen",
            Icon: ClipboardList,
          },
          {
            key: "assignment" as const,
            href: scoped.assignment,
            label: "Zuteilungen",
            Icon: Shuffle,
          },
          { key: "report" as const, href: scoped.report, label: "Berichte", Icon: FileText },
        ]),
    { key: "masterData", href: ROUTES.eventSeries, label: "Stammdaten", Icon: Database },
    { key: "users", href: ROUTES.users, label: "Benutzerrechte", Icon: Users },
  ];

  return all.filter((item) => reachable.includes(item.key));
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
 * The three scoped pages are built from the selection (US-20), which the URL names. On a page
 * that names none the layout above resolves one to fall back to — without it those three would
 * have nowhere to point (Q8).
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

  const { eventSeries } = useEventSeries();
  const selectedId = liveSelection(eventSeries, inUrl ?? lastSeen);
  const reachable = reachablePages(permissions);

  return (
    <nav aria-label="Hauptnavigation" className="flex h-full flex-col gap-1 p-2 md:w-56">
      {/* Heads the bar rather than the header, because the bar runs to the top of the window and
          the column beside it is where a page begins. */}
      <Brand />

      {navItems(selectedId, reachable).map(({ href, label, Icon }) => {
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

      {/* The foot of the bar: who is signed in, and which build they are signed in to. The rule
          is what makes the line read as the bar's footer rather than as something left under
          the button; it runs the full width by undoing the bar's own padding. */}
      <div className="mt-auto">
        <SignOutButton className="min-h-9 w-full justify-start px-2 py-2" photo={photo} />
        {/* The rule is pulled out to the bar's edges, so the line pays back everything between
            that edge and the button's label: the bar's 2, the button's 2, its 6-wide mark, its
            gap-3. */}
        <BuildInfo className="border-border -mx-2 mt-2 border-t pt-2 pr-2 pl-13" />
      </div>
    </nav>
  );
}
