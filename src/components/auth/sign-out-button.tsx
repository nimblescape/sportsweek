/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { signOut } from "firebase/auth";
import { CircleUserRound } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Signing out, wearing the mark of the person doing it. Where it sits decides its shape: a row
 * at the foot of the navigation bar for a teacher, a control on the right of the header for a
 * student, who has no bar.
 *
 * The mark is the Entra photo where the account has one, read at sign-in and kept on the record
 * (US-1) — Graph serves it to a bearer token, which the browser does not have.
 */
export function SignOutButton({
  className,
  labelHidden = false,
  photo = null,
}: {
  className?: string;
  labelHidden?: boolean;
  photo?: string | null;
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
      {photo === null ? (
        <CircleUserRound aria-hidden className="size-6 shrink-0" />
      ) : (
        // The button is already named, so the photo adds nothing by being described again.
        <Image
          src={photo}
          alt=""
          width={24}
          height={24}
          className="size-6 shrink-0 rounded-full object-cover"
        />
      )}
      <span className={cn(labelHidden && "md:sr-only")}>Abmelden</span>
    </Button>
  );
}
