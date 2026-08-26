/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { ComponentType } from "react";

export type SignInInterstitialProps = {
  /** `microsoft.com` for a real sign-in, `custom` for one an interstitial itself produced. */
  signInProvider: string | null;
  /** Hands control back so the card navigates into the app. */
  onDone: () => void;
};

/**
 * The seam between signing in and entering the app.
 *
 * This is the production side of it, and there is nothing in between: null means the card
 * navigates as soon as a session exists. `next.config.ts` swaps this module for the fake
 * login's version only where that login is enabled — see `fakeLogin` there.
 *
 * The direction matters. Production is what a build resolves to by default, so the fake
 * implementation has to be switched *on* deliberately; were it the other way round, an alias
 * that silently stopped matching would ship impersonation to real users.
 */
export const SignInInterstitial: ComponentType<SignInInterstitialProps> | null = null;
