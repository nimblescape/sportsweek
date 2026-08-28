/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Abmelden</button>,
}));

const { AppShell } = await import("@/components/layout/app-shell");

describe("AppShell", () => {
  it("shows the application title on the left of the header", () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("Sportsweek");
  });

  /**
   * The bar spans both rows so that it runs to the top of the window, which puts the brand
   * inside it — and leaves the header holding only what is about the page below it.
   */
  it("hands the brand to the navigation bar where there is one", () => {
    render(
      <AppShell nav={<nav aria-label="Hauptnavigation">Navigation</nav>}>
        <p>Inhalt</p>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).not.toHaveTextContent("Sportsweek");
  });

  it("keeps the brand in the header for a student, who is given no bar", () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toHaveTextContent("Sportsweek");
  });

  it("brands the header with the school's logo, ahead of the title", () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    );

    const logo = screen.getByRole("img", { name: /htl dornbirn/i });

    expect(logo.compareDocumentPosition(screen.getByText("Sportsweek"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("renders the title above the section heading size in the type hierarchy", () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    );

    // Section headings use text-lg, so the brand must outrank it.
    expect(screen.getByText("Sportsweek").className).toContain("text-xl");
  });

  it("shows a logout button in the header", () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: /abmelden/i, hidden: true })).toBeInTheDocument();
  });

  it("renders the role-specific content below the header", () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    );

    const header = screen.getByRole("banner");
    const content = screen.getByText("Inhalt");

    expect(header).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    expect(header.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("adds no navigation of its own, so the student view has none (US-15)", () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    );

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
