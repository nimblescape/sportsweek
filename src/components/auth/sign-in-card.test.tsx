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

const { SignInCard } = await import("@/components/auth/sign-in-card");

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

describe("SignInCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onAuthStateChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      callback(signedInUser);
      return () => {};
    });
  });

  it("shows the HTL Dornbirn logo", () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    expect(screen.getByAltText(/htl dornbirn/i)).toBeInTheDocument();
  });

  it("shows the application name as the heading", () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sportsweek");
  });

  it("explains what the application is without repeating the school name from the logo", () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    const subtitle = screen.getByText(/Sportwochen-Verwaltung/i, { selector: "p" });
    expect(subtitle).toBeInTheDocument();
    expect(subtitle).not.toHaveTextContent(/HTL Dornbirn/i);
  });

  it("labels the button with the identity provider the school uses", () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    expect(screen.getByRole("button", { name: /Office 365/i })).toBeInTheDocument();
  });

  it("disables the button while the session is being established", () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    expect(screen.getByRole("button", { name: /Office 365/i })).toBeDisabled();
  });

  it("shows the progress spinner on the card rather than inside the button", () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    const status = screen.getByRole("status");
    expect(status.querySelector("svg.animate-spin")).not.toBeNull();
    expect(screen.getByRole("button").querySelector("svg")).toBeNull();
  });

  it("shows no spinner once the visitor can sign in", async () => {
    onAuthStateChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      callback(null);
      return () => {};
    });

    render(<SignInCard />);

    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("creates the session and navigates into the app on success", async () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("shows the account-not-enabled message when the account is rejected", async () => {
    respondWith(403, {
      error: { code: "PERMISSION_DENIED", message: "Dieses Konto ist nicht freigeschaltet." },
    });

    render(<SignInCard />);

    expect(await screen.findByText(/nicht freigeschaltet/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("signs the rejected user out of Firebase so no half-authenticated state lingers", async () => {
    respondWith(403, { error: { code: "PERMISSION_DENIED", message: "Nicht freigeschaltet." } });

    render(<SignInCard />);

    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("shows a generic error for other failures", async () => {
    respondWith(500, {});

    render(<SignInCard />);

    expect(await screen.findByText(/fehlgeschlagen/i)).toBeInTheDocument();
  });

  it("re-enables the sign-in button after a failure", async () => {
    respondWith(403, { error: { code: "PERMISSION_DENIED", message: "Nicht freigeschaltet." } });

    render(<SignInCard />);

    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });
});
