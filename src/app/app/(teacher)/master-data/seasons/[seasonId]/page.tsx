import { EventsView } from "@/components/events/events-view";

export default async function SeasonEventsPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;

  return <EventsView seasonId={seasonId} />;
}
