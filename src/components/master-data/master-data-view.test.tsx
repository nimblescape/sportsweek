/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubRowLayout } from "@/test/stub-row-layout";
import { CHILD_IN_USE_HINT, IN_USE_HINT } from "@/lib/master-data/categories";

const useMasterData = vi.fn();
const useUsageReport = vi.fn();

vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (...args: unknown[]) => useMasterData(...args),
  useUsageReport: (...args: unknown[]) => useUsageReport(...args),
}));

const { MasterDataView } = await import("./master-data-view");

const items = [
  { id: "c1", name: "3AHIT" },
  { id: "c2", name: "4BHIT" },
];

function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const created = () =>
  Promise.resolve(
    new Response(JSON.stringify({ item: { id: "c3", name: "5CHIT", parentId: null } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );

const conflict = (message: string) =>
  Promise.resolve(
    new Response(JSON.stringify({ error: { code: "CONFLICT", message } }), {
      status: 409,
      headers: { "content-type": "application/json" },
    }),
  );

beforeEach(() => {
  stubRowLayout();
  useMasterData.mockReturnValue({ items, loading: false, error: null });
  useUsageReport.mockReturnValue({ blockedIds: new Set<string>(), blockedEquipment: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function renderView(props: Record<string, unknown> = {}) {
  render(<MasterDataView category="classes" {...props} />);
}

describe("MasterDataView — reading the list", () => {
  it("titles the view from the category", () => {
    renderView();

    expect(screen.getByRole("heading", { name: "Klassen" })).toBeInTheDocument();
  });

  it("lists every item", () => {
    renderView();

    expect(screen.getByText("3AHIT")).toBeInTheDocument();
    expect(screen.getByText("4BHIT")).toBeInTheDocument();
  });

  it("shows a loading state while the subscription settles", () => {
    useMasterData.mockReturnValue({ items: [], loading: true, error: null });
    renderView();

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("reports a failed subscription instead of pretending the list is empty", () => {
    useMasterData.mockReturnValue({ items: [], loading: false, error: "permission-denied" });
    renderView();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/noch keine Klasse/i)).not.toBeInTheDocument();
  });

  it("names the category in its empty state", () => {
    useMasterData.mockReturnValue({ items: [], loading: false, error: null });
    renderView();

    expect(screen.getByText("Es gibt noch keine Klasse.")).toBeInTheDocument();
  });

  it("subscribes to the category it was configured with", () => {
    render(<MasterDataView category="skill-levels" />);

    expect(useMasterData).toHaveBeenCalledWith("skill-levels");
    expect(screen.getByRole("heading", { name: "Leistungsstufen" })).toBeInTheDocument();
  });
});

describe("MasterDataView — adding", () => {
  it("posts the new item to its category's handler", async () => {
    const fetchMock = stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: /neue klasse/i }));
    await userEvent.type(screen.getByLabelText("Name"), "5CHIT");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/master-data/classes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ name: "5CHIT" });
  });

  it("refuses a blank name without calling the server", async () => {
    const fetchMock = stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: /neue klasse/i }));
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByText("Pflichtfeld.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a duplicate name on the name field, where the teacher can fix it", async () => {
    stubFetch(() => conflict("Den Namen „3AHIT\u201c gibt es bereits."));
    renderView();

    await userEvent.click(screen.getByRole("button", { name: /neue klasse/i }));
    await userEvent.type(screen.getByLabelText("Name"), "3AHIT");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    const field = await screen.findByLabelText("Name");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/gibt es bereits/)).toBeInTheDocument();
  });
});

describe("MasterDataView — editing", () => {
  it("patches the item under its own id", async () => {
    const fetchMock = stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Klasse 3AHIT bearbeiten" }));
    const field = screen.getByLabelText("Name");
    await userEvent.clear(field);
    await userEvent.type(field, "3BHIT");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/master-data/classes/c1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ name: "3BHIT" });
  });

  it("opens the dialog with the current name already filled in", async () => {
    stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Klasse 3AHIT bearbeiten" }));

    expect(screen.getByLabelText("Name")).toHaveValue("3AHIT");
  });
});

describe("MasterDataView — deleting", () => {
  it("asks before deleting, naming the item", async () => {
    stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Klasse 3AHIT löschen" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("3AHIT")).toBeInTheDocument();
  });

  it("deletes only once the teacher confirms", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Klasse 3AHIT löschen" }));
    expect(fetchMock).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/master-data/classes/c1");
    expect(init.method).toBe("DELETE");
  });

  it("keeps the item when the teacher cancels", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Klasse 3AHIT löschen" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// The list refreshes from a separate subscription, so between the answer and the refresh a row
// still offers actions against an item the write it is waiting on may already have removed.
describe("MasterDataView — while a write is in flight", () => {
  async function confirmDelete() {
    await userEvent.click(screen.getByRole("button", { name: "Klasse 3AHIT löschen" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }),
    );
  }

  it("locks the row that is being written to", async () => {
    stubFetch(() => new Promise(() => {}));
    renderView();

    await confirmDelete();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Klasse 3AHIT bearbeiten" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "3AHIT verschieben" })).toBeDisabled();
  });

  it("leaves every other row alone", async () => {
    stubFetch(() => new Promise(() => {}));
    renderView();

    await confirmDelete();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Klasse 3AHIT bearbeiten" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Klasse 4BHIT bearbeiten" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "4BHIT verschieben" })).toBeEnabled();
  });

  it("releases the row once the write is answered", async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    renderView();

    await confirmDelete();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Klasse 3AHIT bearbeiten" })).toBeEnabled();
  });

  it("locks the extra action a category contributes, which acts on the same item", async () => {
    stubFetch(() => new Promise(() => {}));
    renderView({
      renderRowAction: (
        item: { id: string; name: string },
        { disabled }: { disabled: boolean },
      ) => (
        <a href={`/detail/${item.id}`} aria-disabled={disabled || undefined}>
          Details zu {item.name}
        </a>
      ),
    });

    await confirmDelete();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Details zu 3AHIT" })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    expect(screen.getByRole("link", { name: "Details zu 4BHIT" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });
});

