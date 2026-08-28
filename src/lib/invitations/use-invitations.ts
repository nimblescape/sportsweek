/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import type { Invitation } from "@/lib/schemas/invitation";

type InvitationState = {
  /** The class's live token, or null while it has never been invited. */
  tokenFor: (className: string) => string | null;
  /** That token, minting one first where the class has none — which opens the series (US-19). */
  linkFor: (className: string) => Promise<string>;
  /** A new token whatever the class held, which stops the previous one enrolling anybody. */
  regenerate: (className: string) => Promise<string>;
  loading: boolean;
  error: string | null;
};

/**
 * The invitation links of one event series (US-23, US-29).
 *
 * Read through a handler rather than a subscription, because nothing may read the collection
 * they live in: a rule grants a whole document to everyone it grants it to, and a token is the
 * enrolment itself. So they arrive once, and every mint keeps this copy in step.
 */
export function useInvitations(eventSeriesId: string): InvitationState {
  const [tokens, setTokens] = useState<ReadonlyMap<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const endpoint = `/api/event-series/${eventSeriesId}/invitations`;

  useEffect(() => {
    let current = true;

    apiRequest<{ invitations: Invitation[] }>(endpoint, { method: "GET" })
      .then((answer) => {
        if (!current) return;
        setTokens(new Map((answer?.invitations ?? []).map((one) => [one.class, one.token])));
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!current) return;
        setError(
          caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
        );
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [endpoint]);

  const mint = useCallback(
    async (className: string) => {
      const answer = await apiRequest<{ invitation: Invitation }>(endpoint, {
        method: "POST",
        body: { class: className },
      });
      const token = answer!.invitation.token;
      setTokens((held) => new Map(held).set(className, token));
      return token;
    },
    [endpoint],
  );

  const tokenFor = useCallback((className: string) => tokens.get(className) ?? null, [tokens]);

  const linkFor = useCallback(
    async (className: string) => tokens.get(className) ?? (await mint(className)),
    [tokens, mint],
  );

  return { tokenFor, linkFor, regenerate: mint, loading, error };
}
