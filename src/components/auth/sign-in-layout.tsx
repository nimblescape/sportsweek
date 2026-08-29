/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** The frame every sign-in screen shares — what stands inside it is what tells them apart. */
export function SignInLayout({
  subtitle,
  note,
  action,
  onSignIn,
  busy,
  error,
}: {
  subtitle: string;
  note?: ReactNode;
  action: string;
  onSignIn: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Card className="w-full max-w-md [--card-spacing:--spacing(8)]">
      <CardContent className="flex flex-col items-center">
        <Image
          src="/htl-logo.svg"
          alt="HTL Dornbirn Logo"
          width={102}
          height={120}
          priority
          className="mb-4"
        />
        <h1 className="font-heading text-center text-3xl font-bold tracking-tight text-balance">
          Sportsweek
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
        {note}
        <Button className="mt-8 h-10 w-full" onClick={onSignIn} disabled={busy}>
          {action}
        </Button>
        {/* Always occupies its height, so the card doesn't resize when the spinner appears. */}
        <div data-slot="sign-in-status" className="mt-4 flex h-5 items-center justify-center">
          {busy ? (
            // Icon-only, so the accessible name has to come from the label.
            <div role="status" aria-label="Anmelden" className="text-muted-foreground">
              <LoaderCircle aria-hidden className="size-5 animate-spin" />
            </div>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-destructive mt-4 text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
