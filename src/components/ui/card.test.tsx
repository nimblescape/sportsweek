import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "@/components/ui/card";

describe("Card design tokens", () => {
  it("applies the shared subtle elevation token", () => {
    render(<Card data-testid="card" />);

    expect(screen.getByTestId("card").className).toContain("shadow-card");
  });
});
