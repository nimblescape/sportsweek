/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EMPTY_REPORT, MasterDataReport } from "./master-data-report";

describe("MasterDataReport", () => {
  /** The root of a school that has not started yet reports nothing, rather than a bare card. */
  it("says so where the record holds nothing to report on", () => {
    render(<MasterDataReport sections={[]} />);

    expect(screen.getByText(EMPTY_REPORT)).toBeInTheDocument();
  });

  /**
   * The page's own heading is the breadcrumb's last step, so the report starts one level under
   * it and each nested collection goes one deeper — which is what makes the tree navigable.
   */
  it("heads each level one deeper than the one it sits under", () => {
    render(
      <MasterDataReport
        sections={[
          {
            title: "Wintersportwoche",
            entries: [],
            sections: [
              {
                title: "Programme",
                entries: [],
                sections: [{ title: "Ski", entries: ["Helm"], sections: [] }],
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Wintersportwoche");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Programme");
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent("Ski");
    expect(screen.getByRole("listitem")).toHaveTextContent("Helm");
  });
});
