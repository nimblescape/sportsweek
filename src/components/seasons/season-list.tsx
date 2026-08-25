import { LoaderCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Season } from "@/lib/schemas/season";
import { SEASON_STATE_LABELS, seasonState } from "@/lib/seasons/season-state";

type SeasonListProps = {
  seasons: Season[];
  loading: boolean;
  error: string | null;
};

export function SeasonList({ seasons, loading, error }: SeasonListProps) {
  if (loading) {
    return (
      <Card className="items-center">
        <div role="status" aria-label="Saisonen werden geladen" className="text-muted-foreground">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p role="alert" className="text-destructive px-(--card-spacing) text-sm">
          Saisonen konnten nicht geladen werden.
        </p>
      </Card>
    );
  }

  if (seasons.length === 0) {
    return (
      <Card>
        <p className="text-muted-foreground px-(--card-spacing) text-sm">
          Es gibt noch keine Saison.
        </p>
      </Card>
    );
  }

  return (
    <Card className="[--card-spacing:--spacing(0)]">
      <ul>
        {seasons.map((season) => {
          const state = seasonState(season);
          return (
            <li
              key={season.id}
              className="border-border flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
            >
              <span className="text-sm font-medium">{season.name}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                  state === "active"
                    ? "bg-accent text-accent-foreground border-transparent"
                    : "text-muted-foreground",
                )}
              >
                {SEASON_STATE_LABELS[state]}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
