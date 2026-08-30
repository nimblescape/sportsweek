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

// Twice the 24px the mark is drawn at, so it stays sharp on a dense screen without carrying a
// photo nothing will ever use. Graph resizes; the original is whatever the tenant uploaded.
const PHOTO_SIZE = 48;

/**
 * Where a photo may be, in the order worth asking.
 *
 * Only Microsoft 365 keeps one in sizes. A photo held in Entra ID itself has whatever dimensions
 * it was uploaded with and answers 404 to every size — which is a missing thumbnail rather than a
 * missing photo, and asking only for the thumbnail is why an account that plainly has one came
 * back with none.
 */
const GRAPH_PHOTO_URLS = [
  `https://graph.microsoft.com/v1.0/me/photos/${PHOTO_SIZE}x${PHOTO_SIZE}/$value`,
  "https://graph.microsoft.com/v1.0/me/photo/$value",
] as const;

/** Well inside the 1 MiB a Firestore document holds, this being kept in one. */
export const MAX_PHOTO_BYTES = 64 * 1024;

/** What may be named in the data URL. Graph sends JPEG; the rest is what a browser can decode. */
const PHOTO_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** One address, answering with the photo it holds or with nothing. */
async function photoFrom(url: string, accessToken: string): Promise<string | null> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (response.status === 404) return null;
  if (!response.ok) {
    console.error(`Microsoft Graph ${url} returned ${response.status}`);
    return null;
  }

  // Named in a URL the browser will parse, so it is chosen from a list here rather than
  // repeated from the header, whatever the header happens to say.
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!PHOTO_TYPES.includes(type)) {
    console.error(`Microsoft Graph ${url} answered with ${type || "no type"}`);
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
    console.error(`Microsoft Graph ${url} answered with ${bytes.byteLength} bytes`);
    return null;
  }

  return `data:${type};base64,${bytes.toString("base64")}`;
}

/**
 * Reads the signed-in user's Entra photo, as a data URL.
 *
 * The bytes rather than an address, because Graph serves the photo to a bearer token and the
 * browser has none — the token belongs to the sign-in in progress and is not kept (US-1).
 * Null is the ordinary answer: plenty of accounts have no photo, and a decorative mark is not
 * worth failing a sign-in over.
 */
export async function fetchEntraPhoto(accessToken: string): Promise<string | null> {
  try {
    for (const url of GRAPH_PHOTO_URLS) {
      const photo = await photoFrom(url, accessToken);
      if (photo !== null) return photo;
    }

    // Said out loud because the record cannot show it: an account with no photo and a login that
    // never held a token to ask with both leave the same empty field behind.
    console.info("Microsoft Graph holds no photo for this account");
    return null;
  } catch (err) {
    console.error("Microsoft Graph /me/photo request failed:", err);
    return null;
  }
}
