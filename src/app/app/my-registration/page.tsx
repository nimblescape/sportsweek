/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth/guards";
import { Card, CardContent } from "@/components/ui/card";
import { REGISTRATION_NOT_OPEN_HINT } from "@/lib/registration/registration";
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
 */
export default async function MyRegistrationPage() {
  const user = await requireStudent();
  const studentUpn = (user.email ?? "").toLowerCase();

  const joined = await openSeriesOfStudent(studentUpn);
  // One is not a choice, so it is not put as one.
  if (joined.length === 1) redirect(`${ROUTES.myRegistration}/${joined[0].id}`);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardContent className="flex flex-col gap-3">
          {joined.length === 0 ? (
            <p role="status">{REGISTRATION_NOT_OPEN_HINT}</p>
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
    </div>
  );
}
