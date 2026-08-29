/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ReactNode } from "react";
import { requireTeacher } from "@/lib/auth/guards";

// Guards the whole teacher area; the proxy check ahead of it is optimistic only. The navigation
// bar is the shell's, because it shares a grid column with the pages below it.
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  await requireTeacher();

  return <>{children}</>;
}
