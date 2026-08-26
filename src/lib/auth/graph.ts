/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";

// Firebase forwards only `name` from Microsoft, never given_name/family_name, so the
// authoritative first/last name has to come from Graph itself (US-1).
const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me?$select=givenName,surname";

/** Whichever of the two Entra holds; each is used on its own if the other is missing. */
export type EntraName = { firstName?: string; lastName?: string };

/**
 * Reads the signed-in user's name from Microsoft Graph.
 *
 * `givenName` is the first name and `surname` the last one, asked for by name so neither can be
 * confused for the other — unlike the display name, whose word order is the tenant's choice.
 * The access token comes from the browser but is never trusted: Graph rejects a forged one, so
 * `null` simply means the name could not be established.
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

    if (!firstName && !lastName) {
      console.error("Microsoft Graph /me holds neither givenName nor surname");
      return null;
    }

    return { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) };
  } catch (err) {
    console.error("Microsoft Graph /me request failed:", err);
    return null;
  }
}
