import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { distance, hexToLab } from "../src/color.ts";
import { createExtractor, EXTRACTOR_NAMES } from "../src/extractors/index.ts";
import { normalizeImage } from "../src/pixels.ts";

const RED = "#e94560";
const NAVY = "#1a1a2e";

/** 2/3 red on the left, 1/3 navy on the right. */
async function twoColorImage(width = 480, height = 270): Promise<Buffer> {
	const raw = Buffer.alloc(width * height * 3);
	const red = [233, 69, 96];
	const navy = [26, 26, 46];
	for (let i = 0; i < width * height; i++) raw.set((i % width) < (width * 2) / 3 ? red : navy, i * 3);
	return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe.each(EXTRACTOR_NAMES)("%s", (name) => {
	const extractor = createExtractor(name, { k: 6 });

	it("returns a non-empty palette whose weights sum to 1", async () => {
		const palette = await extractor.extract(await normalizeImage(await twoColorImage()));
		expect(palette.length).toBeGreaterThan(0);
		expect(palette.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 5);
	});

	it("finds both colors of a two-color image", async () => {
		const palette = await extractor.extract(await normalizeImage(await twoColorImage()));
		for (const hex of [RED, NAVY]) {
			const closest = Math.min(...palette.map((c) => distance(c.lab, hexToLab(hex))));
			expect(closest).toBeLessThan(5);
		}
	});
});

describe("kmeans", () => {
	it("collapses to the real colors with ~correct weights", async () => {
		const palette = await createExtractor("kmeans", { k: 6 }).extract(await normalizeImage(await twoColorImage()));
		// Resizing blends the column on the border, so a tiny 3rd cluster is fine; the rest must collapse.
		expect(palette.length).toBeLessThanOrEqual(3);
		expect(palette.slice(2).every((c) => c.weight < 0.02)).toBe(true);
		expect(distance(palette[0]!.lab, hexToLab(RED))).toBeLessThan(2);
		expect(distance(palette[1]!.lab, hexToLab(NAVY))).toBeLessThan(2);
		expect(palette[0]!.weight).toBeCloseTo(2 / 3, 1);
		expect(palette[1]!.weight).toBeCloseTo(1 / 3, 1);
	});

	it("is deterministic", async () => {
		const image = await normalizeImage(await twoColorImage());
		const extractor = createExtractor("kmeans", { k: 6 });
		expect(await extractor.extract(image)).toEqual(await extractor.extract(image));
	});
});

describe("normalizeImage", () => {
	it("crops the letterbox of 4:3 thumbnails", async () => {
		// 480x360 with 45px black bars top and bottom, like hqdefault.jpg
		const content = await twoColorImage(480, 270);
		const letterboxed = await sharp(content).extend({ top: 45, bottom: 45, background: "#000" }).png().toBuffer();
		const palette = await createExtractor("kmeans", { k: 6 }).extract(await normalizeImage(letterboxed));
		const black = hexToLab("#000000");
		expect(palette.every((c) => distance(c.lab, black) > 5)).toBe(true);
	});
});
