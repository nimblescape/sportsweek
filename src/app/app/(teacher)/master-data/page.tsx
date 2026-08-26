/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { redirect } from "next/navigation";
import { MASTER_DATA_SECTIONS } from "@/lib/master-data/categories";

// The section itself has no view; it opens on its first category.
export default function MasterDataIndexPage() {
  redirect(MASTER_DATA_SECTIONS[0].href);
}
