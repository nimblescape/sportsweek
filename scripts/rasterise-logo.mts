/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/**
 * Rasterises `public/htl-logo.svg` into `public/htl-logo.png`.
 *
 * The spreadsheet export needs the logo as a bitmap: the xlsx format takes PNG, JPEG or GIF and
 * nothing else, while the PDF export draws the SVG itself. Run this again after changing the SVG:
 *
 *   npx tsx scripts/rasterise-logo.mts
 */
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = path.resolve(import.meta.dirname, "../public/htl-logo.svg");
const TARGET = path.resolve(import.meta.dirname, "../public/htl-logo.png");

// Three times the SVG's own 116.6 x 137.2, which keeps it crisp at the size a sheet shows it.
const WIDTH = 350;
const HEIGHT = 412;

const svg = await readFile(SOURCE, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

await page.setContent(
  `<body style="margin:0">${svg.replace("<svg", `<svg width="${WIDTH}" height="${HEIGHT}"`)}</body>`,
);
await writeFile(TARGET, await page.screenshot({ omitBackground: true }));
await browser.close();

console.log(`Wrote ${TARGET} (${WIDTH}x${HEIGHT})`);
