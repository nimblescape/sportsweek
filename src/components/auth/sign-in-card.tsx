"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import {
  OAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth, createMicrosoftAuthProvider } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES, homeFor } from "@/lib/routes";
import { userRoleSchema } from "@/lib/schemas/user";

const ACCOUNT_NOT_ENABLED = "Dieses Konto ist für Sportsweek nicht freigeschaltet.";
const SIGN_IN_FAILED = "Anmelden fehlgeschlagen. Bitte versuchen Sie es erneut.";

// Sign-in itself only starts when the user clicks the button — same window, no popup.
// onAuthStateChanged reliably reports the signed-in user once Firebase resolves the
// redirect (relies on the /__/auth/* proxy in next.config.ts — see redirect-best-practices).
export function SignInCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
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

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        await redirectSettled;
        const idToken = await user.getIdToken();
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, msAccessToken: graphAccessToken }),
        });

        // The UPN domain isn't eligible (US-3) — leave no half-authenticated client state behind.
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
        const role = userRoleSchema.safeParse(body?.role);

        router.push(
          searchParams.get("next") ?? (role.success ? homeFor(role.data) : ROUTES.appRoot),
        );
        router.refresh();
      } catch {
        setChecking(false);
        setError(SIGN_IN_FAILED);
      }
    });

    return () => unsubscribe();
  }, [router, searchParams]);

  async function handleSignIn() {
    setError(null);
    await signInWithRedirect(auth, createMicrosoftAuthProvider());
  }

  return (
    <div className="bg-muted/50 flex flex-1 items-center justify-center p-4">
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
          <p className="text-muted-foreground mt-2 text-sm">Sportwochen-Verwaltung</p>
          <Button className="mt-8 h-10 w-full" onClick={handleSignIn} disabled={checking}>
            Anmelden über Office 365
          </Button>
          {/* Always occupies its height, so the card doesn't resize when the spinner appears. */}
          <div data-slot="sign-in-status" className="mt-4 flex h-5 items-center justify-center">
            {checking ? (
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
    </div>
  );
}
