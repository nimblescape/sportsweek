/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  OAuthProvider,
  getRedirectResult,
  onIdTokenChanged,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth, createMicrosoftAuthProvider } from "@/lib/firebase/client";
import { ROUTES, homeFor, safeDestination } from "@/lib/routes";
import { accountTypeSchema } from "@/lib/schemas/user";

const ACCOUNT_NOT_ENABLED = "Dieses Konto ist für Sportsweek nicht freigeschaltet.";
const SIGN_IN_FAILED = "Anmelden fehlgeschlagen. Bitte versuchen Sie es erneut.";

export type SignInSession = {
  destination: string;
  /** `microsoft.com` for a real sign-in, `custom` for an impersonated one. */
  signInProvider: string | null;
};

/**
 * Getting from a signed-in Firebase user to a session this app accepts.
 *
 * Everything a sign-in screen does that is not on screen, so that what *is* on screen can
 * differ between deployments without the exchange being written twice. Nothing is navigated
 * automatically: `session` says where the user is headed, `enter` takes them there, and
 * whoever renders this decides whether anything belongs in between.
 */
export function useSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SignInSession | null>(null);
  // True until Firebase's first auth-state callback fires, which only happens once any
  // pending redirect has been resolved — avoids flashing the button during that window.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // The Graph access token exists only in the redirect result, and only right after a
    // sign-in — an already-signed-in visitor simply posts without it.
    let graphAccessToken: string | undefined;
    const redirectSettled = getRedirectResult(auth)
      .then((result) => {
        if (result) {
          graphAccessToken = OAuthProvider.credentialFromResult(result)?.accessToken ?? undefined;
        }
      })
      .catch(() => undefined);

    // Tokens rather than sign-in state: impersonating yourself keeps the same uid, and
    // onAuthStateChanged only reports a *change* of user — it would stay silent exactly
    // when the impersonation dialog is waiting to hand over.
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }

      // A sign-in that happened in this page rather than by redirect leaves the screen idle
      // while the session is still being created.
      setChecking(true);

      try {
        await redirectSettled;
        const { token, signInProvider } = await user.getIdTokenResult();
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken: token,
            // The token describes the person who signed in through Entra ID. An impersonated
            // session reaches this same listener, and asking Graph with a token that is not
            // that session's would store the real user's name on the impersonated account.
            msAccessToken: signInProvider === "microsoft.com" ? graphAccessToken : undefined,
          }),
        });

        // The address's domain isn't eligible (US-3) — leave no half-authenticated client state behind.
        if (response.status === 403) {
          const body = await response.json().catch(() => null);
          await signOut(auth);
          setChecking(false);
          setError(body?.error?.message ?? ACCOUNT_NOT_ENABLED);
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to create session (status ${response.status})`);
        }

        const body = await response.json().catch(() => null);
        const role = accountTypeSchema.safeParse(body?.accountType);

        // Deliberately stays `checking`: there is a session now, so something is always
        // happening next — either navigating, or a step the caller puts in the way.
        setSession({
          destination: safeDestination(
            searchParams.get("next"),
            role.success ? homeFor(role.data) : ROUTES.appRoot,
          ),
          signInProvider,
        });
      } catch {
        setChecking(false);
        setError(SIGN_IN_FAILED);
      }
    });

    return () => unsubscribe();
  }, [searchParams]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await signInWithRedirect(auth, createMicrosoftAuthProvider());
    } catch {
      // Reached before the browser ever leaves, so failing quietly would look like a dead
      // button — `auth/unauthorized-domain` and an unconfigured provider both land here.
      setChecking(false);
      setError(SIGN_IN_FAILED);
    }
  }, []);

  const enter = useCallback(() => {
    if (!session) return;
    router.push(session.destination);
    router.refresh();
  }, [router, session]);

  return { checking, error, session, signIn, enter };
}
