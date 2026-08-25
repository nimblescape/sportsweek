"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signInWithRedirect, signOut } from "firebase/auth";
import { auth, createMicrosoftAuthProvider } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

const ACCOUNT_NOT_ENABLED = "Dieses Konto ist für Sportsweek nicht freigeschaltet.";
const SIGN_IN_FAILED = "Anmelden fehlgeschlagen. Bitte versuchen Sie es erneut.";

// Sign-in itself only starts when the user clicks the button — same window, no popup.
// onAuthStateChanged reliably reports the signed-in user once Firebase resolves the
// redirect (relies on the /__/auth/* proxy in next.config.ts — see redirect-best-practices).
export function SignInButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // True until Firebase's first auth-state callback fires, which only happens once any
  // pending redirect has been resolved — avoids flashing the button during that window.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
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

        router.push(searchParams.get("next") ?? "/");
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-black">
      <h1 className="text-2xl font-semibold">SportsWeek</h1>
      <Image src="/htl-logo.svg" alt="HTL Dornbirn logo" width={80} height={94} />
      <Button onClick={handleSignIn} disabled={checking}>
        {checking ? "Anmelden…" : "Anmelden"}
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
