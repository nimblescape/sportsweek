/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const onIdTokenChanged = vi.fn();
const onAuthStateChanged = vi.fn();
const signInWithRedirect = vi.fn();
const signOut = vi.fn();
const getRedirectResult = vi.fn();
const credentialFromResult = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("firebase/auth", () => ({
  onIdTokenChanged,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  getRedirectResult,
  signInWithCustomToken: vi.fn(),
  OAuthProvider: { credentialFromResult },
}));

vi.mock("@/lib/firebase/client", () => ({
  auth: {},
  createMicrosoftAuthProvider: () => ({}),
}));

// Stable across renders, as the real hooks are: a fresh object each call would re-run the
// subscription effect on every render, which the card is not written to expect.
const router = { push, refresh };
const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

const { SignInCard } = await import("@/components/auth/sign-in-card");

/** `signInProvider` is how the card tells a real sign-in from an impersonated one. */
function userSignedInVia(provider: string) {
  return {
    getIdToken: vi.fn().mockResolvedValue("id-token"),
    getIdTokenResult: vi.fn().mockResolvedValue({ token: "id-token", signInProvider: provider }),
  };
}

const signedInUser = userSignedInVia("microsoft.com");

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
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
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

  // Impersonating reaches the same listener with somebody else's session, while the Graph
  // token in hand still belongs to the teacher who signed in for real — sending it on would
  // file that teacher's name under the impersonated account.
  it("keeps the Microsoft access token out of a session that is not that sign-in's", async () => {
    const fetchMock = respondWith(200, { status: "ok" });
    getRedirectResult.mockResolvedValue({ user: signedInUser });
    credentialFromResult.mockReturnValue({ accessToken: "graph-token" });

    let notify: ((user: unknown) => void) | undefined;
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      notify = callback;
      callback(signedInUser);
      return () => {};
    });

    render(<SignInCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => notify?.(userSignedInVia("custom")));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).msAccessToken).toBeUndefined();
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
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
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
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
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

  // A teacher's pages are all about one event series, and signing in does not know which — so
  // they land on `/app`, which reads the remembered selection and sends them on (Q8).
  it.each([
    ["teacher", "/app"],
    ["student", "/app/my-registration"],
  ])("sends a %s straight to their own start page", async (accountType, expected) => {
    respondWith(200, { status: "ok", accountType });

    render(<SignInCard />);

    await waitFor(() => expect(push).toHaveBeenCalledWith(expected));
  });

  it("ignores an unusable account type and falls back to the landing route", async () => {
    respondWith(200, { status: "ok", accountType: "admin" });

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

  it("starts the real sign-in when the button is pressed", async () => {
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      callback(null);
      return () => {};
    });

    render(<SignInCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Office 365/i }));

    expect(signInWithRedirect).toHaveBeenCalled();
  });

  // A rejected redirect never leaves the page, so saying nothing looks like a dead button.
  it("reports a sign-in that could not even start", async () => {
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      callback(null);
      return () => {};
    });
    signInWithRedirect.mockRejectedValue(new Error("auth/unauthorized-domain"));

    render(<SignInCard />);
    await userEvent.click(await screen.findByRole("button", { name: /Office 365/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/fehlgeschlagen/i);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  // Impersonating yourself keeps the same uid, so the sign-in *state* never changes and
  // onAuthStateChanged stays silent -- only the token is new. Listening to the wrong one
  // leaves the card waiting for a callback that will not come.
  it("notices a fresh token for the user already signed in", async () => {
    respondWith(200, { status: "ok" });
    let notify: (user: unknown) => void = () => {};
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (u: unknown) => void) => {
      notify = callback;
      callback(null);
      return () => {};
    });

    render(<SignInCard />);
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());

    await act(async () => notify(userSignedInVia("custom")));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(onAuthStateChanged).not.toHaveBeenCalled();
  });
});
