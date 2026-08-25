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
});
