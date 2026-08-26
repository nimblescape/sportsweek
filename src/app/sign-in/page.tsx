/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { Suspense } from "react";
import { SignInCard } from "@/components/auth/sign-in-card";
import { currentAuthMode } from "@/lib/auth/auth-mode";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInCard mode={currentAuthMode()} />
    </Suspense>
  );
}
