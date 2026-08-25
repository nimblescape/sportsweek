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
});
