/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { CircleUserRound } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Signing out, wearing the person who is signed in. It reads as a row of the navigation bar,
 * because that is where it sits for a teacher; a student has no bar and gets it in the header.
 */
export function SignOutButton({ labelHidden = false }: { labelHidden?: boolean }) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/session", { method: "DELETE" });
    await signOut(auth);
    router.push("/");
    router.refresh();
  }

  return (
    // No fill at all: a filled button marks what a page wants pressed, and signing out never is.
    <Button
      variant="ghost"
      className="min-h-9 w-full justify-start gap-3 px-2 py-2"
      onClick={handleSignOut}
    >
      <CircleUserRound aria-hidden className="size-6 shrink-0" />
      <span className={cn(labelHidden && "md:sr-only")}>Abmelden</span>
    </Button>
  );
}
