/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { BusyProvider } from "@/lib/api/busy";
import { BusyBar } from "@/components/layout/busy-bar";

/** Header row shared by the teacher dashboard (US-14) and the student view (US-15). */
export function AppShell({ children, scope }: { children: ReactNode; scope?: ReactNode }) {
  return (
    <BusyProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="border-border bg-background sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b px-4 py-2 md:px-6">
          <span className="font-heading text-xl font-semibold tracking-tight">Sportsweek</span>
          {/* The scope sits immediately after the title, because it says what every page is about. */}
          {scope}
          <SignOutButton />
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        {/* Outside the header: it centres on the screen, not on anything the shell lays out. */}
        <BusyBar />
      </div>
    </BusyProvider>
  );
}