describe("MasterDataView — the in-use restriction", () => {
  beforeEach(() =>
    useUsageReport.mockReturnValue({ blockedIds: new Set(["c1"]), blockedEquipment: {} }),
  );

  it("disables editing and deleting for an item still in use", () => {
    renderView();

    expect(screen.getByRole("button", { name: "Klasse 3AHIT bearbeiten" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Klasse 3AHIT löschen" })).toBeDisabled();
  });

  it("explains that the season has to be archived first", () => {
    renderView();

    expect(screen.getAllByText(IN_USE_HINT).length).toBeGreaterThan(0);
  });

  it("leaves the other items alone", () => {
    renderView();

    expect(screen.getByRole("button", { name: "Klasse 4BHIT bearbeiten" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Klasse 4BHIT löschen" })).toBeEnabled();
  });

  it("asks the guard about the category it is showing", () => {
    renderView();

    expect(useUsageReport).toHaveBeenCalledWith("classes");
  });
});

describe("MasterDataView — an item whose own list is in use", () => {
  beforeEach(() =>
    useUsageReport.mockReturnValue({
      blockedIds: new Set<string>(),
      blockedEquipment: { c1: ["Helm"] },
    }),
  );

  it("blocks deleting it, since deleting would take that entry along", () => {
    renderView();

    expect(screen.getByRole("button", { name: "Klasse 3AHIT löschen" })).toBeDisabled();
  });

  it("still allows renaming it, which touches no entry", () => {
    renderView();

    expect(screen.getByRole("button", { name: "Klasse 3AHIT bearbeiten" })).toBeEnabled();
  });

  it("says why deleting is blocked", () => {
    renderView();

    expect(screen.getAllByText(CHILD_IN_USE_HINT).length).toBeGreaterThan(0);
  });
});

describe("MasterDataView — fixed options", () => {
  it("lists an option that is always available alongside the maintained ones", () => {
    renderView({ fixedItems: ["Sonstiges"] });

    expect(screen.getByText("Sonstiges")).toBeInTheDocument();
  });

  it("gives a fixed option no edit or delete control", () => {
    renderView({ fixedItems: ["Sonstiges"] });

    expect(screen.queryByRole("button", { name: /Sonstiges bearbeiten/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sonstiges löschen/i })).not.toBeInTheDocument();
  });
});

describe("MasterDataView — per-row actions", () => {
  it("renders the extra action a category contributes, once per item", () => {
    renderView({
      renderRowAction: (item: { id: string; name: string }) => (
        <a href={`/detail/${item.id}`}>Details zu {item.name}</a>
      ),
    });

    expect(screen.getByRole("link", { name: "Details zu 3AHIT" })).toHaveAttribute(
      "href",
      "/detail/c1",
    );
    expect(screen.getByRole("link", { name: "Details zu 4BHIT" })).toBeInTheDocument();
  });

  it("leaves the extra action reachable for an item the in-use guard blocks", () => {
    useUsageReport.mockReturnValue({ blockedIds: new Set(["c1"]), blockedEquipment: {} });
    renderView({
      renderRowAction: (item: { id: string; name: string }) => (
        <a href={`/detail/${item.id}`}>Details zu {item.name}</a>
      ),
    });

    expect(screen.getByRole("link", { name: "Details zu 3AHIT" })).toBeInTheDocument();
  });
});

describe("MasterDataView — ordering", () => {
  it("gives every item a grip handle, so the order can be changed by dragging", () => {
    renderView();

    expect(screen.getByRole("button", { name: "3AHIT verschieben" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4BHIT verschieben" })).toBeInTheDocument();
  });

  it("offers the handle even for an item the in-use guard blocks, since ordering is always allowed", () => {
    useUsageReport.mockReturnValue({ blockedIds: new Set(["c1"]), blockedEquipment: {} });
    renderView();

    expect(screen.getByRole("button", { name: "3AHIT verschieben" })).toBeEnabled();
  });

  it("sends the new order to its category's handler", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    renderView();

    const handle = screen.getByRole("button", { name: "3AHIT verschieben" });
    handle.focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ }");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/master-data/classes");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ order: ["c2", "c1"] });
  });
});
