import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

function renderTooltip(label = "Bearbeiten") {
  render(
    <Tooltip label={label}>
      <Button aria-label={label}>icon</Button>
    </Tooltip>,
  );
}

describe("Tooltip", () => {
  it("stays hidden until the trigger is hovered", () => {
    renderTooltip();

    expect(screen.queryByText("Bearbeiten")).not.toBeInTheDocument();
  });

  it("shows the label on hover", async () => {
    renderTooltip();

    await userEvent.hover(screen.getByRole("button"));

    expect(await screen.findByText("Bearbeiten")).toBeInTheDocument();
  });

  it("hides again once the pointer leaves", async () => {
    renderTooltip();
    await userEvent.hover(screen.getByRole("button"));
    await screen.findByText("Bearbeiten");

    await userEvent.unhover(screen.getByRole("button"));

    await waitFor(() => expect(screen.queryByText("Bearbeiten")).not.toBeInTheDocument());
  });

  it("shows on keyboard focus, so it is not mouse-only", async () => {
    renderTooltip();

    await userEvent.tab();

    expect(await screen.findByText("Bearbeiten")).toBeInTheDocument();
  });

  it("is hidden from assistive technology, since the trigger already carries the same label", async () => {
    renderTooltip();

    await userEvent.hover(screen.getByRole("button"));
    await screen.findByText("Bearbeiten");

    expect(screen.getByRole("button")).toHaveAccessibleName("Bearbeiten");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("still forwards a click to the trigger", async () => {
    const onClick = vi.fn();
    render(
      <Tooltip label="Löschen">
        <Button aria-label="Löschen" onClick={onClick}>
          icon
        </Button>
      </Tooltip>,
    );

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalled();
  });

  it("keeps a disabled trigger disabled", async () => {
    render(
      <Tooltip label="Löschen">
        <Button aria-label="Löschen" disabled>
          icon
        </Button>
      </Tooltip>,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });
});
