/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusyProvider, useBusyWhile } from "@/lib/api/busy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, TagAction, TagField, TagName } from "@/components/ui/tag";

/** Stands in for a view reporting a wait: a list still arriving from its subscription. */
function Waiting({ busy }: { busy: boolean }) {
  useBusyWhile(busy);
  return null;
}

function controls() {
  return (
    <>
      <Button>Speichern</Button>
      <Input aria-label="Name" />
      <Tag pressed={false}>
        <TagName label="Alle" onPress={() => {}} />
        <TagAction label="Entfernen">
          <span />
        </TagAction>
      </Tag>
      <Tag pressed={false}>
        <TagField aria-label="Bericht" />
      </Tag>
    </>
  );
}

function setup(busy: boolean) {
  render(
    <BusyProvider>
      <Waiting busy={busy} />
      {controls()}
    </BusyProvider>,
  );
}

const everyControl = () => [
  screen.getByRole("button", { name: "Speichern" }),
  screen.getByRole("textbox", { name: "Name" }),
  screen.getByRole("button", { name: "Alle" }),
  screen.getByRole("button", { name: "Entfernen" }),
  screen.getByRole("textbox", { name: "Bericht" }),
];

/**
 * Nothing is live over data that is still arriving or already being written. The controls decide
 * that for themselves, so a view cannot place one that forgot — which is the whole point of
 * asking here rather than at each call site.
 */
describe("a control while the application is busy", () => {
  it("is live when nothing is in flight", () => {
    setup(false);

    for (const control of everyControl()) expect(control).toBeEnabled();
  });

  it("is inert while something is", () => {
    setup(true);

    for (const control of everyControl()) expect(control).toBeDisabled();
  });

  /** A page with no provider is still a page: the sign-in card has controls and no writes. */
  it("is live where there is no provider to report to", () => {
    render(controls());

    for (const control of everyControl()) expect(control).toBeEnabled();
  });
});
