/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";

// Firebase forwards only `name` from Microsoft, never given_name/family_name, so the
// authoritative first/last name has to come from Graph itself (US-1).
const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me?$select=givenName,surname";

export type EntraName = { firstName: string; lastName: string };

/**
 * Reads the signed-in user's name from Microsoft Graph.
 * The access token comes from the browser but is never trusted — Graph rejects a forged
 * one, so a `null` result simply means the name could not be established.
 */
export async function fetchEntraName(accessToken: string): Promise<EntraName | null> {
  try {
    const response = await fetch(GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`Microsoft Graph /me returned ${response.status}`);
      return null;
    }

    const profile: unknown = await response.json();
    const { givenName, surname } = (profile ?? {}) as { givenName?: unknown; surname?: unknown };
    const firstName = typeof givenName === "string" ? givenName.trim() : "";
    const lastName = typeof surname === "string" ? surname.trim() : "";

    return firstName && lastName ? { firstName, lastName } : null;
  } catch (err) {
    console.error("Microsoft Graph /me request failed:", err);
    return null;
  }
}
