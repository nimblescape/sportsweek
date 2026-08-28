/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";
import { documentIdSchema } from "./common";
import { listItemNameSchema } from "./master-data";

/**
 * What a link enrols somebody into (US-23). The token is the document's id rather than a field,
 * so resolving one is a read of a known path and never a query — and because it is a secret, no
 * client may read this collection at all (see firestore.rules).
 *
 * A link names a class as well as a series, which is what stops a student picking their own and
 * getting it wrong: the class is set from here and owned by the server.
 */
export const invitationSchema = z.object({
  token: documentIdSchema,
  eventSeriesId: documentIdSchema,
  class: listItemNameSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;
