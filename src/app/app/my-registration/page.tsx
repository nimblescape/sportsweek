/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth/guards";
import { Card, CardContent } from "@/components/ui/card";
import { INVALID_LINK_HINT, REGISTRATION_NOT_OPEN_HINT } from "@/lib/registration/registration";
import { openSeriesOfStudent } from "@/lib/registration/student-series";
import { ROUTES } from "@/lib/routes";

export const CHOOSE_EVENT_SERIES_LABEL = "Welche Registrierung möchtest du bearbeiten?";

/**
 * Where a student goes when they sign in, and the only place that decides it (Q7).
 *
 * Read from what they hold rather than from anything they are carrying: following the link is
 * what joined them (US-23), so the registration is already there to be found. One, in the
 * ordinary case, because the years before it are closed and so are history rather than in the
 * way. Where a Wintersportwoche and a Kulturwoche are taking registrations at once there is a
 * real question, and it is asked: a form is reached only after saying which of them was meant.
 *
 * `invalid` is the one fact the join route knows that this page otherwise could not: the link
 * that sent a student here did not lead anywhere, which reads differently from a student with
 * nothing joined arriving on their own.
 */
export default async function MyRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  const user = await requireStudent();
  const { invalid } = await searchParams;

  const joined = await openSeriesOfStudent(user.uid);
  // One is not a choice, so it is not put as one.
  if (joined.length === 1) redirect(`${ROUTES.myRegistration}/${joined[0].id}`);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {joined.length === 0 ? (
          <p role="status">{invalid === "1" ? INVALID_LINK_HINT : REGISTRATION_NOT_OPEN_HINT}</p>
        ) : (
          <>
            <p>{CHOOSE_EVENT_SERIES_LABEL}</p>
            <ul className="flex flex-col gap-2">
              {joined.map((eventSeries) => (
                <li key={eventSeries.id}>
                  <Link
                    href={`/app/my-registration/${eventSeries.id}`}
                    className="text-primary underline underline-offset-4"
                  >
                    {eventSeries.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
