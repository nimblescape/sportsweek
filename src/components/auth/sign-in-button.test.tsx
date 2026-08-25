import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const onAuthStateChanged = vi.fn();
const signInWithRedirect = vi.fn();
const signOut = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("firebase/auth", () => ({ onAuthStateChanged, signInWithRedirect, signOut }));

vi.mock("@/lib/firebase/client", () => ({
  auth: {},
  createMicrosoftAuthProvider: () => ({}),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

const { SignInButton } = await import("@/components/auth/sign-in-button");

const signedInUser = { getIdToken: vi.fn().mockResolvedValue("id-token") };

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

describe("SignInButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onAuthStateChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      callback(signedInUser);
      return () => {};
    });
  });

  it("creates the session and navigates into the app on success", async () => {
    respondWith(200, { status: "ok" });

    render(<SignInButton />);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("shows the account-not-enabled message when the account is rejected", async () => {
    respondWith(403, {
      error: { code: "PERMISSION_DENIED", message: "Dieses Konto ist nicht freigeschaltet." },
    });

    render(<SignInButton />);

    expect(await screen.findByText(/nicht freigeschaltet/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("signs the rejected user out of Firebase so no half-authenticated state lingers", async () => {
    respondWith(403, { error: { code: "PERMISSION_DENIED", message: "Nicht freigeschaltet." } });

    render(<SignInButton />);

    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("shows a generic error for other failures", async () => {
    respondWith(500, {});

    render(<SignInButton />);

    expect(await screen.findByText(/fehlgeschlagen/i)).toBeInTheDocument();
  });

  it("re-enables the sign-in button after a failure", async () => {
    respondWith(403, { error: { code: "PERMISSION_DENIED", message: "Nicht freigeschaltet." } });

    render(<SignInButton />);

    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });
});
