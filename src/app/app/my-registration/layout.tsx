/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { BuildInfo } from "@/components/layout/build-info";

/**
 * The column both of a student's landing places share (US-15, US-19). Capped rather than
 * stretched: the form is one column of short fields, and a line of inputs the full width of a
 * desktop screen is a long way from its own label.
 *
 * The build line is here rather than on either page because the one somebody reports from is
 * usually the one that says nothing is open.
 */
export default function MyRegistrationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-6">
      {children}
      {/* A student has no navigation bar to carry it, so it closes their page instead. */}
      <BuildInfo className="border-border border-t pt-4 text-center" />
    </div>
  );
}
