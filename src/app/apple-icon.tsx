/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Matches the HTL Dornbirn logo's red/white styling (see public/htl-logo.svg).
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#E4534D",
        borderRadius: 32,
      }}
    >
      <div style={{ color: "white", fontSize: 64, fontWeight: 700 }}>HTL</div>
    </div>,
    size,
  );
}
