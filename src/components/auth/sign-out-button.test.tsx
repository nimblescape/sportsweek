/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("firebase/auth", () => ({ signOut }));
vi.mock("@/lib/firebase/client", () => ({ auth: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { SignOutButton } = await import("@/components/auth/sign-out-button");

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("is labelled in German", () => {
    render(<SignOutButton />);

    expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
  });

  it("clears the server session and signs out of Firebase", async () => {
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole("button"));

    expect(fetch).toHaveBeenCalledWith("/api/session", { method: "DELETE" });
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
  });

  /** The mark is the person's own where Entra has one, and a generic one where it has not. */
  it("wears the photo it is given", () => {
    render(<SignOutButton photo="data:image/jpeg;base64,AAA" />);

    const mark = screen.getByRole("button", { name: "Abmelden" }).querySelector("img");
    expect(mark).toHaveAttribute("src", expect.stringContaining("data:image/jpeg"));
  });

  it("falls back to a drawn mark when there is no photo", () => {
    render(<SignOutButton />);

    const button = screen.getByRole("button", { name: "Abmelden" });
    expect(button.querySelector("img")).not.toBeInTheDocument();
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  /** The name is already on the button, so the photo repeating it would only be read twice. */
  it("leaves the photo out of the accessible name", () => {
    render(<SignOutButton photo="data:image/jpeg;base64,AAA" />);

    expect(screen.getByRole("button", { name: "Abmelden" })).toBeInTheDocument();
  });
});
