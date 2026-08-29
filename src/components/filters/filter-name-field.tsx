/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The name field every filter row is headed by: a search box with a clear button inside it
 * (US-12, US-13, US-30). Shared because the placement of that button is the fiddly part, and
 * because two rows that looked slightly different would look like a mistake.
 */
export function FilterNameField({
  label,
  value,
  onChange,
}: {
  /** Prefixes the accessible names: two rows can share a page, and each needs its own. */
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        // Not type="search": WebKit draws its own clear button for that, next to ours.
        type="text"
        aria-label={`${label}: Name`}
        placeholder="Name suchen"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pr-8"
      />
      {value !== "" && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${label}: Name zurücksetzen`}
          onClick={() => onChange("")}
          className="absolute inset-y-0 right-0.5 my-auto"
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
