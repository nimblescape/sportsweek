import type { FirestoreDataConverter } from "firebase/firestore";
import type { z } from "zod";

/** Validates every read against the schema and keeps `id` in the document path, not the payload. */
export function zodConverter<T extends { id: string }>(
  schema: z.ZodType<T>,
): FirestoreDataConverter<T> {
  return {
    toFirestore(model) {
      const data: Record<string, unknown> = { ...schema.parse(model) };
      delete data.id;
      return data;
    },
    fromFirestore(snapshot, options) {
      return schema.parse({ id: snapshot.id, ...snapshot.data(options) });
    },
  };
}
