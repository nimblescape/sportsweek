/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
const enter = vi.fn();
const state: {
  checking: boolean;
  error: string | null;
  session: { destination: string; signInProvider: string | null } | null;
} = { checking: false, error: null, session: null };

vi.mock("@/lib/auth/use-sign-in", () => ({
  useSignIn: () => ({ ...state, signIn, enter }),
}));

vi.mock("@/components/auth/fake/impersonation-dialog", () => ({
  ImpersonationDialog: ({
    onCancel,
    onImpersonated,
  }: {
    onCancel: () => void;
    onImpersonated: () => void;
  }) => (
    <div role="dialog">
      <button onClick={onCancel}>Als ich selbst fortfahren</button>
      <button onClick={onImpersonated}>Anmelden</button>
    </div>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

const { SignInView } = await import("@/components/auth/fake/sign-in-view");

describe("the test environment's sign-in screen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.checking = false;
    state.error = null;
    state.session = null;
  });

  // Production and staging are otherwise indistinguishable, and knowing which one you are
  // typing into is the difference between a test and a mistake.
  it("says that this is a test environment", () => {
    render(<SignInView />);

    expect(screen.getByText(/Testumgebung/i)).toBeInTheDocument();
    expect(screen.getByText(/Erfundene Daten/i)).toBeInTheDocument();
  });

  it("still uses the real sign-in as the way in", async () => {
    render(<SignInView />);

    await userEvent.click(screen.getByRole("button", { name: /Office 365/i }));

    expect(signIn).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers a choice of who to be once the real sign-in produced a session", () => {
    state.session = { destination: "/app", signInProvider: "microsoft.com" };

    render(<SignInView />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(enter).not.toHaveBeenCalled();
  });

  // The impersonated session arrived here from that dialog, so asking again would loop.
  it("goes straight into the app for a session it produced itself", async () => {
    state.session = { destination: "/app", signInProvider: "custom" };

    render(<SignInView />);

    await waitFor(() => expect(enter).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("carries on as the real user when the choice is declined", async () => {
    state.session = { destination: "/app", signInProvider: "microsoft.com" };
    render(<SignInView />);

    await userEvent.click(screen.getByRole("button", { name: /Als ich selbst/i }));

    expect(enter).toHaveBeenCalled();
  });

  // The new session takes a moment to come back around; leaving the dialog up meanwhile
  // would show a form that has already done its work.
  it("closes the choice as soon as it has signed somebody in", async () => {
    state.session = { destination: "/app", signInProvider: "microsoft.com" };
    render(<SignInView />);

    await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(enter).not.toHaveBeenCalled();
  });

  it("shows what went wrong", () => {
    state.error = "Anmelden fehlgeschlagen.";

    render(<SignInView />);

    expect(screen.getByRole("alert")).toHaveTextContent("Anmelden fehlgeschlagen.");
  });
});
