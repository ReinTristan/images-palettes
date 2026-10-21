import { describe, expect, it } from "vitest";
import type { Thumbnail } from "../src/input.ts";
import { rankThumbnails, scorePalette } from "../src/match.ts";
import { parseHexPalette } from "../src/reference.ts";

const thumb = (url: string): Thumbnail => ({ url });

describe("scorePalette", () => {
	it("is 0 for an identical palette", () => {
		const ref = parseHexPalette("#1a1a2e,#e94560");
		expect(scorePalette(ref, ref, 0.6).score).toBeCloseTo(0, 6);
	});

	it("penalizes a missing reference color via coverage", () => {
		const ref = parseHexPalette("#1a1a2e,#e94560");
		const onlyNavy = parseHexPalette("#1a1a2e");
		const { coverage, purity } = scorePalette(ref, onlyNavy, 0.6);
		expect(coverage).toBeGreaterThan(10);
		expect(purity).toBeCloseTo(0, 6);
	});

	it("ignores tiny image colors for coverage", () => {
		const ref = parseHexPalette("#e94560");
		const palette = [
			{ ...parseHexPalette("#00ff00")[0]!, weight: 0.99 },
			{ ...parseHexPalette("#e94560")[0]!, weight: 0.01 },
		];
		expect(scorePalette(ref, palette, 1).coverage).toBeGreaterThan(10);
	});
});

describe("rankThumbnails", () => {
	it("ranks the identical palette first and respects threshold/top", () => {
		const ref = parseHexPalette("#1a1a2e,#16213e,#e94560");
		const palettes = {
			exact: ref,
			close: parseHexPalette("#1c1c30,#18233f,#e5455e"),
			off: parseHexPalette("#ffd166,#06d6a0"),
		};
		const thumbs = ["off", "close", "exact", "missing"].map(thumb);

		const ranked = rankThumbnails(ref, thumbs, palettes, { alpha: 0.6, top: 10 });
		expect(ranked.map((r) => r.thumbnail.url)).toEqual(["exact", "close", "off"]);

		const filtered = rankThumbnails(ref, thumbs, palettes, { alpha: 0.6, top: 10, threshold: 5 });
		expect(filtered.map((r) => r.thumbnail.url)).toEqual(["exact", "close"]);

		expect(rankThumbnails(ref, thumbs, palettes, { alpha: 0.6, top: 1 })).toHaveLength(1);
	});
});
