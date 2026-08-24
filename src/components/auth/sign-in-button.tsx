"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signInWithRedirect } from "firebase/auth";
import { auth, createMicrosoftAuthProvider } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

// Sign-in itself only starts when the user clicks the button — same window, no popup.
// onAuthStateChanged reliably reports the signed-in user once Firebase resolves the
// redirect (relies on the /__/auth/* proxy in next.config.ts — see redirect-best-practices).
export function SignInButton() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) return;

            try {
                const idToken = await user.getIdToken();
                const response = await fetch("/api/session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ idToken }),
                });
                if (!response.ok) {
                    throw new Error(
                        `Failed to create session (status ${response.status})`,
                    );
                }

                router.push(searchParams.get("next") ?? "/");
                router.refresh();
            } catch {
                setError("Sign-in failed. Please try again.");
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
            <Image
                src="/htl-logo.svg"
                alt="HTL Dornbirn logo"
                width={80}
                height={94}
            />
            <Button onClick={handleSignIn}>Sign in with Microsoft</Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
    );
}
