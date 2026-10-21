import type { PaletteColor } from "../color.ts";

export interface PaletteExtractor {
	name: ExtractorName;
	/** Includes the options that affect the output, so the cache invalidates when they change. */
	cacheKey: string;
	/** Receives the normalized PNG from `normalizeImage`. Returns colors sorted by weight, desc. */
	extract(image: Buffer): Promise<PaletteColor[]>;
}

export const EXTRACTOR_NAMES = ["kmeans", "vibrant", "colorthief"] as const;
export type ExtractorName = (typeof EXTRACTOR_NAMES)[number];

export interface ExtractorOptions {
	/** Palette size for kmeans and colorthief (vibrant always gives up to 6 swatches). */
	k: number;
}
