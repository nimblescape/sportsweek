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
});
