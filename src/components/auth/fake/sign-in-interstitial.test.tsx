/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const onImpersonatedProp = vi.fn();

vi.mock("@/components/auth/fake/impersonation-dialog", () => ({
  ImpersonationDialog: ({
    onCancel,
    onImpersonated,
  }: {
    onCancel: () => void;
    onImpersonated: () => void;
  }) => {
    onImpersonatedProp.mockImplementation(onImpersonated);
    return (
      <div role="dialog">
        <button onClick={onCancel}>Als ich selbst fortfahren</button>
        <button onClick={onImpersonated}>Anmelden</button>
      </div>
    );
  },
}));

// Imported under the name the alias in `next.config.ts` requires, so a rename that would
// break the swap breaks this first.
const { SignInInterstitial: ImpersonationStep } =
  await import("@/components/auth/fake/sign-in-interstitial");

describe("ImpersonationStep", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers to impersonate once a real sign-in has produced a session", async () => {
    const onDone = vi.fn();

    render(<ImpersonationStep signInProvider="microsoft.com" onDone={onDone} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  // An impersonated session arrived here *from* this dialog, so offering it again would loop.
  it("steps aside for a session it produced itself", async () => {
    const onDone = vi.fn();

    render(<ImpersonationStep signInProvider="custom" onDone={onDone} />);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Nothing says the provider has to be one of the two we know about.
  it("steps aside for any other provider", async () => {
    const onDone = vi.fn();

    render(<ImpersonationStep signInProvider={null} onDone={onDone} />);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("carries on as the real user when the offer is declined", async () => {
    const onDone = vi.fn();
    render(<ImpersonationStep signInProvider="microsoft.com" onDone={onDone} />);

    await userEvent.click(screen.getByRole("button", { name: /Als ich selbst/i }));

    expect(onDone).toHaveBeenCalled();
  });

  // The new session takes a moment to come back around; leaving the dialog up in the meantime
  // would show a form that has already done its work.
  it("closes as soon as it has signed somebody in", async () => {
    const onDone = vi.fn();
    render(<ImpersonationStep signInProvider="microsoft.com" onDone={onDone} />);

    await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Not done yet either — the impersonated session drives the rest.
    expect(onDone).not.toHaveBeenCalled();
  });
});
