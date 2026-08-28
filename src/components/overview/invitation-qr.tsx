/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

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
 * A surface of its own, carrying the two names and nothing else. The names are the point rather
 * than a leak — the room is about to register for exactly this series and this class, and naming
 * both is what stops a teacher enrolling one class into another. What is withheld is the rest of
 * the application: the header would otherwise name every series the school runs, and the
 * navigation would show a room full of students a teacher's tools. Everything beyond the two
 * names stays off it because a projector has poor contrast and a phone camera focuses on whatever
 * it finds first, so a quiet field around the code is what makes it scan first time.
 */
export function InvitationQr({ eventSeriesName, className, link, onClose }: InvitationQrProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-label={`${eventSeriesName}, ${className}`}
      className="bg-background text-foreground m-0 h-dvh max-h-none w-dvw max-w-none p-0"
    >
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="font-heading text-2xl font-semibold">{eventSeriesName}</p>
          <p className="text-xl">{className}</p>
        </div>

        {/* Sized to the screen it is shown on, and floored so it stays scannable on a phone. */}
        <QRCodeSVG
          value={link}
          role="img"
          aria-label={`Anmeldelink für ${className}`}
          className="h-auto w-[min(70vh,70vw)]"
          marginSize={2}
          level="M"
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-4 right-4 rounded-lg p-2 transition-colors outline-none focus-visible:ring-3"
      >
        <X aria-hidden className="size-6" />
      </button>
    </dialog>
  );
}
