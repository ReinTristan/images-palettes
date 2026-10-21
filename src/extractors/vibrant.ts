import { Vibrant } from "node-vibrant/node";
import { hexToLab, normalizeWeights } from "../color.ts";
import type { PaletteExtractor } from "./types.ts";

export function createVibrantExtractor(): PaletteExtractor {
	return {
		name: "vibrant",
		cacheKey: "vibrant",
		async extract(image) {
			const palette = await Vibrant.from(image).getPalette();
			// Vibrant always fills the 6 roles; ones not really present come back null
			// or as generated colors with population 0, which aren't in the image.
			const swatches = Object.values(palette).filter((s) => s && s.population > 0);
			const colors = swatches.map((s) => ({ hex: s!.hex, lab: hexToLab(s!.hex), weight: s!.population }));
			return normalizeWeights(colors).sort((a, b) => b.weight - a.weight);
		},
	};
}
