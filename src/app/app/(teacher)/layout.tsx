/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { requireTeacher } from "@/lib/auth/guards";
import { TeacherNav } from "@/components/layout/teacher-nav";

// Guards the whole teacher area; the proxy check ahead of it is optimistic only.
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  await requireTeacher();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* The width lives on the nav, which is what decides whether it is collapsed. */}
      <aside className="border-border shrink-0 border-b md:border-r md:border-b-0">
        <TeacherNav />
      </aside>
      {/* min-w-0: without it the column is floored at the width of its widest table and the
          row overflows, so narrowing the bar beside it hands the content no room back. */}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
