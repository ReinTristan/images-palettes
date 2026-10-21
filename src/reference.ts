import { hexToLab, type PaletteColor } from "./color.ts";
import type { PaletteExtractor } from "./extractors/index.ts";
import { loadImage } from "./fetcher.ts";
import { normalizeImage } from "./pixels.ts";

/** "#1a1a2e,#e94560" / "1a1a2e e94560" → palette with equal weights. */
export function parseHexPalette(value: string): PaletteColor[] {
	const hexes = value.split(/[\s,;]+/).filter(Boolean);
	if (!hexes.length) throw new Error("The palette is empty");
	return hexes.map((raw) => {
		const hex = raw.startsWith("#") ? raw.toLowerCase() : `#${raw.toLowerCase()}`;
		return { hex, lab: hexToLab(hex), weight: 1 / hexes.length };
	});
}

/** Reference palette from an image, using the same extractor as the ranking it's compared against. */
export async function paletteFromImage(source: string, extractor: PaletteExtractor): Promise<PaletteColor[]> {
	return extractor.extract(await normalizeImage(await loadImage(source)));
}
