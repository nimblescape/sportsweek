/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import { SignInLayout } from "@/components/auth/sign-in-layout";
import { ImpersonationDialog } from "./impersonation-dialog";
import { useSignIn } from "@/lib/auth/use-sign-in";

/**
 * Signing in to a test environment: Entra ID as a gate, and then a choice of who to be.
 *
 * A separate screen from the production one on purpose. It says where you are — the two are
 * otherwise indistinguishable, and a form that invents people should never be one careless
 * import away from the screen real users see.
 */
function FakeSignInCard() {
  const { checking, error, session, signIn, enter } = useSignIn();
  const [handedOver, setHandedOver] = useState(false);

  // Only a real sign-in earns the choice. A `custom` session came *from* the dialog below,
  // so asking again would loop.
  const atGate = session?.signInProvider === "microsoft.com";

  useEffect(() => {
    if (session && !atGate) enter();
  }, [session, atGate, enter]);

  return (
    <div className="bg-muted/50 flex flex-1 items-center justify-center p-4">
      <SignInLayout
        subtitle="Testumgebung"
        note={
          <p className="text-muted-foreground mt-4 text-center text-sm text-balance">
            Erfundene Daten, keine echten Schülerinnen und Schüler. Nach der Anmeldung können Sie
            als beliebige Person fortfahren.
          </p>
        }
        action="Anmelden über Office 365"
        onSignIn={signIn}
        busy={checking}
        error={error}
      />
      {atGate && !handedOver ? (
        <ImpersonationDialog open onCancel={enter} onImpersonated={() => setHandedOver(true)} />
      ) : null}
    </div>
  );
}

/**
 * The name the seam is imported under. `next.config.ts` swaps this module in for
 * `@/components/auth/sign-in-view`, so the export has to answer to that name.
 */
export { FakeSignInCard as SignInView };
