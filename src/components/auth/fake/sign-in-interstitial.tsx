/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import * as React from "react";
import { ImpersonationDialog } from "./impersonation-dialog";
import type { SignInInterstitialProps } from "@/components/auth/sign-in-interstitial";

/**
 * Offers to continue as somebody else, once a real sign-in has produced a session.
 *
 * Only a real one: a session that arrives carrying `custom` came *from* this dialog, so
 * stepping in again would loop. The card knows none of that — it defers to whatever
 * interstitial the build has, and this decides whether there is anything to show.
 */
function ImpersonationStep({ signInProvider, onDone }: SignInInterstitialProps) {
  // Impersonating signs a new user in, which comes back around as a fresh `custom` session —
  // but not immediately. Closing on the spot keeps the card showing progress in the meantime
  // rather than a dialog that has already done its work.
  const [handedOver, setHandedOver] = React.useState(false);
  const offered = signInProvider === "microsoft.com" && !handedOver;

  React.useEffect(() => {
    if (signInProvider !== "microsoft.com") onDone();
  }, [signInProvider, onDone]);

  if (!offered) return null;

  return <ImpersonationDialog open onCancel={onDone} onImpersonated={() => setHandedOver(true)} />;
}

/**
 * The name the seam is imported under. `next.config.ts` swaps this module in for
 * `@/components/auth/sign-in-interstitial`, so the export has to answer to that name — which
 * is what the test imports too, so a rename fails there before it fails a build.
 */
export { ImpersonationStep as SignInInterstitial };
