/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { INVITATION_LINK_LABEL } from "@/lib/invitations/invitation-link";

type InvitationQrProps = {
  eventSeriesName: string;
  className: string;
  link: string;
  onClose: () => void;
};

/**
 * The invitation link as a code a class scans off a projector (US-29), which is what removes the
 * mailing step: quicker than any list of addresses, and it reaches the students who never read
 * school mail.
 *
 * Drawn here rather than fetched: a token in a URL handed to an image service is a token that
 * service holds, and holding the token is the whole of what enrols somebody.
 *
 * Put on the document rather than left where the press came from, because it opens out of a card
 * and a card clips what overflows it. White explicitly, not the page's background: a code is read
 * by a camera, and one drawn dark-on-dark in the evening theme does not scan at all.
 *
 * The surface carries the two names and nothing else. They are the point rather than a leak — the
 * room is about to register for exactly this series and this class, and reading the class off the
 * same screen the room is looking at is what stops a teacher enrolling one class into another.
 * What is withheld is the rest of the application: the header would otherwise name every series
 * the school runs, and the navigation would show a room full of students a teacher's tools.
 * Everything beyond the two names stays off because a projector has poor contrast and a phone
 * camera focuses on whatever it finds first.
 */
export function InvitationQr({ eventSeriesName, className, link, onClose }: InvitationQrProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${eventSeriesName}, ${className}`}
      // Written out rather than left to utilities: this is projected in front of a class, and a
      // utility that one stylesheet was not built with leaves a fixed box shrunk to its content.
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "1.5rem",
        background: "#fff",
        color: "#000",
      }}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="font-heading text-2xl font-semibold">{eventSeriesName}</p>
        <p className="text-xl">{className}</p>
      </div>

      {/* Sized by the viewport rather than by a utility, so a projected code fills what the room
          can see whichever way round the screen is. */}
      <QRCodeSVG
        value={link}
        role="img"
        aria-label={`${INVITATION_LINK_LABEL} für ${className}`}
        style={{ width: "min(60vh, 80vw)", height: "auto" }}
        marginSize={2}
        level="M"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        style={{ position: "absolute", top: "1rem", right: "1rem", padding: "0.5rem" }}
        className="rounded-lg text-black/50 transition-colors outline-none hover:text-black focus-visible:ring-3 focus-visible:ring-black/30"
      >
        <X aria-hidden className="size-6" />
      </button>
    </div>,
    document.body,
  );
}
