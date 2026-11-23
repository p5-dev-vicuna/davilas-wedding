#!/usr/bin/env bun
// Generates the branded Open Graph cards (public/og/<page>.png, 1200x630)
// and the apple-touch-icon (public/apple-touch-icon.png, 180x180) by
// screenshotting the build-time templates in scripts/og/ with the
// repo-installed Playwright chromium. Re-run whenever a page title changes:
//
//   bun run gen:og
//
// The templates load the site's real webfonts (Great Vibes, Cormorant
// Garamond) from Google Fonts, so this needs network access.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const TEMPLATE = pathToFileURL(
  path.join(import.meta.dir, "og", "og-template.html"),
).href;
const FAVICON_TEMPLATE = pathToFileURL(
  path.join(import.meta.dir, "og", "favicon-template.html"),
).href;

// og:title label per routed page (the serif smallcaps line on the card).
// The og:image file name matches the og:image URL each page carries —
// keep in sync with the <meta property="og:image"> tags in pages/*.html.
const OG_PAGES = [
  { name: "home", label: "Kendra & Nando" },
  { name: "about", label: "Get to Know Us" },
  { name: "rsvp", label: "RSVP" },
  { name: "address", label: "Mailing Address" },
  { name: "schedule", label: "Schedule" },
  { name: "travel", label: "Travel" },
  { name: "details", label: "Wedding Details" },
  { name: "wedding-party", label: "Wedding Party" },
  { name: "gallery", label: "Gallery" },
  { name: "gallery-years", label: "Through the Years" },
  { name: "gallery-proposal", label: "The Proposal" },
  { name: "gallery-engagement", label: "Engagement Photos" },
  { name: "faq", label: "FAQ" },
  { name: "registry", label: "Registry" },
  { name: "songs", label: "Song Requests" },
  { name: "privacy", label: "Privacy Policy" },
  { name: "terms", label: "Terms & Conditions" },
  { name: "404", label: "Page Not Found" },
];

const browser = await chromium.launch();
try {
  // 1200x630 OG cards — one per page.
  const ogContext = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const ogPage = await ogContext.newPage();
  for (const { name, label } of OG_PAGES) {
    await ogPage.goto(`${TEMPLATE}?label=${encodeURIComponent(label)}`);
    // Webfonts must be live before the shot or the script falls back.
    await ogPage.evaluate(() => document.fonts.ready);
    await ogPage.screenshot({
      path: path.join(ROOT, "public", "og", `${name}.png`),
    });
    console.log(`[gen:og] public/og/${name}.png (${label})`);
  }
  await ogContext.close();

  // 180x180 apple-touch-icon — full-bleed mirror of public/favicon.svg.
  const iconContext = await browser.newContext({
    viewport: { width: 180, height: 180 },
    deviceScaleFactor: 1,
  });
  const iconPage = await iconContext.newPage();
  await iconPage.goto(FAVICON_TEMPLATE);
  await iconPage.screenshot({
    path: path.join(ROOT, "public", "apple-touch-icon.png"),
  });
  console.log("[gen:og] public/apple-touch-icon.png (180x180)");
  await iconContext.close();
} finally {
  await browser.close();
}
