/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

/**
 * Stands in for the real dialog in every build that has no fake login, so none of its markup
 * or strings reach the bundle. next.config.ts aliases the import here — see `fakeLogin`.
 * The sign-in card never renders it in that case, so returning null is unreachable anyway.
 */
export const FAKE_SIGN_IN_LABEL = null;

export function FakeSignInDialog(): null {
  return null;
}
