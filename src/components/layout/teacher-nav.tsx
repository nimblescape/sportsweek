/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MASTER_DATA_SECTIONS, ROUTES } from "@/lib/routes";

const TOP_LEVEL = [
  { href: ROUTES.report, label: "Bericht" },
  { href: ROUTES.assignment, label: "Zuteilung" },
] as const;

function itemClasses(active: boolean) {
  return cn(
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
    active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted",
  );
}

export function TeacherNav() {
  const pathname = usePathname();
  const inMasterData = pathname.startsWith(ROUTES.masterData);
  const [masterDataOpen, setMasterDataOpen] = useState(inMasterData);

  return (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-1 p-3">
      {TOP_LEVEL.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={itemClasses(active)}
          >
            {label}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setMasterDataOpen((open) => !open)}
        aria-expanded={masterDataOpen}
        className={cn(itemClasses(inMasterData), "justify-between text-left")}
      >
        Stammdaten
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", masterDataOpen && "rotate-180")}
        />
      </button>

      {masterDataOpen ? (
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
