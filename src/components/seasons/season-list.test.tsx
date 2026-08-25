import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SeasonList } from "@/components/seasons/season-list";

const seasons = [
  { id: "s1", name: "Wintersportwoche 2026", isActive: true, isArchived: false },
  { id: "s2", name: "Wintersportwoche 2025", isActive: false, isArchived: true },
  { id: "s3", name: "Wintersportwoche 2027", isActive: false, isArchived: false },
];

describe("SeasonList", () => {
  it("shows one row per season", () => {
    render(<SeasonList seasons={seasons} loading={false} error={null} />);

    for (const season of seasons) {
      expect(screen.getByText(season.name)).toBeInTheDocument();
    }
  });

  it.each([
    ["Wintersportwoche 2026", "Aktiv"],
    ["Wintersportwoche 2025", "Archiviert"],
    ["Wintersportwoche 2027", "Inaktiv"],
  ])("shows %s with the state %s", (name, state) => {
    render(<SeasonList seasons={seasons} loading={false} error={null} />);

    const row = screen.getByText(name).closest("li");
    expect(row).toHaveTextContent(state);
  });

  it("tells the teacher when no season exists yet", () => {
    render(<SeasonList seasons={[]} loading={false} error={null} />);

    expect(screen.getByText(/noch keine saison/i)).toBeInTheDocument();
  });

  it("announces that it is still loading", () => {
    render(<SeasonList seasons={[]} loading error={null} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/noch keine saison/i)).not.toBeInTheDocument();
  });

  it("reports a failed read instead of pretending the list is empty", () => {
    render(<SeasonList seasons={[]} loading={false} error="Zugriff verweigert" />);

    expect(screen.getByRole("alert")).toHaveTextContent(/nicht geladen/i);
    expect(screen.queryByText(/noch keine saison/i)).not.toBeInTheDocument();
  });
});
