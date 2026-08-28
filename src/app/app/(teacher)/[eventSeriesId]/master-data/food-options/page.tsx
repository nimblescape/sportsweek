/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { MasterDataView } from "@/components/master-data/master-data-view";
import { FOOD_OPTION_OTHER_LABEL } from "@/lib/schemas/master-data";

const OTHER_HINT =
  "Diese Option steht immer zur Verfügung und kann nicht bearbeitet oder gelöscht werden. " +
  "Wer sie wählt, muss die Unverträglichkeit angeben.";

export default async function FoodOptionsPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const { eventSeriesId } = await params;

  return (
    <MasterDataView
      category="food-options"
      eventSeriesId={eventSeriesId}
      fixedItems={[FOOD_OPTION_OTHER_LABEL]}
      fixedItemsHint={OTHER_HINT}
    />
  );
}
