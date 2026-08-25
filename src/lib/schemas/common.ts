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

export const documentIdSchema = z
  .string()
  .trim()
  .min(1, "Pflichtfeld.")
  .refine((value) => !value.includes("/"), "Eine Dokument-ID darf keinen Pfad enthalten.");

/**
 * A teacher-maintained list value copied onto a record as plain text (US-11).
 * Deliberately a string, never a document reference, so later list edits leave records untouched.
 */
export const snapshotValueSchema = requiredText(120);

export const genderSchema = z.enum(["male", "female"]);
export type Gender = z.infer<typeof genderSchema>;

export const isoDateSchema = z.iso.date();
