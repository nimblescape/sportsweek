/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
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

  const listed = async () =>
    within(await screen.findByRole("list", { name: "Bestehende Benutzer:innen" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);

  /** The document id is an opaque uid now, so people are named by their address (US-31). */
  it("offers the already known users by address alone", async () => {
    renderDialog();

    expect(await listed()).toEqual(KNOWN_USERS.map((entry) => entry.email));
  });

  it("shows only teachers when asked for them", async () => {
    const { user } = renderDialog();
    await listed();

    await user.click(screen.getByRole("radio", { name: "Nur Lehrpersonen" }));

    expect(await listed()).toEqual(["jane.doe@htldornbirn.at"]);
  });

  it("shows only students when asked for them", async () => {
    const { user } = renderDialog();
    await listed();

    await user.click(screen.getByRole("radio", { name: "Nur Schüler:innen" }));

    expect(await listed()).toEqual([
      "zoe.zimmer@student.htldornbirn.at",
      "max.mustermann@student.htldornbirn.at",
    ]);
  });

  // The dropdown this replaced kept its choice on show. A list has to say so itself, and it
  // answers for a typed name too, since the address is what either one produces.
  it("marks whoever the form now names", async () => {
    const { user } = renderDialog();
    const jane = await screen.findByRole("button", { name: "jane.doe@htldornbirn.at" });
    expect(jane).not.toHaveAttribute("aria-current");

    await user.click(jane);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "jane.doe@htldornbirn.at" })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
  });

  /** Seventy students and a handful of teachers is too long a list to read through, and the
   * name is already being typed — so it is what narrows the list. */
  it("narrows the list to the first name being typed", async () => {
    const { user } = renderDialog();
    await listed();

    await user.type(screen.getByLabelText("Vorname"), "Zo");

    await waitFor(async () =>
      expect(await listed()).toEqual(["zoe.zimmer@student.htldornbirn.at"]),
    );
  });

  it("narrows the list to the surname being typed", async () => {
    const { user } = renderDialog();
    await listed();

    await user.type(screen.getByLabelText("Nachname"), "Muster");

    await waitFor(async () =>
      expect(await listed()).toEqual(["max.mustermann@student.htldornbirn.at"]),
    );
  });

  /** The two narrow together, so a name is searched within whichever population is shown. */
  it("searches the name within the population shown", async () => {
    const { user } = renderDialog();
    await listed();

    await user.click(screen.getByRole("radio", { name: "Nur Lehrpersonen" }));
    await user.type(screen.getByLabelText("Nachname"), "Zimmer");

    expect(await screen.findByText("Keine Treffer")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Bestehende Benutzer:innen" })).toBeNull();
  });

  it("fills the form from the picked user", async () => {
    const { user } = renderDialog();

    await user.click(
      await screen.findByRole("button", { name: "zoe.zimmer@student.htldornbirn.at" }),
    );

    expect(screen.getByLabelText("Vorname")).toHaveValue("Zoe");
    expect(screen.getByLabelText("Nachname")).toHaveValue("Zimmer");
    expect(screen.getByLabelText("Schüler:in")).toBeChecked();
  });

  /**
   * An address is a name and a role together, so a typed name with the role left at its default
   * would mint a second person rather than reaching the one who bears it.
   */
  it("takes the role from the person whose name was typed", async () => {
    const { user } = renderDialog();
    await screen.findByRole("button", { name: "zoe.zimmer@student.htldornbirn.at" });

    await typeName(user, "Zoe", "Zimmer");

    await waitFor(() => expect(screen.getByLabelText("Schüler:in")).toBeChecked());
    expect(screen.getByLabelText("E-Mail")).toHaveTextContent("zoe.zimmer@student.htldornbirn.at");
    expect(
      screen.getByRole("button", { name: "zoe.zimmer@student.htldornbirn.at" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("leaves the role alone for a name that is nobody's", async () => {
    const { user } = renderDialog();
    await screen.findByRole("button", { name: "jane.doe@htldornbirn.at" });

    await typeName(user, "Erika", "Musterfrau");

    expect(screen.getByLabelText("Lehrperson")).toBeChecked();
  });

  // Only until it is contradicted: a new teacher who happens to share a student's name is a
  // person the tenant could issue, and the role is where that is said.
  it("still lets the role be changed after it followed a name", async () => {
    const { user } = renderDialog();
    await screen.findByRole("button", { name: "zoe.zimmer@student.htldornbirn.at" });

    await typeName(user, "Zoe", "Zimmer");
    await waitFor(() => expect(screen.getByLabelText("Schüler:in")).toBeChecked());
    await user.click(screen.getByLabelText("Lehrperson"));

    expect(screen.getByLabelText("Lehrperson")).toBeChecked();
  });

  it("compiles the address from the name and the role while typing", async () => {
    const { user } = renderDialog();

    await typeName(user, "Jürgen", "Müller");
    expect(screen.getByLabelText("E-Mail")).toHaveTextContent("juergen.mueller@htldornbirn.at");

    await user.click(screen.getByLabelText("Schüler:in"));
    expect(screen.getByLabelText("E-Mail")).toHaveTextContent(
      "juergen.mueller@student.htldornbirn.at",
    );
  });

  // It is derived from the two names, so offering somewhere to type would invite editing it
  // into something the tenant would never issue.
  it("presents the address as a result rather than a field", async () => {
    const { user } = renderDialog();

    await typeName(user, "Jane", "Doe");

    expect(screen.getByLabelText("E-Mail")).toHaveTextContent("jane.doe@htldornbirn.at");
    expect(screen.queryByRole("textbox", { name: "E-Mail" })).not.toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: "jane.doe@htldornbirn.at" }));

    await waitFor(() => expect(asOther()).toBeEnabled());
  });

  it("asks nothing at all to continue as yourself", async () => {
    const { user, onCancel } = renderDialog();

    await user.click(asSelf());

    expect(onCancel).toHaveBeenCalled();
  });
});
