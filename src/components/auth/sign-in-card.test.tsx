import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const onAuthStateChanged = vi.fn();
const signInWithRedirect = vi.fn();
const signOut = vi.fn();
const getRedirectResult = vi.fn();
const credentialFromResult = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  getRedirectResult,
  OAuthProvider: { credentialFromResult },
}));

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
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SignInCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRedirectResult.mockResolvedValue(null);
    credentialFromResult.mockReturnValue(null);
    onAuthStateChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      callback(signedInUser);
      return () => {};
    });
  });

  it("sends the Microsoft access token so the server can ask Graph for the name", async () => {
    const fetchMock = respondWith(200, { status: "ok" });
    getRedirectResult.mockResolvedValue({ user: signedInUser });
    credentialFromResult.mockReturnValue({ accessToken: "graph-token" });

    render(<SignInCard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).msAccessToken).toBe("graph-token");
  });

  it("still signs in when no redirect credential is available", async () => {
    const fetchMock = respondWith(200, { status: "ok" });

    render(<SignInCard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.idToken).toBe("id-token");
    expect(body.msAccessToken).toBeUndefined();
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

  it("places the spinner below the button", () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    const status = screen.getByRole("status");
    const button = screen.getByRole("button");
    expect(button.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ["while signing in", true],
    ["when idle", false],
  ])("reserves the spinner's space %s so the card keeps its height", async (_case, busy) => {
    respondWith(200, { status: "ok" });
    onAuthStateChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      callback(busy ? signedInUser : null);
      return () => {};
    });

    const { container } = render(<SignInCard />);

    await waitFor(() =>
      expect(container.querySelector('[data-slot="sign-in-status"]')).not.toBeNull(),
    );
  });

  it("keeps the spinner icon-only while still announcing it", () => {
    respondWith(200, { status: "ok" });

    render(<SignInCard />);

    const status = screen.getByRole("status");
    expect(status.textContent?.trim()).toBe("");
    expect(status).toHaveAccessibleName(/anmelden/i);
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

  it.each([
    ["teacher", "/app/report"],
    ["student", "/app/my-master-data"],
  ])("sends a %s straight to their own start page", async (role, expected) => {
    respondWith(200, { status: "ok", role });

    render(<SignInCard />);

    await waitFor(() => expect(push).toHaveBeenCalledWith(expected));
  });

  it("ignores an unusable role and falls back to the landing route", async () => {
    respondWith(200, { status: "ok", role: "admin" });

    render(<SignInCard />);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
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
