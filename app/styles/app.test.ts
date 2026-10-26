import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const css = readFileSync(path.join(root, "app/styles/app.css"), "utf8");

// WI-015: the Ignyte look lives in the shadcn tokens of app.css.
describe("Ignyte theme (app/styles/app.css)", () => {
  it("uses the Ignyte orange for buttons and links, the bar orange and the soft orange", () => {
    expect(css).toMatch(/--primary:\s*#c2410c;/);
    expect(css).toMatch(/--ring:\s*#c2410c;/);
    expect(css).toMatch(/--accent-bar:\s*#d9661f;/);
    expect(css).toMatch(/--accent:\s*#fbe9df;/);
    expect(css).toMatch(/--background:\s*#ffffff;/);
  });

  it("has a light theme only", () => {
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).not.toMatch(/\.dark\b/);
    expect(css).toMatch(/color-scheme:\s*light;/);
  });

  it("loads Work Sans and IBM Plex Mono from the app's own /fonts, with font-display: swap", () => {
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
    expect(faces.map((f) => /font-family:\s*"([^"]+)"/.exec(f)?.[1])).toEqual(["Work Sans", "IBM Plex Mono", "IBM Plex Mono"]);
    for (const face of faces) {
      expect(face).toContain("font-display: swap");
      const url = /url\("(\/fonts\/[^"]+\.woff2)"\)/.exec(face)?.[1];
      expect(url, face).toBeDefined();
      expect(existsSync(path.join(root, "public", url!))).toBe(true);
    }
    expect(existsSync(path.join(root, "public/fonts/OFL-work-sans.txt"))).toBe(true);
    expect(existsSync(path.join(root, "public/fonts/OFL-ibm-plex-mono.txt"))).toBe(true);
    expect(css).toMatch(/--font-sans:\s*"Work Sans"/);
    expect(css).toMatch(/--font-mono:\s*"IBM Plex Mono"/);
  });
});
