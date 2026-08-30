/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";

const PHONE_MESSAGE = "Bitte im internationalen Format angeben, z. B. +43 660 1234567.";

/** International (E.164) format; spaces, slashes and dashes are allowed for readability. */
export const phoneNumberSchema = z
  .string()
  .trim()
  .refine((value) => /^\+[1-9][\d\s/-]*$/.test(value), PHONE_MESSAGE)
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }, PHONE_MESSAGE);

export const requiredText = (max = 200) =>
  z.string().trim().min(1, "Pflichtfeld.").max(max, `Höchstens ${max} Zeichen.`);

export const optionalText = (max = 2000) =>
  z.string().trim().max(max, `Höchstens ${max} Zeichen.`).nullable();

/**
 * An id as it is stored, never repaired: trimming or folding one is how a caller's identifier
 * comes to name a document that is not theirs, or none at all.
 */
export const documentIdSchema = z
  .string()
  .min(1, "Pflichtfeld.")
  .refine((value) => value.trim() === value, "Eine Dokument-ID hat keine Leerzeichen am Rand.")
  .refine((value) => !value.includes("/"), "Eine Dokument-ID darf keinen Pfad enthalten.");

declare const uid: unique symbol;

/**
 * The Firebase uid a person's records are keyed by (US-31), as against the address they are also
 * known by. Both are strings, and the compiler let one stand where the other belonged until a
 * comparison quietly stopped matching — the brand is what makes that a type error.
 *
 * It exists only in the types: what is carried is the id itself, and `asUid` is the one way in
 * for a string whose origin the compiler cannot see.
 */
export type Uid = string & { readonly [uid]: true };

export const uidSchema = documentIdSchema.transform((value) => value as Uid);

/** For a uid arriving from outside the type system — a token claim, a document id. */
export const asUid = (value: string): Uid => uidSchema.parse(value);

/**
 * A teacher-maintained list value copied onto a record as plain text (US-11).
 * Deliberately a string, never a document reference, so later list edits leave records untouched.
 */
export const snapshotValueSchema = requiredText(120);

export const genderSchema = z.enum(["male", "female"]);
export type Gender = z.infer<typeof genderSchema>;

export const isoDateSchema = z.iso.date();

/** The comparison unique names use everywhere: trimmed and case-folded, accents preserved. */
export function hasUniqueNames(names: readonly string[]): boolean {
  const normalized = names.map((name) => name.trim().toLocaleLowerCase("de-AT"));
  return new Set(normalized).size === normalized.length;
}
