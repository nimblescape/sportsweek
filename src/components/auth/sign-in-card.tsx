/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect } from "react";
import { SignInLayout } from "@/components/auth/sign-in-layout";
import { useSignIn } from "@/lib/auth/use-sign-in";

/** Signing in to Sportsweek: Entra ID, and then the app. */
export function SignInCard() {
  const { checking, error, session, signIn, enter } = useSignIn();

  useEffect(() => {
    if (session) enter();
  }, [session, enter]);

  return (
    <div className="bg-muted/50 flex flex-1 items-center justify-center p-4">
      <SignInLayout
        subtitle="Sportwochen-Verwaltung"
        action="Anmelden über Office 365"
        onSignIn={signIn}
        busy={checking}
        error={error}
      />
    </div>
  );
}
