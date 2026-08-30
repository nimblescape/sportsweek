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
  { email: "jane.doe@htldornbirn.at", firstName: "Jane", lastName: "Doe", accountType: "teacher" },
  {
    email: "zoe.zimmer@student.htldornbirn.at",
    firstName: "Zoe",
    lastName: "Zimmer",
    accountType: "student",
  },
  {
    email: "max.mustermann@student.htldornbirn.at",
    firstName: "Max",
    lastName: "Mustermann",
    accountType: "student",
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

  const options = async () =>
    [...(await screen.findByLabelText("Bestehende Benutzer:innen")).querySelectorAll("option")].map(
      (option) => option.textContent,
    );

  /** The document id is an opaque uid now, so people are named by their address (US-31). */
  it("offers the already known users by address alone", async () => {
    renderDialog();

    expect(await options()).toEqual(["Neue Person", ...KNOWN_USERS.map((entry) => entry.email)]);
  });

  /** Seventy students and a handful of teachers is too long a list to read through. */
  it("narrows the list to the name that was typed", async () => {
    const { user } = renderDialog();
    await options();

    await user.type(screen.getByLabelText("Suchen"), "zimmer");

    expect(await options()).toEqual(["Neue Person", "zoe.zimmer@student.htldornbirn.at"]);
  });

  it("searches the address as well as the name", async () => {
    const { user } = renderDialog();
    await options();

    await user.type(screen.getByLabelText("Suchen"), "jane.doe@");

    expect(await options()).toEqual(["Neue Person", "jane.doe@htldornbirn.at"]);
  });

  it("shows only teachers when asked for them", async () => {
    const { user } = renderDialog();
    await options();

    await user.click(screen.getByRole("radio", { name: "Nur Lehrpersonen" }));

    expect(await options()).toEqual(["Neue Person", "jane.doe@htldornbirn.at"]);
  });

  it("shows only students when asked for them", async () => {
    const { user } = renderDialog();
    await options();

    await user.click(screen.getByRole("radio", { name: "Nur Schüler:innen" }));

    expect(await options()).toEqual([
      "Neue Person",
      "zoe.zimmer@student.htldornbirn.at",
      "max.mustermann@student.htldornbirn.at",
    ]);
  });

  /** The two narrow together, so a name is searched within whichever population is shown. */
  it("combines the two, searching a name within the population shown", async () => {
    const { user } = renderDialog();
    await options();

    await user.click(screen.getByRole("radio", { name: "Nur Schüler:innen" }));
    await user.type(screen.getByLabelText("Suchen"), "doe");

    expect(await options()).toEqual(["Neue Person"]);
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
    await user.click(screen.getByRole("button", { name: "Als andere Person anmelden" }));

    await waitFor(() => expect(signInWithCustomToken).toHaveBeenCalledWith({}, "ct"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse((post[1] as { body: string }).body)).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      accountType: "teacher",
    });
    expect(onImpersonated).toHaveBeenCalled();
  });

  it("refuses to submit a name that yields no school address", async () => {
    const fetchMock = stubApi();
    const { user } = renderDialog();

    await typeName(user, "字", "字");
    await user.click(screen.getByRole("button", { name: "Als andere Person anmelden" }));

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
    await user.click(screen.getByRole("button", { name: "Als andere Person anmelden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Test-Anmeldung derzeit nicht möglich.",
    );
    expect(onImpersonated).not.toHaveBeenCalled();
  });
});

/**
 * Continuing as yourself is the common case and asks for nothing, so it is what the dialog opens
 * offering. Standing in for somebody else needs a name to stand in for — typed out, or taken from
 * the list of people who already exist.
 */
describe("ImpersonationDialog — which of the two is offered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubApi();
  });

  const asOther = () => screen.getByRole("button", { name: "Als andere Person anmelden" });
  const asSelf = () => screen.getByRole("button", { name: "Mich selbst anmelden" });

  it("withholds the other person until there is one to name", () => {
    renderDialog();

    expect(asOther()).toBeDisabled();
  });

  it("offers it once a name is typed", async () => {
    const { user } = renderDialog();

    await typeName(user, "Jane", "Doe");

    await waitFor(() => expect(asOther()).toBeEnabled());
  });

  it("offers it once somebody is picked from the list", async () => {
    const { user } = renderDialog();
    await screen.findByRole("option", { name: "jane.doe@htldornbirn.at" });

    await user.selectOptions(
      screen.getByLabelText("Bestehende Benutzer:innen"),
      "jane.doe@htldornbirn.at",
    );

    await waitFor(() => expect(asOther()).toBeEnabled());
  });

  it("asks nothing at all to continue as yourself", async () => {
    const { user, onCancel } = renderDialog();

    await user.click(asSelf());

    expect(onCancel).toHaveBeenCalled();
  });
});
