import { getPalette } from "colorthief";
import { hexToLab, normalizeWeights } from "../color.ts";
import type { PaletteExtractor } from "./types.ts";

export function createColorthiefExtractor(k: number): PaletteExtractor {
	return {
		name: "colorthief",
		cacheKey: `colorthief-k${k}`,
		async extract(image) {
			const palette = await getPalette(image, {
				colorCount: Math.min(20, Math.max(2, k)),
				// Normalized images are tiny, so sample every pixel.
				quality: 1,
				colorSpace: "oklch",
				// White can be part of the palette we're looking for.
				ignoreWhite: false,
			});
			const colors = (palette ?? []).map((c) => ({ hex: c.hex(), lab: hexToLab(c.hex()), weight: c.proportion }));
			return normalizeWeights(colors).sort((a, b) => b.weight - a.weight);
		},
	};
}
