/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// `globals` is off in vitest.config.ts, so RTL's auto-cleanup never registers itself
// and rendered DOM would otherwise leak from one test into the next.
afterEach(cleanup);

// jsdom implements <dialog> but not showModal/close, so the confirmation dialogs (US-4)
// would be untestable. This stands in for the top layer only — focus trapping and the
// backdrop are the browser's job and are not simulated here.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, value?: string) {
    this.open = false;
    if (value !== undefined) this.returnValue = value;
    this.dispatchEvent(new Event("close"));
  };
}
