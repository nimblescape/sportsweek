/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithCustomToken = vi.fn();

vi.mock("firebase/auth", () => ({ signInWithCustomToken }));
vi.mock("@/lib/firebase/client", () => ({ auth: {} }));

const { ImpersonationDialog } = await import("@/components/auth/fake/impersonation-dialog");

const KNOWN_USERS = [
  { upn: "jane.doe@htldornbirn.at", firstName: "Jane", lastName: "Doe", role: "teacher" },
  {
    upn: "zoe.zimmer@student.htldornbirn.at",
    firstName: "Zoe",
    lastName: "Zimmer",
    role: "student",
  },
];

type PostResult = { ok: boolean; status: number; body: unknown };

function stubApi(post: PostResult = { ok: true, status: 200, body: { customToken: "ct" } }) {
  const fetchMock = vi.fn(async (_url: string, init?: { method?: string }) =>
    init?.method === "POST"
      ? { ok: post.ok, status: post.status, json: async () => post.body }
      : { ok: true, status: 200, json: async () => ({ users: KNOWN_USERS }) },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDialog() {
  const onCancel = vi.fn();
  const onImpersonated = vi.fn();
  render(<ImpersonationDialog open onCancel={onCancel} onImpersonated={onImpersonated} />);
  return { onCancel, onImpersonated, user: userEvent.setup() };
}

async function typeName(
  user: ReturnType<typeof userEvent.setup>,
  first: string,
  last: string,
): Promise<void> {
  await user.type(screen.getByLabelText("Vorname"), first);
  await user.type(screen.getByLabelText("Nachname"), last);
}

describe("ImpersonationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  it("offers the already known users by UPN alone", async () => {
    renderDialog();

    const dropdown = await screen.findByLabelText("Bestehende Benutzer:innen");
    expect([...dropdown.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "Neue Person",
      ...KNOWN_USERS.map((entry) => entry.upn),
    ]);
  });

  it("fills the form from the picked user", async () => {
    const { user } = renderDialog();

    const dropdown = await screen.findByLabelText("Bestehende Benutzer:innen");
    await user.selectOptions(dropdown, "zoe.zimmer@student.htldornbirn.at");

    expect(screen.getByLabelText("Vorname")).toHaveValue("Zoe");
    expect(screen.getByLabelText("Nachname")).toHaveValue("Zimmer");
    expect(screen.getByLabelText("Schüler:in")).toBeChecked();
  });

  it("compiles the UPN from the name and the role while typing", async () => {
    const { user } = renderDialog();

    await typeName(user, "Jürgen", "Müller");
    expect(screen.getByLabelText("E-Mail / UPN")).toHaveTextContent(
      "juergen.mueller@htldornbirn.at",
    );

    await user.click(screen.getByLabelText("Schüler:in"));
    expect(screen.getByLabelText("E-Mail / UPN")).toHaveTextContent(
      "juergen.mueller@student.htldornbirn.at",
    );
  });

  // It is derived from the two names, so offering somewhere to type would invite editing it
  // into something the tenant would never issue.
  it("presents the UPN as a result rather than a field", async () => {
    const { user } = renderDialog();

    await typeName(user, "Jane", "Doe");

    expect(screen.getByLabelText("E-Mail / UPN")).toHaveTextContent("jane.doe@htldornbirn.at");
    expect(screen.queryByRole("textbox", { name: "E-Mail / UPN" })).not.toBeInTheDocument();
  });

  it("signs in with the token the server minted", async () => {
    const fetchMock = stubApi();
    const { user, onImpersonated } = renderDialog();

    await typeName(user, "Jane", "Doe");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    await waitFor(() => expect(signInWithCustomToken).toHaveBeenCalledWith({}, "ct"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse((post[1] as { body: string }).body)).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      role: "teacher",
    });
    expect(onImpersonated).toHaveBeenCalled();
  });

  it("refuses to submit a name that yields no school address", async () => {
    const fetchMock = stubApi();
    const { user } = renderDialog();

    await typeName(user, "字", "字");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Schul-Adresse");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("stays open and shows the server's message when signing in fails", async () => {
    stubApi({
      ok: false,
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Test-Anmeldung derzeit nicht möglich." } },
    });
    const { user, onImpersonated } = renderDialog();

    await typeName(user, "Jane", "Doe");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Test-Anmeldung derzeit nicht möglich.",
    );
    expect(onImpersonated).not.toHaveBeenCalled();
  });
});
