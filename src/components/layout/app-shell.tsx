/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import Image from "next/image";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { BusyProvider } from "@/lib/api/busy";
import { BusyBar } from "@/components/layout/busy-bar";

/** Header row shared by the teacher dashboard (US-14) and the student view (US-15). */
export function AppShell({ children, scope }: { children: ReactNode; scope?: ReactNode }) {
  return (
    <BusyProvider>
      {/* A fixed height rather than a minimum, so the columns below can be as tall as the window
          and no taller — which is what lets the navigation bar reach the foot of the screen. */}
      <div className="flex h-dvh flex-col">
        <header className="border-border bg-background sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b px-4 py-2 md:px-6">
          <span className="flex shrink-0 items-center gap-2">
            <Image src="/htl-logo.svg" alt="HTL Dornbirn Logo" width={24} height={28} priority />
            <span className="font-heading text-xl font-semibold tracking-tight">Sportsweek</span>
          </span>
          {/* The scope sits immediately after the title, because it says what every page is about. */}
          {scope}
          <SignOutButton />
          {/* Last, and positioned against the header, whose bottom border it sits on. */}
          <BusyBar />
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </BusyProvider>
  );
}
