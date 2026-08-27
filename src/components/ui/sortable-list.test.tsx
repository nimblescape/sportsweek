/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stubRowLayout } from "@/test/stub-row-layout";
import { SortableList } from "./sortable-list";

beforeEach(stubRowLayout);
afterEach(() => vi.restoreAllMocks());

const items = [
  { id: "a", name: "Anton" },
  { id: "b", name: "Berta" },
  { id: "c", name: "Cesar" },
];

function renderList(onReorder = vi.fn(), overrides: Record<string, unknown> = {}) {
  render(
    <SortableList
      items={items}
      onReorder={onReorder}
      renderItem={(item) => <span>{item.name}</span>}
      {...overrides}
    />,
  );
  return onReorder;
}

describe("SortableList", () => {
  it("renders every item in the given order", () => {
    renderList();

    const rendered = screen.getAllByRole("listitem").map((row) => row.textContent);
    expect(rendered.map((text) => text?.replace(/verschieben/, "").trim())).toEqual([
      "Anton",
      "Berta",
      "Cesar",
    ]);
  });

  it("gives every item a grip handle, so a drag is never started by accident", () => {
    renderList();

    expect(screen.getAllByRole("button", { name: /verschieben/ })).toHaveLength(3);
  });

  it("names the item in each handle, so the control is distinguishable", () => {
    renderList();

    expect(screen.getByRole("button", { name: "Anton verschieben" })).toBeInTheDocument();
  });

  it("keeps the handle in the tab order, so ordering is reachable without a mouse", () => {
    renderList();

    expect(screen.getByRole("button", { name: "Anton verschieben" })).not.toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});

describe("SortableList — keyboard reordering", () => {
  it("moves an item down and reports the new order", async () => {
    const onReorder = renderList();

    const handle = screen.getByRole("button", { name: "Anton verschieben" });
    handle.focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ }");

    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]));
  });

  it("moves an item up and reports the new order", async () => {
    const onReorder = renderList();

    const handle = screen.getByRole("button", { name: "Cesar verschieben" });
    handle.focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{ }");

    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["a", "c", "b"]));
  });

  it("leaves the order alone when the move is cancelled", async () => {
    const onReorder = renderList();

    const handle = screen.getByRole("button", { name: "Anton verschieben" });
    handle.focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Escape}");

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not report a move that ends where it started", async () => {
    const onReorder = renderList();

    const handle = screen.getByRole("button", { name: "Anton verschieben" });
    handle.focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ }");

    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe("SortableList — when reordering is not offered", () => {
  it("renders the items without handles", () => {
    renderList(vi.fn(), { disabled: true });

    expect(screen.queryByRole("button", { name: /verschieben/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  /** The handle's box is kept, or a list nobody can drag would sit differently from one they can. */
  it("keeps the space the handle would have taken, so the rows keep their shape", () => {
    renderList(vi.fn(), { disabled: true });

    for (const row of screen.getAllByRole("listitem")) {
      expect(row).toHaveClass("flex", "items-center");
      expect(row.firstElementChild).toHaveClass("ml-2");
    }
  });
});

describe("SortableList — a row that may not move", () => {
  const pinned = { movable: (item: { id: string }) => item.id !== "a" };

  it("offers it no handle, but keeps the space one would have taken", () => {
    renderList(vi.fn(), pinned);

    expect(screen.queryByRole("button", { name: "Anton verschieben" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Berta verschieben" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0].firstElementChild).toHaveClass("ml-2");
  });

  it("leaves it at the index it had when the rows around it are moved", async () => {
    const onReorder = renderList(vi.fn(), pinned);

    const handle = screen.getByRole("button", { name: "Cesar verschieben" });
    handle.focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{ }");

    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["a", "c", "b"]));
  });
});

describe("SortableList — while a row is busy", () => {
  it("locks the handle of the row being written to", () => {
    renderList(vi.fn(), { busyId: "b" });

    expect(screen.getByRole("button", { name: "Berta verschieben" })).toBeDisabled();
  });

  it("leaves every other handle alone", () => {
    renderList(vi.fn(), { busyId: "b" });

    expect(screen.getByRole("button", { name: "Anton verschieben" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Cesar verschieben" })).not.toBeDisabled();
  });
});

describe("SortableList — showing the result of a move", () => {
  /** The rendered order, with each row's handle label stripped off. */
  function shownOrder() {
    return screen
      .getAllByRole("listitem")
      .map((row) => row.textContent?.replace(/\w+ verschieben/, "").trim());
  }

  async function moveAntonDown() {
    const handle = screen.getByRole("button", { name: "Anton verschieben" });
    handle.focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ }");
  }

  function renderWith(onReorder: (ids: string[]) => void | Promise<void>) {
    const view = render(
      <SortableList
        items={items}
        onReorder={onReorder}
        renderItem={(item) => <span>{item.name}</span>}
      />,
    );
    return view;
  }

  // The write goes through a Route Handler, so the subscription only catches up a round trip
  // later. Waiting for it would show the old order again in between.
  it("shows the new order at once, without waiting for the data to catch up", async () => {
    renderWith(vi.fn());

    await moveAntonDown();

    await waitFor(() => expect(shownOrder()).toEqual(["Berta", "Anton", "Cesar"]));
  });

  it("stays put when the data catches up and agrees", async () => {
    const { rerender } = renderWith(vi.fn());
    await moveAntonDown();
    await waitFor(() => expect(shownOrder()).toEqual(["Berta", "Anton", "Cesar"]));

    rerender(
      <SortableList
        items={[items[1], items[0], items[2]]}
        onReorder={vi.fn()}
        renderItem={(item) => <span>{item.name}</span>}
      />,
    );

    expect(shownOrder()).toEqual(["Berta", "Anton", "Cesar"]);
  });

  it("goes back to the stored order when the move could not be saved", async () => {
    renderWith(() => Promise.reject(new Error("offline")));

    await moveAntonDown();

    await waitFor(() => expect(shownOrder()).toEqual(["Anton", "Berta", "Cesar"]));
  });

  it("keeps an item that arrived during the move visible", async () => {
    const { rerender } = renderWith(vi.fn());
    await moveAntonDown();

    rerender(
      <SortableList
        items={[...items, { id: "d", name: "Dora" }]}
        onReorder={vi.fn()}
        renderItem={(item) => <span>{item.name}</span>}
      />,
    );

    expect(shownOrder()).toEqual(["Berta", "Anton", "Cesar", "Dora"]);
  });

  it("drops an item that disappeared during the move", async () => {
    const { rerender } = renderWith(vi.fn());
    await moveAntonDown();

    rerender(
      <SortableList
        items={[items[0], items[2]]}
        onReorder={vi.fn()}
        renderItem={(item) => <span>{item.name}</span>}
      />,
    );

    expect(shownOrder()).toEqual(["Anton", "Cesar"]);
  });

  // A program's equipment is identified by its name, so renaming an entry replaces its id. The
  // local order still names the entry that is gone, and can no longer place the one that
  // replaced it — the stored order is the only one that can.
  it("yields to the stored order once a renamed item leaves it nothing to say", async () => {
    const { rerender } = renderWith(vi.fn());
    await moveAntonDown();

    rerender(
      <SortableList
        items={[items[1], { id: "a2", name: "Amadeus" }, items[2]]}
        onReorder={vi.fn()}
        renderItem={(item) => <span>{item.name}</span>}
      />,
    );

    expect(shownOrder()).toEqual(["Berta", "Amadeus", "Cesar"]);
  });

  it("still follows the stored order after an item disappeared during the move", async () => {
    const { rerender } = renderWith(vi.fn());
    await moveAntonDown();

    const list = (shown: typeof items) => (
      <SortableList
        items={shown}
        onReorder={vi.fn()}
        renderItem={(item) => <span>{item.name}</span>}
      />
    );

    rerender(list([items[1], items[2]]));
    rerender(list([items[2], items[1]]));

    expect(shownOrder()).toEqual(["Cesar", "Berta"]);
  });
});
