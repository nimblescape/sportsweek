/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  ChevronDown,
  Database,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MASTER_DATA_SECTIONS } from "@/lib/master-data/categories";
import { ROUTES } from "@/lib/routes";

const TOP_LEVEL = [
  { href: ROUTES.report, label: "Bericht", Icon: FileText },
  { href: ROUTES.assignment, label: "Zuteilung", Icon: Shuffle },
  { href: ROUTES.statistics, label: "Statistik", Icon: ChartColumn },
] as const;

function itemClasses(active: boolean) {
  return cn(
    // A fixed height, because collapsing takes the label out of the flow: without it every row
    // would shrink to its icon and the whole bar would shift as it closes.
    "flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
    active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted",
  );
}

export function TeacherNav() {
  const pathname = usePathname();
  const inMasterData = pathname.startsWith(ROUTES.masterData);
  const [masterDataOpen, setMasterDataOpen] = useState(inMasterData);
  const [collapsed, setCollapsed] = useState(false);

  // Collapsing is offered where the bar is a column; on a narrow screen it is a strip across the
  // top, which is why the labels only go away from the same breakpoint the toggle appears at.
  const labelClasses = cn(collapsed && "md:sr-only");

  return (
    <nav
      aria-label="Hauptnavigation"
      className={cn("flex flex-col gap-1 p-3", collapsed ? "md:w-16" : "md:w-56")}
    >
      <button
        type="button"
        onClick={() => setCollapsed((on) => !on)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
        className={cn(itemClasses(false), "hidden md:flex md:justify-end")}
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden className="size-4 shrink-0" />
        ) : (
          <PanelLeftClose aria-hidden className="size-4 shrink-0" />
        )}
      </button>

      {TOP_LEVEL.map(({ href, label, Icon }) => {
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
        // Its sub-items need width to be read in, so asking for them asks for the bar back.
        onClick={() => {
          setCollapsed(false);
          setMasterDataOpen((open) => collapsed || !open);
        }}
        aria-expanded={masterDataOpen && !collapsed}
        title={collapsed ? "Stammdaten" : undefined}
        className={cn(itemClasses(inMasterData), "text-left")}
      >
        <Database aria-hidden className="size-4 shrink-0" />
        <span className={cn("flex-1", labelClasses)}>Stammdaten</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform",
            masterDataOpen && "rotate-180",
            collapsed && "md:hidden",
          )}
        />
      </button>

      {masterDataOpen && !collapsed ? (
        <ul className="flex flex-col gap-1 pl-3">
          {MASTER_DATA_SECTIONS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className={itemClasses(pathname === href)}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
