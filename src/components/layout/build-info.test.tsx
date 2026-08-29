/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildInfo } from "@/components/layout/build-info";

describe("BuildInfo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("states what this build is", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "a1b2c3d");

    render(<BuildInfo />);

    expect(screen.getByText("v1.2.3 · a1b2c3d")).toBeInTheDocument();
  });

  // Nothing rather than an empty line: the space under the button it sits below is the button's.
  it("takes up no room when the build stamped nothing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "");

    const { container } = render(<BuildInfo />);

    expect(container).toBeEmptyDOMElement();
  });

  // Its two homes place it differently -- at the foot of the bar, and centred under the form.
  it("lets the page that shows it say where", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "a1b2c3d");

    render(<BuildInfo className="text-center" />);

    expect(screen.getByText("v1.2.3 · a1b2c3d")).toHaveClass("text-center");
  });
});
