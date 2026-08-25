"use client";

import { SeasonList } from "@/components/seasons/season-list";
import { useSeasons } from "@/lib/seasons/use-seasons";

export default function SeasonsPage() {
  const { seasons, loading, error } = useSeasons();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="font-heading text-lg font-semibold">Saisonen</h1>
      <SeasonList seasons={seasons} loading={loading} error={error} />
    </div>
  );
}
