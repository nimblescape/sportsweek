/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/**
 * Which sign-in screen this build has.
 *
 * Production is what a build resolves to by default, so a deployment that wants the fake
 * login has to opt in via `next.config.ts`; were it the other way round, an alias that
 * silently stopped matching would show impersonation to real users.
 */
export { SignInCard as SignInView } from "@/components/auth/sign-in-card";
