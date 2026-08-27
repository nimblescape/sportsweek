/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/session", { method: "DELETE" });
    await signOut(auth);
    router.push("/");
    router.refresh();
  }

  return (
    // Dark grey rather than the accent: the accent marks what a page wants pressed, and signing
    // out never is.
    <Button
      className="bg-foreground/75 text-background hover:bg-foreground/65 active:bg-foreground/60"
      onClick={handleSignOut}
    >
      Abmelden
    </Button>
  );
}
