/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Gender } from "@/lib/schemas/common";
import type { Relationship } from "@/lib/schemas/registration";

/**
 * How a registration's stored answers read in German. Written down once because the form asks
 * the questions (US-11) and the report answers them (US-13), and a value that reads one way in
 * one place and another way in the other is two answers to the same question.
 */
export const GENDER_LABELS: Record<Gender, string> = {
  male: "Männlich",
  female: "Weiblich",
};

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  mother: "Mutter",
  father: "Vater",
  other: "Sonstiges",
};

/** "Nein" first, because that is where an unanswered registration starts (US-11). */
export const YES_NO_LABELS = { false: "Nein", true: "Ja" } as const;

export const yesNo = (value: boolean): string => YES_NO_LABELS[value ? "true" : "false"];

/** Not an answer a student gives, but the flag the server derives from them (US-11, US-13). */
export const COMPLETENESS_LABELS = {
  complete: "Vollständig",
  incomplete: "Unvollständig",
} as const;

/**
 * How the report marks a registration that still has answers outstanding — on the master line,
 * on the printed copy, and as the tag that narrows the report to exactly those (US-13). One
 * wording, because three ways of saying it would be three things to keep in step.
 */
export const INCOMPLETE_REGISTRATION_HINT = "Registrierung unvollständig";
