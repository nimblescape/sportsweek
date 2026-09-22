/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { Fragment, type ReactNode } from "react";
import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** A blank line starts a new paragraph; a single one is a line break within it. */
const PARAGRAPH_BREAK = "\n\n";
const LINE_BREAK = "\n";
const IS_URL = /^https?:\/\/\S+$/;

/** A URL an error names is something to follow, not something wrong — so it reads as a link. */
function renderMessage(text: string): ReactNode {
  return text.split(PARAGRAPH_BREAK).map((paragraph, paragraphIndex) => {
    const lines = paragraph.split(LINE_BREAK);
    return (
      <p key={paragraphIndex}>
        {lines.map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {IS_URL.test(line) ? (
              <a href={line} className="block text-blue-600 underline">
                {line}
              </a>
            ) : (
              line
            )}
            {lineIndex < lines.length - 1 &&
            !IS_URL.test(line) &&
            !IS_URL.test(lines[lineIndex + 1]) ? (
              <br />
            ) : null}
          </Fragment>
        ))}
      </p>
    );
  });
}

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
          <div role="alert" className="text-foreground mt-4 space-y-2 text-center text-sm">
            {renderMessage(error)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
