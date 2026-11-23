import { beforeAll, afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PROPOSAL_MARKER,
  THROUGH_THE_YEARS_MARKER,
  injectGallerySections,
  renderProposal,
  renderThroughTheYears,
  scanGalleryYears,
  scanProposalPhotos,
} from "../../scripts/gallery-sections.mjs";

// A fixture drop-folder tree, built fresh in the OS temp dir per run:
//
//   <tmp>/public/images/gallery/through-the-years/{2017,2018,2019,2020}
//   <tmp>/public/images/gallery/proposal
//
// 2017 has both favorites, 2018 an uppercase HIS.JPG (case-insensitive
// match), 2019 only her.jpg, 2020 nothing. The proposal folder starts
// empty; the populated-proposal case fills it in place.
let publicRoot;
let galleryRoot;

async function touch(file) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "x"); // content never read — existence is the contract
}

beforeAll(async () => {
  publicRoot = await mkdtemp(path.join(tmpdir(), "davilas-gallery-"));
  galleryRoot = path.join(publicRoot, "images", "gallery");
  const yearsRoot = path.join(galleryRoot, "through-the-years");
  for (const year of ["2017", "2018", "2019", "2020"]) {
    await mkdir(path.join(yearsRoot, year), { recursive: true });
  }
  await touch(path.join(yearsRoot, "2017", "his.jpg"));
  await touch(path.join(yearsRoot, "2017", "her.jpg"));
  await touch(path.join(yearsRoot, "2018", "HIS.JPG"));
  await touch(path.join(yearsRoot, "2019", "her.jpg"));
  await mkdir(path.join(galleryRoot, "proposal"), { recursive: true });
});

afterAll(async () => {
  await rm(publicRoot, { recursive: true, force: true });
});

describe("scanGalleryYears", () => {
  it("returns only years with at least one favorite, in order", async () => {
    const years = await scanGalleryYears(galleryRoot);
    expect(years.map((y) => y.year)).toEqual(["2017", "2018", "2019"]);
  });

  it("matches his/her case-insensitively and reports the real filename", async () => {
    const years = await scanGalleryYears(galleryRoot);
    expect(years[0]).toEqual({
      year: "2017",
      his: "his.jpg",
      her: "her.jpg",
    });
    expect(years[1]).toEqual({ year: "2018", his: "HIS.JPG", her: null });
    expect(years[2]).toEqual({ year: "2019", his: null, her: "her.jpg" });
  });

  it("returns [] when the through-the-years tree is missing entirely", async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "davilas-empty-"));
    try {
      expect(await scanGalleryYears(emptyRoot)).toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });
});

describe("renderThroughTheYears", () => {
  it("renders each populated year in order with His/Hers pairs", async () => {
    const years = await scanGalleryYears(galleryRoot);
    const html = renderThroughTheYears(years);

    const i2017 = html.indexOf('data-testid="year-block-2017"');
    const i2018 = html.indexOf('data-testid="year-block-2018"');
    const i2019 = html.indexOf('data-testid="year-block-2019"');
    expect(i2017).toBeGreaterThan(-1);
    expect(i2018).toBeGreaterThan(i2017);
    expect(i2019).toBeGreaterThan(i2018);
    expect(html).not.toContain("2020"); // empty year skipped entirely

    expect(html).toContain(
      'src="/images/gallery/through-the-years/2017/his.jpg"',
    );
    expect(html).toContain(
      'src="/images/gallery/through-the-years/2017/her.jpg"',
    );
    expect(html).toContain(
      'src="/images/gallery/through-the-years/2019/her.jpg"',
    );
    expect(html).not.toContain('through-the-years/2019/his.jpg"');
    expect(html).toContain("His favorite");
    expect(html).toContain("Her favorite");
  });

  it("shows the coming-soon state when no year has photos", () => {
    const html = renderThroughTheYears([]);
    expect(html).toContain(
      'data-testid="gallery-coming-soon-through-the-years"',
    );
    expect(html).toContain("coming soon");
    expect(html).not.toContain("year-block");
  });
});

describe("scanProposalPhotos + renderProposal", () => {
  it("comes back empty and renders the coming-soon state", async () => {
    expect(await scanProposalPhotos(galleryRoot)).toEqual([]);
    const html = renderProposal([]);
    expect(html).toContain('data-testid="gallery-coming-soon-proposal"');
    expect(html).toContain("coming soon");
    expect(html).not.toContain("proposal-grid");
  });

  it("renders populated folders in numeric-aware name order, images only", async () => {
    const proposalDir = path.join(galleryRoot, "proposal");
    await Promise.all(
      [
        "c.jpg",
        "a.png",
        "b10.jpg",
        "b2.jpg",
        "README.md",
        ".gitkeep",
        "notes.txt",
      ].map((name) => touch(path.join(proposalDir, name))),
    );
    try {
      expect(await scanProposalPhotos(galleryRoot)).toEqual([
        "a.png",
        "b2.jpg",
        "b10.jpg",
        "c.jpg",
      ]);

      const html = renderProposal(await scanProposalPhotos(galleryRoot));
      expect(html).toContain('data-testid="proposal-grid"');
      const ia = html.indexOf("/proposal/a.png");
      const i2 = html.indexOf("/proposal/b2.jpg");
      const i10 = html.indexOf("/proposal/b10.jpg");
      const ic = html.indexOf("/proposal/c.jpg");
      expect(ia).toBeGreaterThan(-1);
      expect(i2).toBeGreaterThan(ia);
      expect(i10).toBeGreaterThan(i2);
      expect(ic).toBeGreaterThan(i10);
      expect(html).not.toContain("README.md");
      expect(html).not.toContain("notes.txt");
      expect(html).not.toContain("gallery-coming-soon");
    } finally {
      await rm(proposalDir, { recursive: true, force: true });
      await mkdir(proposalDir, { recursive: true });
    }
  });
});

describe("injectGallerySections", () => {
  it("replaces both placeholders with the scanned sections", async () => {
    const html = [
      "<main>",
      `  ${THROUGH_THE_YEARS_MARKER}`,
      `  ${PROPOSAL_MARKER}`,
      "</main>",
    ].join("\n");
    const out = await injectGallerySections(html, publicRoot);
    expect(out).not.toContain(THROUGH_THE_YEARS_MARKER);
    expect(out).not.toContain(PROPOSAL_MARKER);
    expect(out).toContain('data-testid="year-block-2017"');
    expect(out).toContain('data-testid="gallery-coming-soon-proposal"');
  });

  it("is a no-op for pages without the placeholders", async () => {
    const html = '<p class="lede">nothing to see</p>';
    expect(await injectGallerySections(html, publicRoot)).toBe(html);
  });
});
