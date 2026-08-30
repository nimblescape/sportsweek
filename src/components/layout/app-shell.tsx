/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Brand } from "@/components/layout/brand";
import { BuildInfo } from "@/components/layout/build-info";
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
 * so it grows when the tags wrap, and the foot sizes to nothing where it holds nothing.
 */
export function AppShell({
  children,
  nav,
  scope,
  photo = null,
}: {
  children: ReactNode;
  nav?: ReactNode;
  scope?: ReactNode;
  photo?: string | null;
}) {
  return (
    <BusyProvider>
      <div className="grid h-dvh grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]">
        {nav ? (
          <div className="border-border bg-sidebar col-start-1 row-span-3 row-start-1 hidden shrink-0 border-r md:block">
            {nav}
          </div>
        ) : null}

        {/* Tighter on a phone, where this one row carries the brand, the scope and signing out:
            at 375px the gaps alone were the difference between fitting and scrolling sideways. */}
        <header className="border-border bg-background col-start-2 row-start-1 flex items-center gap-2 border-b px-4 py-2 sm:gap-4 md:px-6">
          {nav ? null : <Brand />}
          {/* The scope leads the header, because it says what every page below it is about. Its
              slot grows whether or not it has anything in it: a school with no event series yet
              would otherwise leave the row empty, and the indicator would report from the near
              end instead of the far one. */}
          <div className="flex min-w-0 flex-1 items-center">{scope}</div>
          {/* Where there is a bar, signing out sits at the foot of it, under the person's own
              mark. A student has no bar, so it stays here. */}
          {nav ? null : <SignOutButton photo={photo} />}
          {/* The indicator's own place at the far end, kept whether or not it is reporting, so
              the one thing that speaks for the whole app is always found where it was last. */}
          <div className="flex shrink-0 items-center">
            <BusyBar />
          </div>
        </header>

        <main className="bg-background col-start-2 row-start-2 flex min-h-0 flex-col overflow-y-auto">
          {/* Narrow screens have no column for the bar, so it goes above what it points at. */}
          {nav ? <div className="border-border bg-sidebar border-b md:hidden">{nav}</div> : null}
          {children}
        </main>

        {/* Only for the person whose bar is not carrying it. A strip of its own rather than a
            place in the header: the header is one row, and on a phone the build line was what
            pushed signing out off the right of the screen. It is a grid track, so it stays put
            while the form above it scrolls — which is what the header was chosen for. */}
        {nav ? null : (
          <BuildInfo className="border-border bg-background col-start-2 row-start-3 border-t px-4 py-2 text-center" />
        )}
      </div>
    </BusyProvider>
  );
}
