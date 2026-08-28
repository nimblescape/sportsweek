/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Brand } from "@/components/layout/brand";
import { BusyProvider } from "@/lib/api/busy";
import { BusyBar } from "@/components/layout/busy-bar";

/**
 * The frame both roles share (US-14, US-15). One grid rather than a header above a row of
 * columns, because the tags in the header and the heading of the page beneath them have to line
 * up: sharing a grid column is what makes that true at any width the bar happens to be, and the
 * bar's width is its own business — it decides whether it is collapsed.
 *
 * The bar spans both rows, so it runs to the top of the window and carries the brand itself.
 * A student is given none, and the brand sits in the header instead.
 *
 * A grid track is also a definite height, which is what lets the bar reach the foot of the
 * window — Safari will not resolve that from flex-grow. The header track sizes to its content,
 * so it grows when the tags wrap.
 */
export function AppShell({
  children,
  nav,
  scope,
}: {
  children: ReactNode;
  nav?: ReactNode;
  scope?: ReactNode;
}) {
  return (
    <BusyProvider>
      <div className="grid h-dvh grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        {nav ? (
          <div className="border-border bg-sidebar col-start-1 row-span-2 row-start-1 hidden shrink-0 border-r md:block">
            {nav}
          </div>
        ) : null}

        <header className="border-border bg-background col-start-2 row-start-1 flex items-center justify-between gap-4 border-b px-4 py-2 md:px-6">
          {nav ? null : <Brand />}
          {/* The scope leads the header, because it says what every page below it is about. */}
          {scope}
          {/* Where there is a bar, signing out sits at the foot of it, under the person's own
              mark. A student has no bar, so it stays here. */}
          {nav ? null : <SignOutButton />}
          {/* Last, and positioned against the header, whose bottom border it sits on. */}
          <BusyBar />
        </header>

        <main className="bg-background col-start-2 row-start-2 flex min-h-0 flex-col overflow-y-auto">
          {/* Narrow screens have no column for the bar, so it goes above what it points at. */}
          {nav ? <div className="border-border bg-sidebar border-b md:hidden">{nav}</div> : null}
          {children}
        </main>
      </div>
    </BusyProvider>
  );
}
