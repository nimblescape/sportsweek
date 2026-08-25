import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards the Design Guidelines palette rule: neutrals everywhere, exactly one accent,
// and red reserved for warning dialogs / error messages.
const css = readFileSync("src/app/globals.css", "utf8");

/** The only tokens allowed to carry chroma: the single accent, and the danger colour. */
const CHROMATIC_TOKENS = ["--brand", "--destructive"];

function themeBlock(selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`No \`${selector}\` block found in globals.css`);
  return match[1];
}

function declarations(block: string): { name: string; value: string }[] {
  return [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => ({
    name,
    value: value.trim(),
  }));
}

/** Chroma of a literal `oklch(L C H)` value, or null when the value isn't a literal colour. */
function chroma(value: string): number | null {
  const match = value.match(/^oklch\(\s*[\d.]+%?\s+([\d.]+)/);
  return match ? Number(match[1]) : null;
}

describe.each([
  ["light", ":root"],
  ["dark", "\\.dark"],
])("%s theme palette", (_theme, selector) => {
  const decls = declarations(themeBlock(selector));

  it("defines the single accent colour token", () => {
    const brand = decls.find((d) => d.name === "--brand");
    expect(brand).toBeDefined();
    expect(chroma(brand!.value)).toBeGreaterThan(0);
  });

  it("introduces no colour beyond the accent and the danger token", () => {
    const chromatic = decls
      .filter((d) => (chroma(d.value) ?? 0) > 0)
      .map((d) => d.name)
      .sort();

    expect(chromatic).toEqual([...CHROMATIC_TOKENS].sort());
  });

  it("drives focus rings from the accent", () => {
    expect(decls.find((d) => d.name === "--ring")?.value).toContain("var(--brand)");
  });

  it("drives the primary/default button from the accent", () => {
    expect(decls.find((d) => d.name === "--primary")?.value).toContain("var(--brand)");
  });
});

describe("shared elevation token", () => {
  it("defines a card shadow in the theme layer", () => {
    expect(css).toMatch(/--shadow-card:/);
  });
});

describe("typography", () => {
  const fonts = declarations(themeBlock("@theme inline")).filter((d) =>
    d.name.startsWith("--font-"),
  );

  it("wires up a sans and a mono font token", () => {
    const names = fonts.map((f) => f.name);

    expect(names).toContain("--font-sans");
    expect(names).toContain("--font-mono");
  });

  it.each(["--font-sans", "--font-mono", "--font-heading"])(
    "does not point %s at itself",
    (name) => {
      const font = fonts.find((f) => f.name === name);

      expect(font?.value).not.toBe(`var(${name})`);
    },
  );

  it("points every font token at a variable that layout.tsx actually defines", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const themeTokens = new Set(fonts.map((f) => f.name));

    for (const font of fonts) {
      const referenced = font.value.match(/var\((--font-[\w-]+)\)/)?.[1];
      // Aliasing another theme token is fine; only loaded font variables need declaring.
      if (!referenced || themeTokens.has(referenced)) continue;

      expect(layout, `${font.name} -> ${referenced} is not declared in layout.tsx`).toContain(
        `variable: "${referenced}"`,
      );
    }
  });
});
