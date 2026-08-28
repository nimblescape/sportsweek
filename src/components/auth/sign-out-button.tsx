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
 * Signing out, wearing the mark of the person doing it. Where it sits decides its shape: a row
 * at the foot of the navigation bar for a teacher, a control on the right of the header for a
 * student, who has no bar.
 */
export function SignOutButton({
  className,
  labelHidden = false,
}: {
  className?: string;
  labelHidden?: boolean;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/session", { method: "DELETE" });
    await signOut(auth);
    router.push("/");
    router.refresh();
  }

  return (
    // No fill at all: a filled button marks what a page wants pressed, and signing out never is.
    <Button variant="ghost" className={cn("gap-3", className)} onClick={handleSignOut}>
      <CircleUserRound aria-hidden className="size-6 shrink-0" />
      <span className={cn(labelHidden && "md:sr-only")}>Abmelden</span>
    </Button>
  );
}
